import asyncio
from contextlib import contextmanager
import io
from urllib.error import HTTPError

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.config import settings
from backend.routers import updates
from backend.services.update_activity import UpdateActivity, UpdateGuardMiddleware
from backend.services import update_release
from backend.services.update_installer import atomic_json
from backend.services.update_release import Release, UpdateError
from backend.services.update_service import UpdateService
from backend.version import VERSION, version_tuple

SHA = "a" * 40
DIGEST = "sha256:" + "b" * 64
HEADERS = {"Origin": "http://127.0.0.1:8000", "X-OpenVoiceChanger-Action": "update"}


@pytest.mark.parametrize("bad", ["v2.1.0", "02.1.0", "2.1", "2.1.0-beta", "2.1.0\n", "../../main", None, 2])
def test_rejects_non_stable_versions(bad):
    with pytest.raises(ValueError):
        version_tuple(bad)


def test_versions_are_compared_numerically():
    assert version_tuple("2.10.0") > version_tuple("2.9.99")


def release_metadata(**overrides):
    return {"tag_name": "v2.2.0", "draft": False, "prerelease": False,
            "assets": [{"name": "OpenVoiceChanger-frontend-v2.2.0.zip", "size": 100,
                        "digest": DIGEST, "state": "uploaded",
                        "browser_download_url": "http://untrusted.invalid/ignored"}], **overrides}


def test_only_fixed_release_and_commit_endpoints_are_used(monkeypatch):
    calls = []
    def get(url):
        calls.append(url)
        return {"sha": SHA} if "/commits/" in url else release_metadata()
    monkeypatch.setattr(update_release, "_get_json", get)
    release = update_release.latest_release()
    assert release.installable
    assert release.url == "https://github.com/sioaeko/OpenVoiceChanger/releases/tag/v2.2.0"
    assert calls == [update_release.API_URL + "/releases/latest", update_release.API_URL + "/commits/v2.2.0"]


@pytest.mark.parametrize("data", [release_metadata(draft=True), release_metadata(prerelease=True),
                                      release_metadata(tag_name="v2.2.0-beta"), release_metadata(tag_name="../../main")])
def test_unsupported_releases_are_not_offered(monkeypatch, data):
    monkeypatch.setattr(update_release, "_get_json", lambda url: data)
    with pytest.raises(UpdateError):
        update_release.latest_release()


def test_404_means_no_public_release(monkeypatch):
    def missing(url):
        raise HTTPError(url, 404, "not found", {}, io.BytesIO())
    monkeypatch.setattr(update_release, "_get_json", missing)
    assert update_release.latest_release() is None


def test_release_without_digest_can_notify_but_cannot_install(monkeypatch):
    data = release_metadata()
    data["assets"][0].pop("digest")
    monkeypatch.setattr(update_release, "_get_json", lambda url: {"sha": SHA} if "/commits/" in url else data)
    release = update_release.latest_release()
    assert release.version == "2.2.0"
    assert not release.installable


def test_downloader_rejects_a_hash_mismatch(tmp_path, monkeypatch):
    @contextmanager
    def response(url):
        assert url == "https://github.com/sioaeko/OpenVoiceChanger/releases/download/v2.2.0/OpenVoiceChanger-frontend-v2.2.0.zip"
        yield io.BytesIO(b"bad")
    monkeypatch.setattr(update_release, "_open", response)
    with pytest.raises(UpdateError, match="SHA-256"):
        update_release.download_release(Release("2.2.0", SHA, 3, DIGEST), tmp_path / "bundle.zip")


def test_update_gate_waits_for_work_and_recent_audio():
    clock = [0]
    gate = UpdateActivity(clock=lambda: clock[0])
    with gate.work():
        with pytest.raises(UpdateError, match="Stop audio"):
            gate.begin_update()
    with gate.work(audio=True):
        pass
    clock[0] = 2
    with pytest.raises(UpdateError):
        gate.begin_update()
    clock[0] = 3
    gate.begin_update()
    with pytest.raises(UpdateError):
        with gate.work():
            pass
    gate.set_maintenance(False)
    with gate.work():
        pass


@pytest.mark.anyio
async def test_check_cache_and_offline_state_do_not_invent_updates(tmp_path):
    calls = []
    service = UpdateService(tmp_path, enabled=False, checker=lambda: calls.append(1))
    await service.check()
    await service.check()
    state = await service.snapshot()
    assert calls == [1]
    assert state["status"] == "no_release"
    assert state["available"] is False
    service.checker = lambda: (_ for _ in ()).throw(UpdateError("Offline"))
    service._last_attempt = float("-inf")
    await service.check()
    state = await service.snapshot()
    assert state["status"] == "error"
    assert state["available"] is False
    assert state["check_error"] == "Offline"


