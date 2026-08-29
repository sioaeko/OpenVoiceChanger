import { describe, expect, it, vi } from 'vitest';
import { PEAK_DECAY, createMeterStore, levelToPercent, nextPeak, rms } from './meters';

describe('createMeterStore', () => {
  it('delivers the current value on subscribe', () => {
    const store = createMeterStore({ input: 0.5, output: 0 });
    const seen = [];
    store.subscribe((value) => seen.push(value.input));
    expect(seen).toEqual([0.5]);
  });

  it('notifies every subscriber on set and merges partial updates', () => {
    const store = createMeterStore({ input: 0, output: 0, recordSeconds: 0 });
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.set({ input: 0.25 });

    expect(a).toHaveBeenCalledTimes(2); // initial + update
    expect(b).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ input: 0.25, output: 0, recordSeconds: 0 });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createMeterStore({ input: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ input: 1 });
    expect(listener).toHaveBeenCalledTimes(1); // only the initial call
    expect(store.listenerCount).toBe(0);
  });

  it('keeps other subscribers alive when one throws', () => {
    const store = createMeterStore({ input: 0 });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const healthy = vi.fn();

    store.subscribe(() => {
      throw new Error('meter blew up');
    });
    store.subscribe(healthy);
    store.set({ input: 0.1 });

    expect(healthy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('rms', () => {
  it('is zero for silence and 1 for full-scale square', () => {
    expect(rms(new Float32Array(64))).toBe(0);
    expect(rms(Float32Array.from([1, -1, 1, -1]))).toBeCloseTo(1, 6);
  });

  it('handles empty and missing buffers', () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(null)).toBe(0);
  });
});

describe('levelToPercent', () => {
  it('applies the 3x meter gain and clamps to 0..100', () => {
    expect(levelToPercent(0)).toBe(0);
    expect(levelToPercent(0.1)).toBeCloseTo(30, 6);
    expect(levelToPercent(1)).toBe(100);
    expect(levelToPercent(-5)).toBe(0);
  });
});

describe('nextPeak', () => {
  it('rises instantly and decays slowly', () => {
    expect(nextPeak(10, 80)).toBe(80);
    expect(nextPeak(80, 0)).toBeCloseTo(80 * PEAK_DECAY, 6);
  });

  it('converges toward zero when the signal stops', () => {
    let peak = 100;
    for (let i = 0; i < 300; i += 1) peak = nextPeak(peak, 0);
    expect(peak).toBeLessThan(1);
  });
});
