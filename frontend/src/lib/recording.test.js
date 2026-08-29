import { describe, expect, it } from 'vitest';
import {
  MAX_RECORD_SECONDS,
  appendRecordingChunk,
  estimateRecordingBytes,
  formatRecordLimit,
  maxRecordingSamples,
} from './recording';

describe('maxRecordingSamples', () => {
  it('scales the cap with the stream rate', () => {
    expect(maxRecordingSamples(48000)).toBe(48000 * MAX_RECORD_SECONDS);
    expect(maxRecordingSamples(40000)).toBe(40000 * MAX_RECORD_SECONDS);
  });

  it('returns zero for an unusable rate rather than an unbounded buffer', () => {
    expect(maxRecordingSamples(0)).toBe(0);
    expect(maxRecordingSamples(-1)).toBe(0);
    expect(maxRecordingSamples(NaN)).toBe(0);
    expect(maxRecordingSamples(undefined)).toBe(0);
  });
});

describe('appendRecordingChunk', () => {
  const limit = 10;

  it('accepts a chunk that fits', () => {
    const chunk = new Float32Array(4);
    const result = appendRecordingChunk(chunk, 0, limit);
    expect(result.accepted).toBe(chunk);
    expect(result.samples).toBe(4);
    expect(result.full).toBe(false);
  });

  it('reports full when a chunk lands exactly on the limit', () => {
    const result = appendRecordingChunk(new Float32Array(6), 4, limit);
    expect(result.samples).toBe(10);
    expect(result.full).toBe(true);
  });

  it('truncates the chunk that crosses the limit instead of dropping it', () => {
    const chunk = Float32Array.from([1, 2, 3, 4, 5, 6]);
    const result = appendRecordingChunk(chunk, 8, limit);
    expect(result.accepted).toHaveLength(2);
    expect(Array.from(result.accepted)).toEqual([1, 2]);
    expect(result.samples).toBe(limit);
    expect(result.full).toBe(true);
  });

  it('accepts nothing once the limit is reached', () => {
    const result = appendRecordingChunk(new Float32Array(4), limit, limit);
    expect(result.accepted).toBeNull();
    expect(result.samples).toBe(limit);
    expect(result.full).toBe(true);
  });

  it('treats a zero limit as immediately full', () => {
    const result = appendRecordingChunk(new Float32Array(4), 0, 0);
    expect(result.accepted).toBeNull();
    expect(result.full).toBe(true);
  });

  it('never exceeds the budget across a long run', () => {
    let samples = 0;
    for (let i = 0; i < 100; i += 1) {
      const { samples: next } = appendRecordingChunk(new Float32Array(3), samples, limit);
      samples = next;
    }
    expect(samples).toBe(limit);
  });
});

describe('estimateRecordingBytes', () => {
  it('counts the float32 capture buffer plus the 16-bit WAV', () => {
    expect(estimateRecordingBytes(1000)).toBe(1000 * 4 + 1000 * 2 + 44);
  });
});

describe('formatRecordLimit', () => {
  it('renders minutes and sub-minute limits', () => {
    expect(formatRecordLimit(600)).toBe('10 min');
    expect(formatRecordLimit(30)).toBe('30s');
  });
});
