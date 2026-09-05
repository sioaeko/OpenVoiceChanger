from contextlib import contextmanager
from threading import Lock
import time

from backend.services.update_release import UpdateError


class UpdateActivity:
    """Atomically exclude installation from audio frames and mutating API work."""

    def __init__(self, clock=time.monotonic):
        self._lock = Lock()
        self._clock = clock
        self._active = 0
        self._last_audio = float("-inf")
        self._maintenance = False

    @property
    def maintenance(self) -> bool:
        with self._lock:
            return self._maintenance

    @contextmanager
    def work(self, *, audio=False):
        with self._lock:
            if self._maintenance:
                raise UpdateError("An update is in progress. Please wait for the studio to restart.")
            self._active += 1
            if audio:
                self._last_audio = self._clock()
        try:
            yield
        finally:
            with self._lock:
                self._active -= 1
                if audio:
                    self._last_audio = self._clock()

    def begin_update(self):
        with self._lock:
            if self._maintenance:
                raise UpdateError("An update is already in progress.")
            if self._active or self._clock() - self._last_audio < 3:
                raise UpdateError("Stop audio routing and wait for uploads or conversions to finish.")
            self._maintenance = True

    def set_maintenance(self, value: bool):
        with self._lock:
            self._maintenance = value


class UpdateGuardMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        service = getattr(getattr(scope.get("app"), "state", None), "updates", None)
        guarded = (scope["type"] == "http" and service
                   and scope.get("method") in {"POST", "PUT", "PATCH", "DELETE"}
                   and scope.get("path", "").startswith("/api/")
                   and not scope.get("path", "").startswith(("/api/updates", "/api/runtime-setup")))
        if not guarded:
            return await self.app(scope, receive, send)
        try:
            with service.activity.work():
                # Hold the guard until the full response body has been sent.
                return await self.app(scope, receive, send)
        except UpdateError as exc:
            from starlette.responses import JSONResponse
            await JSONResponse({"detail": str(exc)}, status_code=503)(scope, receive, send)
