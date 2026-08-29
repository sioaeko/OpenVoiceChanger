import { describe, expect, it } from 'vitest';
import {
  buildAudioConstraintCandidates,
  describeGetUserMediaError,
  getMediaDeviceSupport,
  isDeviceConstraintError,
  supportsOutputDeviceSelection,
} from './audioSupport';

describe('getMediaDeviceSupport', () => {
  it('accepts a browser that exposes getUserMedia', () => {
    const result = getMediaDeviceSupport({ mediaDevices: { getUserMedia() {} } }, true);
    expect(result.supported).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('explains the insecure-origin case, which is the usual LAN failure', () => {
    const result = getMediaDeviceSupport({}, false);
    expect(result.supported).toBe(false);
    expect(result.insecureContext).toBe(true);
    expect(result.reason).toMatch(/localhost/);
    expect(result.reason).toMatch(/HTTPS/i);
  });

  it('reports an unsupported browser separately from an insecure origin', () => {
    const result = getMediaDeviceSupport({}, true);
    expect(result.supported).toBe(false);
    expect(result.insecureContext).toBe(false);
    expect(result.reason).toMatch(/mediaDevices/);
  });

  it('handles mediaDevices present but getUserMedia missing', () => {
    expect(getMediaDeviceSupport({ mediaDevices: {} }, true).supported).toBe(false);
  });

  it('handles a missing navigator', () => {
    expect(getMediaDeviceSupport(undefined, true).supported).toBe(false);
  });
});

describe('supportsOutputDeviceSelection', () => {
  it('is true only when AudioContext exposes setSinkId', () => {
    class WithSink {}
    WithSink.prototype.setSinkId = () => {};
    class WithoutSink {}

    expect(supportsOutputDeviceSelection(WithSink)).toBe(true);
    expect(supportsOutputDeviceSelection(WithoutSink)).toBe(false);
    expect(supportsOutputDeviceSelection(undefined)).toBe(false);
  });
});

describe('describeGetUserMediaError', () => {
  it('maps each DOM error to actionable wording', () => {
    expect(describeGetUserMediaError({ name: 'NotAllowedError' })).toMatch(/permission denied/i);
    expect(describeGetUserMediaError({ name: 'NotFoundError' })).toMatch(/No microphone/i);
    expect(describeGetUserMediaError({ name: 'NotReadableError' })).toMatch(/in use/i);
    expect(describeGetUserMediaError({ name: 'AbortError' })).toMatch(/could not be started/i);
  });

  it('names the failing constraint for OverconstrainedError', () => {
    const message = describeGetUserMediaError({
      name: 'OverconstrainedError',
      constraint: 'deviceId',
    });
    expect(message).toMatch(/deviceId/);
    expect(message).toMatch(/Default Microphone/);
  });

  it('falls back to the raw message', () => {
    expect(describeGetUserMediaError({ message: 'boom' })).toBe('boom');
    expect(describeGetUserMediaError(undefined)).toMatch(/Failed to start/);
  });
});

describe('isDeviceConstraintError', () => {
  it('only retries for device-specific failures', () => {
    expect(isDeviceConstraintError({ name: 'OverconstrainedError' })).toBe(true);
    expect(isDeviceConstraintError({ name: 'NotFoundError' })).toBe(true);
    // Retrying a denied permission or a busy device would fail identically.
    expect(isDeviceConstraintError({ name: 'NotAllowedError' })).toBe(false);
    expect(isDeviceConstraintError({ name: 'NotReadableError' })).toBe(false);
  });
});

describe('buildAudioConstraintCandidates', () => {
  it('asks for the default device with processing disabled', () => {
    const candidates = buildAudioConstraintCandidates(undefined, 48000);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].audio.deviceId).toBeUndefined();
    expect(candidates[0].audio.echoCancellation).toBe(false);
    expect(candidates[0].audio.noiseSuppression).toBe(false);
    expect(candidates[0].audio.autoGainControl).toBe(false);
    expect(candidates[0].audio.channelCount).toBe(1);
    expect(candidates[0].audio.sampleRate).toBe(48000);
    expect(candidates[1].audio.sampleRate).toBeUndefined();
    expect(candidates[1].fallback).toBe('sample-rate');
  });

  it('relaxes the rate before giving up a pinned device', () => {
    const candidates = buildAudioConstraintCandidates('mic-1', 44100);
    expect(candidates).toHaveLength(4);
    expect(candidates[0].audio.deviceId).toEqual({ exact: 'mic-1' });
    expect(candidates[0].audio.sampleRate).toBe(44100);
    expect(candidates[0].fallback).toBeUndefined();
    expect(candidates[1].audio.deviceId).toEqual({ exact: 'mic-1' });
    expect(candidates[1].audio.sampleRate).toBeUndefined();
    expect(candidates[1].fallback).toBe('sample-rate');
    expect(candidates[2].audio.deviceId).toEqual({ ideal: 'mic-1' });
    expect(candidates[2].fallback).toBe('ideal');
    expect(candidates[3].audio.deviceId).toBeUndefined();
    expect(candidates[3].fallback).toBe('default');
  });

  it('omits the sample rate when none is known', () => {
    const [only] = buildAudioConstraintCandidates(undefined, 0);
    expect(only.audio.sampleRate).toBeUndefined();
  });

  it('does not duplicate the exact-device candidate without a requested rate', () => {
    const candidates = buildAudioConstraintCandidates('mic-1', 0);
    expect(candidates).toHaveLength(3);
    expect(candidates[0].audio.deviceId).toEqual({ exact: 'mic-1' });
    expect(candidates[1].audio.deviceId).toEqual({ ideal: 'mic-1' });
  });
});
