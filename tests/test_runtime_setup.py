import asyncio
import hashlib
import io
import re
import stat
from types import SimpleNamespace
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import launch
from backend.routers import runtime_setup as router
from backend.services import runtime_setup as runtime
from backend.services.hubert_checkpoint import load_hubert_checkpoint
from backend.services.runtime_setup_service import RuntimeSetupService
from backend.services.setup_manifest import ASSETS, PROFILE, SOURCES, UV
from backend.services.update_activity import UpdateGuardMiddleware
from backend.services.update_installer import atomic_json, read_json
from backend.services.update_release import UpdateError
from backend.services.update_service import UpdateService

JOB = "a" * 32
HEADERS = {"Origin": "http://127.0.0.1:8000", "X-OpenVoiceChanger-Action": "runtime-setup"}


@pytest.fixture
def service(tmp_path, monkeypatch):
    updates = UpdateService(tmp_path, enabled=False)
    updates.instance = "test-instance"
    monkeypatch.setattr(updates, "managed", lambda: True)
    monkeypatch.setattr(runtime.platform, "system", lambda: "Windows")
    monkeypatch.setattr(runtime.platform, "machine", lambda: "AMD64")
    monkeypatch.setattr(runtime.shutil, "disk_usage", lambda path: SimpleNamespace(free=10 * 1024**3))
    return RuntimeSetupService(updates)


@pytest.fixture
def client(service):
    app = FastAPI()
    app.state.updates = service.updates
    app.state.runtime_setup = service
    app.add_middleware(UpdateGuardMiddleware)
    app.include_router(router.router)
    @app.post('/api/work')
    async def work():
        return {"ok": True}
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000)) as test:
        yield test


def test_manifest_is_hash_pinned():
    for item in (*ASSETS, *SOURCES, UV):
        assert re.fullmatch(r"[0-9a-f]{64}", item["sha256"])
        assert runtime._trusted_url(item["url"])


@pytest.mark.parametrize('url', ['http://huggingface.co/a', 'https://huggingface.co.evil/a',
    'https://user@huggingface.co/a', 'https://huggingface.co:8080/a', 'https://127.0.0.1/a',
    'https://huggingface.co:bad/a', 'file:///a'])
def test_rejects_untrusted_download_url(url):
    assert not runtime._trusted_url(url)


@pytest.mark.parametrize('headers', [{}, {'Origin': 'https://evil.invalid', 'X-OpenVoiceChanger-Action': 'runtime-setup'},
                                      {**HEADERS, 'X-OpenVoiceChanger-Action': 'update'}])
def test_requires_explicit_local_action(client, headers):
    assert client.post('/api/runtime-setup/install', json={'profile': PROFILE}, headers=headers).status_code == 403


@pytest.mark.parametrize('payload', [{'profile': 'gpu'}, {'profile': PROFILE, 'command': 'anything'}, {}])
def test_no_arbitrary_commands_or_profiles(client, payload):
    assert client.post('/api/runtime-setup/install', json=payload, headers=HEADERS).status_code == 422


def test_queued_setup_excludes_work_and_duplicate_installs_but_allows_cancel(client, service):
    response = client.post('/api/runtime-setup/install', json={'profile': PROFILE}, headers=HEADERS)
    assert response.status_code == 202
    state = response.json()
    assert read_json(service.directory / 'request.json') == state
    assert client.get('/api/runtime-setup').json()['busy']
    asyncio.run(service.updates.snapshot())
    assert service.updates.activity.maintenance
    assert client.post('/api/work').status_code == 503
    assert client.post('/api/runtime-setup/install', json={'profile': PROFILE}, headers=HEADERS).status_code == 409
    assert client.post('/api/runtime-setup/cancel', json={'job_id': 'b' * 32}, headers=HEADERS).status_code == 409
    assert client.post('/api/runtime-setup/cancel', json={'job_id': state['job_id']}, headers=HEADERS).status_code == 202
    assert read_json(service.directory / 'cancel.json')['job_id'] == state['job_id']


def test_active_work_and_unmanaged_servers_cannot_install(client, service, monkeypatch):
    with service.updates.activity.work():
        assert client.post('/api/runtime-setup/install', json={'profile': PROFILE}, headers=HEADERS).status_code == 409
    monkeypatch.setattr(service.updates, 'managed', lambda: False)
    assert client.post('/api/runtime-setup/install', json={'profile': PROFILE}, headers=HEADERS).status_code == 409


def test_preflight_never_offers_unsupported_profile(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime.platform, 'system', lambda: 'Linux')
    assert 'Windows' in runtime.preflight(tmp_path)['blocked']
    monkeypatch.setattr(runtime.platform, 'system', lambda: 'Windows')
    monkeypatch.setattr(runtime.platform, 'machine', lambda: 'AMD64')
    monkeypatch.setattr(runtime.shutil, 'disk_usage', lambda path: SimpleNamespace(free=1))
    assert '6 GiB' in runtime.preflight(tmp_path)['blocked']


@pytest.mark.parametrize('bad', ['root/../escape', 'root/C:/escape', 'root/NUL', 'root/linked'])
def test_archive_rejects_unsafe_paths(tmp_path, bad):
    archive = tmp_path / 'source.zip'
    with zipfile.ZipFile(archive, 'w') as output:
        entry = zipfile.ZipInfo(bad)
        if bad.endswith('linked'):
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
        output.writestr(entry, 'unsafe')
    with pytest.raises(runtime.SetupError):
        runtime.unpack_source(archive, tmp_path / 'extracted')
    assert not (tmp_path / 'extracted').exists()


