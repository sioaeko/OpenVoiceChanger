"""Model lifecycle endpoints must not stall the event loop.

Activating an RVC model runs torch.load, loads HuBERT and does a warm-up
inference. Calling that synchronously from an async handler blocks the single
event loop thread, which freezes the live audio WebSocket and every other
request for the whole load. These endpoints hand the work to a thread instead.
"""

import asyncio
import time

import httpx
import pytest

from backend.main import app
from backend.routers.websocket import _send_status

# How long the fake load blocks for, and how quickly an unrelated request
# should still be served while it runs.
LOAD_SECONDS = 1.0
RESPONSIVE_LIMIT = LOAD_SECONDS * 0.5


class SleepingManager:
    """Stands in for a real load: synchronous and slow, like torch.load."""

    def __init__(self, seconds=LOAD_SECONDS):
        self.seconds = seconds
        self.calls = []

    def activate_model(self, name):
        self.calls.append(("activate", name))
        time.sleep(self.seconds)
        return {"name": name, "type": "rvc", "status": "active", "details": None}

    def delete_model(self, name):
        self.calls.append(("delete", name))
        time.sleep(self.seconds)

    def deactivate_model(self):
        self.calls.append(("deactivate",))
        time.sleep(self.seconds)

    def get_active_model(self):
        return None

    def list_models(self):
        return []


class SleepingReadManager(SleepingManager):
    """Slow metadata reads model contention on ModelManager's lifecycle lock."""

    def get_active_model(self):
        time.sleep(self.seconds)
        return None

    def list_models(self):
        time.sleep(self.seconds)
        return []


class FailingManager(SleepingManager):
    """Raises the same exception types the real manager raises."""

    def __init__(self, exc):
        super().__init__(seconds=0.0)
        self.exc = exc

    def activate_model(self, name):
        raise self.exc

    def delete_model(self, name):
        raise self.exc


async def _measure_responsiveness(client, request_coro_factory):
    """Time an unrelated /health against a slow lifecycle call.

    The probe's clock starts *before* the blocking work does. Timing the
    /health call itself would prove nothing: a blocked loop cannot even begin
    the probe, so the request looks instant once it finally runs. What matters
    is when the probe *finishes* relative to the start of the whole operation —
    with a stalled loop that cannot happen until the load completes.
    """
    t0 = time.perf_counter()
    probe_result = {}

    async def probe():
        # Schedule the probe inside the load window.
        await asyncio.sleep(LOAD_SECONDS * 0.2)
        response = await client.get("/health")
        probe_result["seconds"] = time.perf_counter() - t0
        probe_result["status"] = response.status_code

    probe_task = asyncio.ensure_future(probe())
    # Let the probe reach its timer before the heavy call gets a chance to block.
    await asyncio.sleep(0)
    result = await request_coro_factory()
    await probe_task
    return result, probe_result


@pytest.fixture
def client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://ovc.test")


@pytest.fixture
def manager():
    previous = getattr(app.state, "model_manager", None)
    slow = SleepingManager()
    app.state.model_manager = slow
    yield slow
    if previous is None:
        del app.state.model_manager
    else:
        app.state.model_manager = previous


class TestEventLoopStaysResponsive:
    @pytest.mark.anyio
    async def test_during_activation(self, client, manager):
        async with client:
            result, probe = await _measure_responsiveness(
                client, lambda: client.post("/api/models/demo.pth/activate")
            )

        assert result.status_code == 200
        assert manager.calls == [("activate", "demo.pth")]
        assert probe["status"] == 200
        assert probe["seconds"] < RESPONSIVE_LIMIT, (
            f"/health waited {probe['seconds']:.2f}s during a {LOAD_SECONDS}s "
            "activation — the event loop is blocked"
        )

    @pytest.mark.anyio
    async def test_during_deletion(self, client, manager):
        async with client:
            result, probe = await _measure_responsiveness(
                client, lambda: client.delete("/api/models/demo.pth")
            )

        assert result.status_code == 200
        assert probe["seconds"] < RESPONSIVE_LIMIT

    @pytest.mark.anyio
    async def test_during_deactivation(self, client, manager):
        async with client:
            result, probe = await _measure_responsiveness(
                client, lambda: client.post("/api/models/deactivate")
            )

        assert result.status_code == 200
        assert probe["seconds"] < RESPONSIVE_LIMIT

    @pytest.mark.anyio
    @pytest.mark.parametrize("path", ["/api/models/active", "/api/models/"])
    async def test_during_model_metadata_reads(self, client, path):
        previous = getattr(app.state, "model_manager", None)
        app.state.model_manager = SleepingReadManager()
        try:
            async with client:
                result, probe = await _measure_responsiveness(
                    client, lambda: client.get(path)
                )
            assert result.status_code == 200
            assert probe["status"] == 200
            assert probe["seconds"] < RESPONSIVE_LIMIT
        finally:
            if previous is None:
                del app.state.model_manager
            else:
                app.state.model_manager = previous

    @pytest.mark.anyio
    async def test_during_websocket_status_read(self):
        manager = SleepingReadManager()
        sent = []

        class FakeWebSocket:
            async def send_json(self, payload):
                sent.append(payload)

        state = {
            "latency_ms": 0.0,
            "model_ms": 0.0,
            "dsp_ms": 0.0,
            "mode": "dsp",
            "bypass": False,
            "effects": {},
            "formant_shift": 0.0,
        }
        t0 = time.perf_counter()
        probe_result = {}

        async def probe():
            await asyncio.sleep(LOAD_SECONDS * 0.2)
            probe_result["seconds"] = time.perf_counter() - t0

        probe_task = asyncio.create_task(probe())
        await asyncio.sleep(0)
        await _send_status(FakeWebSocket(), manager, state)
        await probe_task

        assert sent and sent[0]["type"] == "status"
        assert probe_result["seconds"] < RESPONSIVE_LIMIT


