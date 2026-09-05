import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import UpdateButton from '../components/UpdateButton';
import UpdatePanel from '../components/UpdatePanel';
import { APP_VERSION, canReloadAfterUpdate, localUpdateBlock, releaseUrl, updatePresentation } from './updates';

const available = {
  current_version: '2.1.0', available: true, busy: false, status: 'available',
  latest: { version: '2.2.0', installable: true }, operation: { phase: 'idle' },
};

function render(Component, state, extra = {}) {
  const updates = { state, ...updatePresentation(state, { clientVersion: '2.1.0' }), ...extra };
  return renderToStaticMarkup(React.createElement(Component, { updates }));
}

describe('update notification', () => {
  it('embeds the same version used by the server and release packager', () => {
    expect(APP_VERSION).toBe(readFileSync(new URL('../../../VERSION', import.meta.url), 'utf8').trim());
  });
  it('stays hidden until a real newer release exists', () => {
    expect(render(UpdateButton, null)).toBe('');
    expect(render(UpdateButton, { ...available, available: false, status: 'no_release' })).toBe('');
    expect(render(UpdateButton, { ...available, available: false, status: 'error' })).toBe('');
  });

  it('offers an explicit available-update button with an accessible version', () => {
    const html = render(UpdateButton, available);
    expect(html).toContain('Update available: v2.2.0');
    expect(html).toContain('Update available</span>');
    expect(html).not.toContain('animate-spin');
  });

  it('shows progress without a made-up percentage', () => {
    const html = render(UpdatePanel, { ...available, busy: true, operation: { phase: 'verifying' } });
    expect(html).toContain('Verifying downloaded files');
    expect(html).not.toContain('Update and restart');
    expect(html).not.toContain('%');
  });

  it('does not confuse the reload command with the reload-needed state', () => {
    const html = render(UpdatePanel, available, { reload: vi.fn() });
    expect(html).toContain('Update and restart');
    expect(html).not.toContain('Reload to finish');
  });

  it('explains blocked installs and does not hide release notes', () => {
    const html = render(UpdatePanel, { ...available, install_blocked: 'Local code changes detected.' });
    expect(html).toContain('Local code changes detected.');
    expect(html).toContain('disabled="" aria-describedby="update-install-note"');
    expect(html).toContain('Release notes');
  });

  it('warns before an explicit restart and never auto-renders a prompt', () => {
    const html = render(UpdatePanel, available);
    expect(html).toContain('Restarts this studio. Models, presets and saved settings are kept.');
    expect(html).not.toContain('role="dialog"');
  });

  it('shows reload-needed after the server moves to the new version', () => {
    const state = { ...available, available: false, current_version: '2.2.0', operation: { phase: 'complete' } };
    expect(updatePresentation(state, { clientVersion: '2.1.0' }).needsReload).toBe(true);
    expect(render(UpdatePanel, state)).toContain('Reload to finish');
  });

  it('does not display an up-to-date claim when GitHub could not be checked', () => {
    const html = render(UpdatePanel, { ...available, available: false, status: 'error', check_error: 'Offline' });
    expect(html).toContain('Offline');
    expect(html).not.toContain('You are up to date');
  });
});

describe('restart safety', () => {
  it('blocks audio and unsaved output', () => {
    expect(localUpdateBlock({ isStarting: true })).toMatch('microphone setup');
    expect(localUpdateBlock({ isRecording: true })).toMatch('Stop recording');
    expect(localUpdateBlock({ isRunning: true })).toMatch('Stop audio');
    expect(localUpdateBlock({ lastRecording: {} })).toMatch('download unsaved takes');
    expect(localUpdateBlock({ lastRecording: false })).toBeNull();
    expect(localUpdateBlock({ converterBlock: 'Download the converted audio.' })).toMatch('converted audio');
    expect(localUpdateBlock({})).toBeNull();
  });

  it('reloads only its own successful, verified update with no unsaved audio', () => {
    const requested = { job_id: 'mine', version: '2.2.0' };
    const state = { current_version: '2.2.0', busy: false, operation: { phase: 'complete', job_id: 'mine' } };
    expect(canReloadAfterUpdate(state, requested, null)).toBe(true);
    expect(canReloadAfterUpdate(state, requested, 'unsaved recording')).toBe(false);
    expect(canReloadAfterUpdate(state, null, null)).toBe(false);
    expect(canReloadAfterUpdate(state, { ...requested, job_id: 'another tab' }, null)).toBe(false);
    expect(canReloadAfterUpdate({ ...state, current_version: '2.1.0' }, requested, null)).toBe(false);
    expect(canReloadAfterUpdate({ ...state, operation: { ...state.operation, phase: 'rolled_back' } }, requested, null)).toBe(false);
  });

  it('only creates fixed GitHub release links from valid versions', () => {
    expect(releaseUrl('2.2.0')).toBe('https://github.com/sioaeko/OpenVoiceChanger/releases/tag/v2.2.0');
    expect(releaseUrl('javascript:alert(1)')).toBeNull();
    expect(releaseUrl('../../elsewhere')).toBeNull();
  });
});

describe('update API', () => {
  let api;
  beforeAll(async () => {
    globalThis.location = { protocol: 'http:', host: 'localhost:8000' };
    api = await import('./api');
  });

  it('sends version-only JSON with both the action and content-type headers', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '{"phase":"queued"}' }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    await api.installUpdate('2.2.0', { signal });
    expect(fetchMock).toHaveBeenCalledWith('/api/updates/install', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-OpenVoiceChanger-Action': 'update' },
      body: '{"version":"2.2.0"}',
    });
    vi.unstubAllGlobals();
  });

  it('uses read-only, uncached status polling and a separate explicit check', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '{}' }));
    vi.stubGlobal('fetch', fetchMock);
    await api.fetchUpdateState();
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
    await api.checkForUpdates();
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][1].headers['X-OpenVoiceChanger-Action']).toBe('update');
    vi.unstubAllGlobals();
  });
});