def test_only_inference_package_and_license_are_extracted(tmp_path):
    archive = tmp_path / 'source.zip'
    with zipfile.ZipFile(archive, 'w') as output:
        output.writestr('root/fairseq/__init__.py', '')
        output.writestr('root/LICENSE', 'license')
        link = zipfile.ZipInfo('root/examples/training/link')
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        output.writestr(link, '../../other')
    root = runtime.unpack_source(archive, tmp_path / 'extracted', 'fairseq')
    assert (root / 'LICENSE').is_file()
    assert (root / 'fairseq/__init__.py').is_file()
    assert not (root / 'examples').exists()


@pytest.mark.parametrize('mode', ['hash', 'oversize', 'cancel', 'success'])
def test_download_checks_and_cleans_partial_files(tmp_path, monkeypatch, mode):
    payload = b'checked bytes'
    class Response(io.BytesIO):
        headers = {'Content-Length': str(len(payload))}
    monkeypatch.setattr(runtime, 'build_opener', lambda *args: SimpleNamespace(open=lambda *args, **kw: Response(payload)))
    asset = {'name': 'asset.pt', 'url': 'https://huggingface.co/asset',
             'sha256': hashlib.sha256(payload if mode != 'hash' else b'other').hexdigest(),
             'limit': 1 if mode == 'oversize' else len(payload)}
    target = tmp_path / 'asset.pt'
    calls = []
    checks = iter([False, True])
    cancelled = (lambda: next(checks, True)) if mode == 'cancel' else lambda: False
    if mode == 'success':
        runtime.download_checked(asset, target, lambda *args: calls.append(args), cancelled)
        assert target.read_bytes() == payload
        assert calls[-1] == ('asset.pt', len(payload), len(payload))
    else:
        with pytest.raises(runtime.SetupError):
            runtime.download_checked(asset, target, lambda *args: None, cancelled)
        assert not target.exists()
    assert not target.with_suffix('.pt.part').exists()


def test_unknown_hubert_never_uses_unsafe_unpickling(tmp_path):
    path = tmp_path / 'hubert_base.pt'
    path.write_bytes(b'unknown')
    calls = []
    fake = SimpleNamespace(load=lambda source, **kw: calls.append((source.tell(), kw)) or {})
    load_hubert_checkpoint(fake, path)
    assert calls == [(0, {'map_location': 'cpu', 'weights_only': True})]


def fake_launcher(tmp_path, monkeypatch, health):
    launcher = launch.Launcher(tmp_path)
    events = []
    monkeypatch.setattr(launcher, 'stop', lambda: events.append('stop'))
    monkeypatch.setattr(launcher, 'start', lambda: events.append(read_json(launcher.setup_directory / 'active.json')))
    monkeypatch.setattr(launcher, 'healthy', lambda version: next(health))
    monkeypatch.setattr(launch, 'read_version', lambda root: '2.1.0')
    class Installer:
        def __init__(self, root, job_id, report):
            self.job = runtime.setup_job(root, job_id)
            self.report = report
        def prepare(self):
            self.job.mkdir(parents=True)
            return self.job
        def stage(self, phase):
            self.report(phase)
    monkeypatch.setattr(launch, 'RuntimeInstaller', Installer)
    return launcher, events


@pytest.mark.parametrize('success', [True, False])
def test_runtime_switch_and_failed_health_rollback(tmp_path, monkeypatch, success):
    launcher, events = fake_launcher(tmp_path, monkeypatch, iter([success, True]))
    launcher.setup_runtime({'instance': launcher.instance, 'profile': PROFILE, 'job_id': JOB})
    state = read_json(launcher.setup_directory / 'state.json')
    assert state['phase'] == ('complete' if success else 'error')
    assert read_json(launcher.setup_directory / 'active.json') == ({'job_id': JOB} if success else {})
    assert events == (['stop', {'job_id': JOB}] if success else ['stop', {'job_id': JOB}, 'stop', {}])


def test_interrupted_switch_restores_previous_selection(tmp_path):
    launcher = launch.Launcher(tmp_path)
    job = runtime.setup_job(tmp_path, JOB)
    atomic_json(job / 'rollback.json', {'previous': {}})
    atomic_json(launcher.setup_directory / 'active.json', {'job_id': JOB})
    atomic_json(launcher.setup_directory / 'state.json', {'phase': 'restarting', 'job_id': JOB})
    launcher.recover_setup()
    assert read_json(launcher.setup_directory / 'active.json') == {}
    assert read_json(launcher.setup_directory / 'state.json')['phase'] == 'error'


def test_invalid_active_runtime_fails_closed(tmp_path):
    atomic_json(runtime.setup_directory(tmp_path) / 'active.json', {'job_id': '../../escape'})
    with pytest.raises(runtime.SetupError):
        runtime.selected_runtime(tmp_path)


def test_managed_windows_venv_redirector_is_recognized(tmp_path, monkeypatch):
    from backend.services import update_service
    service = UpdateService(tmp_path, enabled=False)
    service.instance = 'instance'
    monkeypatch.setattr(update_service.os, 'getpid', lambda: 100)
    monkeypatch.setattr(update_service.os, 'getppid', lambda: 99)
    atomic_json(service.installer.state_dir / 'runtime.json', {'instance': 'instance', 'pid': 99})
    assert service.managed() == (update_service.os.name == 'nt')
    atomic_json(service.installer.state_dir / 'runtime.json', {'instance': 'other', 'pid': 99})
    assert not service.managed()