@pytest.mark.anyio
async def test_concurrent_checks_share_one_network_request(tmp_path):
    calls = []
    service = UpdateService(tmp_path, enabled=False, checker=lambda: calls.append(1))
    await asyncio.gather(service.check(), service.check(), service.check())
    assert calls == [1]


@pytest.mark.anyio
async def test_same_and_older_releases_are_not_updates(tmp_path):
    service = UpdateService(tmp_path, enabled=False, checker=lambda: Release(VERSION, SHA))
    await service.check()
    assert (await service.snapshot())["available"] is False
    service.release = Release("1.0.0", SHA)
    assert (await service.snapshot())["available"] is False


def test_stale_runtime_file_cannot_enable_installation(tmp_path, monkeypatch):
    monkeypatch.delenv("OVC_UPDATE_INSTANCE", raising=False)
    service = UpdateService(tmp_path, enabled=False)
    atomic_json(service.installer.state_dir / "runtime.json", {"instance": "stale", "pid": 1})
    assert not service.managed()


@pytest.fixture
def api(tmp_path, monkeypatch):
    service = UpdateService(tmp_path, enabled=False, checker=lambda: Release("9.0.0", SHA, 100, DIGEST))
    service.instance = "test-launcher"
    monkeypatch.setattr(service, "managed", lambda: True)
    monkeypatch.setattr(service.installer, "preflight", lambda: SHA)
    app = FastAPI()
    app.state.updates = service
    app.add_middleware(UpdateGuardMiddleware)
    app.include_router(updates.router)
    @app.post("/api/work")
    async def work():
        return {"ok": True}
    return app, service


def test_get_status_never_performs_a_release_check_or_installs(api):
    app, service = api
    client = TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000))
    state = client.get("/api/updates").json()
    assert state["status"] == "not_checked"
    assert not (service.installer.state_dir / "request.json").exists()


@pytest.mark.parametrize("origin,host,peer,action", [
    ("http://evil.example", "127.0.0.1:8000", "127.0.0.1", "update"),
    ("http://evil.example:8000", "evil.example:8000", "127.0.0.1", "update"),
    ("http://127.0.0.1:8000", "127.0.0.1:8000", "192.168.1.2", "update"),
    ("null", "127.0.0.1:8000", "127.0.0.1", "update"),
    ("", "127.0.0.1:8000", "127.0.0.1", "update"),
    ("http://127.0.0.1:8000", "127.0.0.1:8000", "127.0.0.1", "star"),
    ("http://127.0.0.1:bad", "127.0.0.1:8000", "127.0.0.1", "update"),
    ("http://127.0.0.1:8000/path", "127.0.0.1:8000", "127.0.0.1", "update"),
])
def test_mutating_routes_reject_remote_and_rebinding_even_with_allow_any(api, monkeypatch, origin, host, peer, action):
    app, _ = api
    monkeypatch.setattr(settings, "ALLOW_ANY_ORIGIN", True)
    client = TestClient(app, base_url="http://127.0.0.1:8000", client=(peer, 50000))
    headers = {"Origin": origin, "Host": host, "X-OpenVoiceChanger-Action": action}
    assert client.post("/api/updates/check", headers=headers).status_code == 403
    assert client.post("/api/updates/install", headers=headers, json={"version": "9.0.0"}).status_code == 403


def test_update_is_explicit_version_pinned_and_blocks_work(api):
    app, service = api
    client = TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000))
    checked = client.post("/api/updates/check", headers=HEADERS)
    assert checked.status_code == 200
    assert checked.json()["available"] is True
    assert client.post("/api/work").status_code == 200
    assert client.post("/api/updates/install", headers=HEADERS, json={"version": "8.0.0"}).status_code == 409
    assert client.post("/api/updates/install", headers=HEADERS, json={"version": "9.0.0", "url": "http://evil"}).status_code == 422
    queued = client.post("/api/updates/install", headers=HEADERS, json={"version": "9.0.0"})
    assert queued.status_code == 202
    assert queued.json()["phase"] == "queued"
    assert service.activity.maintenance
    assert client.post("/api/work").status_code == 503
    assert client.post("/api/updates/install", headers=HEADERS, json={"version": "9.0.0"}).status_code == 409
    assert client.get("/api/updates").json()["busy"] is True


def test_install_cannot_interrupt_an_upload_or_audio_frame(api):
    app, service = api
    client = TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000))
    client.post("/api/updates/check", headers=HEADERS)
    with service.activity.work():
        assert client.post("/api/updates/install", headers=HEADERS, json={"version": "9.0.0"}).status_code == 409
    with service.activity.work(audio=True):
        pass
    assert client.post("/api/updates/install", headers=HEADERS, json={"version": "9.0.0"}).status_code == 409
    assert not (service.installer.state_dir / "request.json").exists()
