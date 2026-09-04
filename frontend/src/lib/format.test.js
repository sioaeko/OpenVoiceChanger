import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatFileTimestamp } from './format';

describe('formatBytes', () => {
  it('scales through the binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(48 * 1024)).toBe('48 KB');
    expect(formatBytes(1.5 * 1024 ** 2)).toBe('1.5 MB');
    expect(formatBytes(2.25 * 1024 ** 3)).toBe('2.25 GB');
  });

  it('drops a meaningless trailing zero', () => {
    expect(formatBytes(55 * 1024 ** 2)).toBe('55 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3 GB');
  });

  it('never throws on garbage', () => {
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(-40)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('adds hours only when needed', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('treats invalid input as zero', () => {
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
  });
});

describe('formatFileTimestamp', () => {
  it('produces a sortable, filename-safe local stamp', () => {
    const stamp = formatFileTimestamp(new Date(2026, 8, 4, 14, 7, 32));
    expect(stamp).toBe('2026-09-04_14-07-32');
    expect(stamp).toMatch(/^[\d_-]+$/);
  });
});
