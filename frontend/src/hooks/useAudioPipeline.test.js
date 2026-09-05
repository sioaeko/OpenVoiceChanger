// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useAudioPipeline from './useAudioPipeline';

vi.mock('./useRecordingLibrary', () => ({ default: () => library }));
const library = { addTake: vi.fn(), unsaved: false, takes: [] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('refuses to capture on a default sink when selected output routing fails', async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  class Context {
    sampleRate = 48000;
    state = 'suspended';
    close = close;
    async setSinkId() { throw new DOMException('sink permission denied', 'NotAllowedError'); }
  }
  vi.stubGlobal('AudioContext', Context);
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const ws = { sendAudio: vi.fn(), setOnAudioReceived: vi.fn(), setStreamSampleRate: vi.fn() };
  const { result } = renderHook(() => useAudioPipeline(ws));
  await act(async () => {
    await expect(result.current.start('', 'virtual-cable')).rejects.toThrow('selected output device');
  });
  expect(close).toHaveBeenCalledTimes(1);
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(result.current.isRunning).toBe(false);
});
