// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Blob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import useRecordingLibrary from './useRecordingLibrary';
import { createTakeStore } from '../lib/takes';

const recording = (name) => ({ fileName: `${name}.wav`, seconds: 1, size: 8, blob: new Blob(['RIFFtest']) });

beforeEach(() => {
  let next = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${next++}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('recording library lifecycle', () => {
  it('keeps earlier takes and restores renamed takes after remount', async () => {
    const store = createTakeStore(new IDBFactory());
    const first = renderHook(() => useRecordingLibrary(store));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    act(() => { first.result.current.addTake(recording('First')); first.result.current.addTake(recording('Second')); });
    await waitFor(() => expect(first.result.current.unsaved).toBe(false));
    expect(first.result.current.takes).toHaveLength(2);
    act(() => first.result.current.renameTake(first.result.current.takes[0], 'My take'));
    await waitFor(() => expect(first.result.current.unsaved).toBe(false));
    first.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    const second = renderHook(() => useRecordingLibrary(store));
    await waitFor(() => expect(second.result.current.takes).toHaveLength(2));
    expect(second.result.current.takes.some((take) => take.name === 'My take')).toBe(true);
    await act(() => second.result.current.deleteTake(second.result.current.takes[0]));
    expect(second.result.current.takes).toHaveLength(1);
    expect(await store.list()).toHaveLength(1);
  });

  it('retains downloadable output on quota failure and supports retry', async () => {
    const store = { list: vi.fn().mockResolvedValue([]), put: vi.fn().mockRejectedValue(new Error('QuotaExceededError')) };
    const { result } = renderHook(() => useRecordingLibrary(store));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.addTake(recording('Keep me')));
    await waitFor(() => expect(result.current.takes[0].pending).toBe(false));
    expect(result.current.unsaved).toBe(true);
    expect(result.current.takes[0].url).toMatch('blob:');
    store.put.mockResolvedValue(undefined);
    act(() => result.current.retrySave(result.current.takes[0]));
    await waitFor(() => expect(result.current.unsaved).toBe(false));
  });

  it('does not pretend to delete a durable take if the transaction fails', async () => {
    const store = { list: vi.fn().mockResolvedValue([]), put: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockRejectedValue(new Error('unavailable')) };
    const { result } = renderHook(() => useRecordingLibrary(store));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.addTake(recording('Keep me')));
    await waitFor(() => expect(result.current.unsaved).toBe(false));
    store.put.mockRejectedValue(new Error('QuotaExceededError'));
    act(() => result.current.renameTake(result.current.takes[0], 'Renamed'));
    await waitFor(() => expect(result.current.takes[0].pending).toBe(false));
    await act(() => result.current.deleteTake(result.current.takes[0]));
    expect(result.current.takes).toHaveLength(1);
    expect(result.current.error).toMatch('could not be deleted');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
