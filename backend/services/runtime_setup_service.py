import os
import uuid

from backend.services.runtime_setup import SetupError, preflight, setup_directory
from backend.services.setup_manifest import PROFILE, SETUP_BUSY
from backend.services.update_installer import atomic_json, read_json


class RuntimeSetupService:
    def __init__(self, updates):
        self.updates = updates
        self.root = updates.root
        self.directory = setup_directory(self.root)

    def operation(self):
        state = read_json(self.directory / "state.json")
        return state if state.get("instance") == self.updates.instance and self.updates.managed() else {"phase": "idle"}

    def snapshot(self):
        plan = preflight(self.root)
        state = self.operation()
        self.updates.sync_activity()
        return {"plan": plan, "operation": state, "busy": state.get("phase") in SETUP_BUSY,
                "active_job": os.environ.get("OVC_RVC_SETUP_JOB"),
                "blocked": ("Start with python launch.py to use one-click setup." if not self.updates.managed()
                            else plan["blocked"])}

    async def install(self):
        async with self.updates._install_lock:
            snapshot = self.snapshot()
            if snapshot["blocked"]:
                raise SetupError(snapshot["blocked"])
            self.updates.activity.begin_update()
            state = {"instance": self.updates.instance, "job_id": uuid.uuid4().hex,
                     "profile": PROFILE, "phase": "queued"}
            try:
                atomic_json(self.directory / "state.json", state)
                atomic_json(self.directory / "request.json", state)
            except OSError as exc:
                atomic_json(self.directory / "state.json", {**state, "phase": "error", "error": "Unable to queue setup."})
                self.updates.sync_activity()
                raise SetupError("Unable to queue setup. The current runtime is unchanged.") from exc
            return state

    def cancel(self, job_id):
        state = self.operation()
        if state.get("job_id") != job_id or state.get("phase") not in SETUP_BUSY - {"switching", "restarting"}:
            raise SetupError("This installation can no longer be cancelled.")
        atomic_json(self.directory / "cancel.json", {"job_id": job_id})
        return {"cancel_requested": True}
