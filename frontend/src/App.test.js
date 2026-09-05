// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { fetchConfig, fetchPresets } from './lib/api';
import { CHUNK_SIZE, SAMPLE_RATE } from './lib/constants';

const state = vi.hoisted(() => ({
  ws: { status: 'disconnected', connect: vi.fn(), disconnect: vi.fn(), sendSettings: vi.fn(),
    setOnOpen: vi.fn(), setOnSettingsResponse: vi.fn(), resetLatency: vi.fn(), serverStats: {}, latencyHistory: [] },
  pipeline: { library: { unsaved: false }, isRunning: false, isRecording: false },
}));
vi.mock('./hooks/useWebSocket', () => ({ default: () => state.ws }));
vi.mock('./hooks/useAudioPipeline', () => ({ default: () => state.pipeline }));
vi.mock('./hooks/useAudioDevices', () => ({ default: () => ({}) }));
vi.mock('./hooks/useUpdates', () => ({ default: () => ({}) }));
vi.mock('./lib/api', () => ({
  fetchConfig: vi.fn(), fetchPresets: vi.fn(), savePreset: vi.fn(), deletePreset: vi.fn(),
  getActiveModel: vi.fn().mockResolvedValue(null),
}));
vi.mock('./components/Layout', () => ({ default: ({ children }) => children }));
vi.mock('./components/StatusIndicator', () => ({ default: () => null }));
vi.mock('./components/AudioControls', () => ({ default: () => null }));
vi.mock('./components/ModelManager', () => ({ default: () => null }));
vi.mock('./components/MonitorDisplay', () => ({ default: () => null }));
vi.mock('./components/Visualizer', () => ({ default: () => null }));
vi.mock('./components/VoiceLab', () => ({ default: ({ f0Methods, voice }) => React.createElement('output', { 'data-testid': 'voice' }, JSON.stringify({ f0Methods, voice })) }));
vi.mock('./components/EffectsRack', () => ({ default: () => null }));
vi.mock('./components/Recorder', () => ({ default: () => null }));
vi.mock('./components/FileConverter', () => ({ default: () => null }));
vi.mock('./components/GitHubStarButton', () => ({ default: () => null }));
vi.mock('./components/UpdateButton', () => ({ default: () => null }));
vi.mock('./components/GlobalSettings', () => ({ default: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('recovers capabilities and presets after reconnect without overwriting voice or transport settings', async () => {
  const stored = new Map();
  vi.stubGlobal('localStorage', { getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) });
  localStorage.setItem('ovc_global_settings', JSON.stringify({ sampleRate: 48000, chunkSize: 2048 }));
  localStorage.setItem('ovc_voice_v2', JSON.stringify({ pitch: 7, crepeHopLength: 512 }));
  fetchConfig.mockRejectedValue(new Error('offline'));
  fetchPresets.mockRejectedValue(new Error('offline'));
  const view = render(React.createElement(App));
  await waitFor(() => expect(state.ws.connect).toHaveBeenCalled());
  expect(await screen.findByText('Preset service unavailable')).toBeTruthy();
  fetchConfig.mockResolvedValue({ sample_rate: 32000, chunk_size: 8192,
    runtime: { rvc: { prerequisitesDetected: true, checks: [] } },
    f0_methods: [{ id: 'pm', available: true, realtime: true, offline: true }] });
  fetchPresets.mockResolvedValue({ builtin: [{ id: 'restored', name: 'Restored preset' }], user: [] });
  state.ws.status = 'connected';
  view.rerender(React.createElement(App));
  expect(await screen.findByRole('button', { name: 'Restored preset' })).toBeTruthy();
  const observed = JSON.parse(screen.getByTestId('voice').textContent);
  expect(observed.f0Methods.find((method) => method.id === 'pm').available).toBe(true);
  expect(observed.voice.pitch).toBe(7);
  expect(observed.voice.crepeHopLength).toBe(512);
  expect(SAMPLE_RATE).toBe(48000);
  expect(CHUNK_SIZE).toBe(2048);
});
