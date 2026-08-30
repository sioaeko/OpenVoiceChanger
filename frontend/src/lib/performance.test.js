import { describe, expect, it } from 'vitest';
import {
  bufferDurationMs,
  percentile,
  profileForChunkSize,
  recommendPerformanceProfile,
} from './performance';

function recommendation(overrides = {}) {
  return recommendPerformanceProfile({
    latencyHistory: Array(12).fill(45),
    sampleRate: 40000,
    serverMs: 30,
    serverStats: { modelMs: 25, dspMs: 4, inferenceSleeping: false },
    isRunning: true,
    ...overrides,
  });
}

describe('performance profile recommendation', () => {
  it('chooses the smallest buffer with measured headroom', () => {
    expect(recommendation().profile.id).toBe('responsive');
  });

  it('moves to balanced when the responsive budget is too tight', () => {
    const result = recommendation({
      latencyHistory: Array(12).fill(90),
      serverMs: 65,
      serverStats: { modelMs: 60, dspMs: 5 },
    });
    expect(result.profile.id).toBe('balanced');
  });

  it('chooses stable for heavy processing and marks overload', () => {
    const result = recommendation({
      latencyHistory: Array(12).fill(360),
      serverMs: 190,
      serverStats: { modelMs: 185, dspMs: 5 },
    });
    expect(result.profile.id).toBe('stable');
    expect(result.constrained).toBe(true);
  });

  it('waits for enough live samples and ignores sleeping inference', () => {
    expect(recommendation({ latencyHistory: [30, 31] }).ready).toBe(false);
    expect(recommendation({ serverStats: { modelMs: 0, dspMs: 2, inferenceSleeping: true } }).ready).toBe(false);
    expect(recommendation({ isRunning: false }).ready).toBe(false);
  });
});

describe('performance helpers', () => {
  it('calculates buffer duration and preserves custom chunk sizes', () => {
    expect(bufferDurationMs(2048, 40000)).toBeCloseTo(51.2);
    expect(profileForChunkSize(4096).id).toBe('balanced');
    expect(profileForChunkSize(1024).id).toBe('custom');
  });

  it('uses a nearest-rank percentile', () => {
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
  });
});