class TestContractsPreserved:
    """Moving work to a thread must not change status codes or error bodies."""

    @pytest.fixture
    def failing(self, request):
        previous = getattr(app.state, "model_manager", None)
        app.state.model_manager = FailingManager(request.param)
        yield
        if previous is None:
            del app.state.model_manager
        else:
            app.state.model_manager = previous

    @pytest.mark.anyio
    @pytest.mark.parametrize("failing", [FileNotFoundError("nope")], indirect=True)
    async def test_activate_missing_model_is_404(self, client, failing):
        async with client:
            response = await client.post("/api/models/ghost.pth/activate")
        assert response.status_code == 404
        assert "ghost.pth" in response.json()["detail"]

    @pytest.mark.anyio
    @pytest.mark.parametrize("failing", [RuntimeError("checkpoint refused")], indirect=True)
    async def test_activate_load_failure_is_500_with_the_reason(self, client, failing):
        async with client:
            response = await client.post("/api/models/bad.pth/activate")
        assert response.status_code == 500
        # The safe-checkpoint refusal message must still reach the user.
        assert "checkpoint refused" in response.json()["detail"]

    @pytest.mark.anyio
    @pytest.mark.parametrize("failing", [FileNotFoundError("nope")], indirect=True)
    async def test_delete_missing_model_is_404(self, client, failing):
        async with client:
            response = await client.delete("/api/models/ghost.pth")
        assert response.status_code == 404

    @pytest.mark.anyio
    @pytest.mark.parametrize("failing", [OSError("disk on fire")], indirect=True)
    async def test_delete_failure_is_500(self, client, failing):
        async with client:
            response = await client.delete("/api/models/demo.pth")
        assert response.status_code == 500

    @pytest.mark.anyio
    async def test_activate_returns_the_manager_payload(self, client, manager):
        async with client:
            response = await client.post("/api/models/demo.pth/activate")
        assert response.json()["status"] == "active"
        assert response.json()["name"] == "demo.pth"

    @pytest.mark.anyio
    async def test_deactivate_returns_its_status(self, client, manager):
        async with client:
            response = await client.post("/api/models/deactivate")
        assert response.json() == {"status": "deactivated"}

    @pytest.mark.anyio
    async def test_missing_manager_is_still_503(self, client):
        previous = getattr(app.state, "model_manager", None)
        app.state.model_manager = None
        try:
            async with client:
                response = await client.post("/api/models/demo.pth/activate")
            assert response.status_code == 503
        finally:
            if previous is None:
                del app.state.model_manager
            else:
                app.state.model_manager = previous


class TestManagerLockSemantics:
    """Concurrent lifecycle calls still serialise on ModelManager's own lock."""

    @pytest.mark.anyio
    async def test_two_activations_do_not_overlap(self, client):
        import threading

        overlaps = []
        lock = threading.Lock()
        inside = {"count": 0}

        class LockedManager(SleepingManager):
            def activate_model(self, name):
                # Mirrors ModelManager.activate_model holding self._lock.
                with lock:
                    inside["count"] += 1
                    if inside["count"] > 1:
                        overlaps.append(name)
                    time.sleep(0.2)
                    inside["count"] -= 1
                return {"name": name, "status": "active"}

        previous = getattr(app.state, "model_manager", None)
        app.state.model_manager = LockedManager()
        try:
            async with client:
                results = await asyncio.gather(
                    client.post("/api/models/a.pth/activate"),
                    client.post("/api/models/b.pth/activate"),
                )
            assert all(r.status_code == 200 for r in results)
            assert overlaps == [], "activations must not run concurrently"
        finally:
            if previous is None:
                del app.state.model_manager
            else:
                app.state.model_manager = previous
