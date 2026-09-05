// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import useWebSocket from './useWebSocket';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('reports congestion without waiting for replies and discards late audio after reset', () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const sockets = [];
  class Socket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 0;
    send = vi.fn();
    constructor() { sockets.push(this); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  vi.stubGlobal('WebSocket', Socket);
  const { result } = renderHook(() => useWebSocket());
  act(() => result.current.connect());
  const socket = sockets[0];
  act(() => { socket.readyState = 1; socket.onopen(); });
  const audio = vi.fn();
  act(() => result.current.setOnAudioReceived(audio));
  act(() => {
    for (let seq = 0; seq < 6; seq++) {
      now = seq * 300;
      result.current.sendAudio(new Float32Array([0.5]), seq);
    }
  });
  expect(result.current.transport.pending).toBe(2);
  expect(result.current.transport.dropped).toBe(3);
  const frame = new ArrayBuffer(12);
  const view = new DataView(frame);
  view.setUint32(0, 0, true);
  view.setFloat32(8, 0.5, true);
  act(() => result.current.resetLatency());
  act(() => socket.onmessage({ data: frame }));
  expect(audio).not.toHaveBeenCalled();
  expect(result.current.transport.dropped).toBe(0);
  act(() => result.current.sendAudio(new Float32Array([0.5]), 6));
  view.setUint32(0, 6, true);
  act(() => { now += 15; socket.onmessage({ data: frame }); });
  expect(audio).toHaveBeenCalledTimes(1);
  act(() => result.current.disconnect());
});
