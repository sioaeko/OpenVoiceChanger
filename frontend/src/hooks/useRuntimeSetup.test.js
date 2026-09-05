// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import useRuntimeSetup from './useRuntimeSetup';
import { fetchRuntimeSetup, installRuntime, cancelRuntimeSetup } from '../lib/api';

vi.mock('../lib/api', () => ({ fetchRuntimeSetup: vi.fn(), installRuntime: vi.fn(), cancelRuntimeSetup: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  fetchRuntimeSetup.mockResolvedValue({ busy: false, operation: { phase: 'idle' } });
});
afterEach(cleanup);

it('prevents duplicate install requests and blocks active audio', async () => {
  let finish;
  installRuntime.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(({ blocked }) => useRuntimeSetup(blocked), { initialProps: { blocked: 'Audio active' } });
  await waitFor(() => expect(result.current.state).toBeTruthy());
  await act(() => result.current.install());
  expect(installRuntime).not.toHaveBeenCalled();
  rerender({ blocked: null });
  act(() => { result.current.install(); result.current.install(); });
  expect(installRuntime).toHaveBeenCalledOnce();
  fetchRuntimeSetup.mockResolvedValue({ busy: true, operation: { phase: 'queued', job_id: 'a' } });
  await act(async () => finish({ phase: 'queued', job_id: 'a' }));
  expect(result.current.busy).toBe(true);
});

it('retains installation state during restart and cancels the exact job', async () => {
  fetchRuntimeSetup.mockResolvedValue({ busy: true, operation: { phase: 'assets', job_id: 'selected' } });
  cancelRuntimeSetup.mockResolvedValue({ cancel_requested: true });
  const { result } = renderHook(() => useRuntimeSetup(null));
  await waitFor(() => expect(result.current.busy).toBe(true));
  fetchRuntimeSetup.mockRejectedValue(new Error('offline'));
  await act(() => result.current.cancel());
  await waitFor(() => expect(result.current.offline).toBe(true));
  expect(result.current.busy).toBe(true);
  expect(cancelRuntimeSetup).toHaveBeenCalledWith('selected', { timeoutMs: 10000 });
});
