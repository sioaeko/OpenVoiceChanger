// Browser capability probing and error translation for the audio pipeline.
//
// Everything here is a pure function over injected globals so the pipeline can
// give an accurate, actionable message instead of throwing an opaque DOM error
// — and so the rules can be tested without a browser.

/** Why getUserMedia is unavailable, in words a user can act on. */
export function getMediaDeviceSupport(nav = typeof navigator !== 'undefined' ? navigator : undefined,
                                      secureContext = typeof window !== 'undefined' ? window.isSecureContext : true) {
  if (!nav) {
    return { supported: false, reason: 'No browser environment available.' };
  }

  if (!nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== 'function') {
    // The overwhelmingly common cause is an insecure origin: browsers only
    // expose mediaDevices on https:// or on localhost, so opening the studio at
    // http://192.168.x.x deletes the whole API rather than denying permission.
    if (secureContext === false) {
      return {
        supported: false,
        insecureContext: true,
        reason:
          'Microphone access is blocked on insecure origins. Open the studio at '
          + 'http://localhost:8000 on this machine, or serve it over HTTPS to use it '
          + 'from another device on the network.',
      };
    }
    return {
      supported: false,
      insecureContext: false,
      reason: 'This browser does not support microphone capture (navigator.mediaDevices is unavailable).',
    };
  }

  return { supported: true, insecureContext: false, reason: null };
}

/**
 * Whether output-device selection can actually work here.
 *
 * AudioContext.setSinkId is Chromium-only at the time of writing; Firefox and
 * Safari expose no way to route a Web Audio graph to a chosen device. Probing
 * the prototype avoids constructing a context just to ask.
 */
export function supportsOutputDeviceSelection(
  contextClass = typeof window !== 'undefined' ? window.AudioContext : undefined
) {
  return Boolean(contextClass?.prototype && 'setSinkId' in contextClass.prototype);
}

/** Human-readable message for a getUserMedia / AudioContext failure. */
export function describeGetUserMediaError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone permission denied. Allow microphone access in your browser settings and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone found. Connect a microphone and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is in use by another application.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return `The selected input device is unavailable (constraint: ${err.constraint || 'deviceId'}). `
        + 'Pick another device or choose Default Microphone.';
    case 'AbortError':
      return 'The microphone could not be started. Try again, or select a different device.';
    default:
      return err?.message || 'Failed to start the audio pipeline.';
  }
}

/** True for the errors that mean "this exact device is not usable right now". */
export function isDeviceConstraintError(err) {
  return err?.name === 'OverconstrainedError'
    || err?.name === 'ConstraintNotSatisfiedError'
    || err?.name === 'NotFoundError';
}

/**
 * Progressively looser microphone constraints.
 *
 * A pinned `deviceId: { exact }` fails outright the moment the device is
 * unplugged or claimed by another app; retrying with `ideal` and then with no
 * device preference at all keeps the studio usable instead of dead-ending.
 */
export function buildAudioConstraintCandidates(deviceId, sampleRate) {
  const base = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  const preferredRate = sampleRate ? { ...base, sampleRate } : base;

  if (!deviceId) {
    return sampleRate
      ? [
          { audio: { ...preferredRate } },
          { audio: { ...base }, fallback: 'sample-rate' },
        ]
      : [{ audio: { ...base } }];
  }

  if (!sampleRate) {
    return [
      { audio: { ...base, deviceId: { exact: deviceId } } },
      { audio: { ...base, deviceId: { ideal: deviceId } }, fallback: 'ideal' },
      { audio: { ...base }, fallback: 'default' },
    ];
  }

  return [
    { audio: { ...preferredRate, deviceId: { exact: deviceId } } },
    { audio: { ...base, deviceId: { exact: deviceId } }, fallback: 'sample-rate' },
    { audio: { ...base, deviceId: { ideal: deviceId } }, fallback: 'ideal' },
    { audio: { ...base }, fallback: 'default' },
  ];
}
