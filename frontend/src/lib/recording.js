// Bounds for the in-memory output recorder.
//
// Recording accumulates raw Float32 chunks in a JS array and only encodes to
// 16-bit WAV when the take is finished, so an unbounded session grows until the
// tab dies. The cap below is expressed in seconds because that is what a user
// reasons about; the byte cost follows from the stream's sample rate.

export const MAX_RECORD_SECONDS = 600; // 10 minutes

/** Sample budget for one take at the stream's actual rate. */
export function maxRecordingSamples(sampleRate, maxSeconds = MAX_RECORD_SECONDS) {
  const rate = Number(sampleRate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.floor(rate * maxSeconds);
}

/**
 * Peak memory for a take: the Float32 chunks held during capture plus the
 * 16-bit WAV built from them at the end.
 */
export function estimateRecordingBytes(sampleCount) {
  return sampleCount * 4 + sampleCount * 2 + 44;
}

/**
 * Append one chunk to a take, truncating at the sample budget.
 *
 * Returns the chunk actually stored (possibly trimmed, possibly empty) and
 * whether the take is now full, so the caller can stop and finalize cleanly
 * rather than dropping audio silently.
 */
export function appendRecordingChunk(chunk, currentSamples, limitSamples) {
  if (limitSamples <= 0) {
    return { accepted: null, samples: currentSamples, full: true };
  }

  const remaining = limitSamples - currentSamples;
  if (remaining <= 0) {
    return { accepted: null, samples: currentSamples, full: true };
  }

  if (chunk.length <= remaining) {
    return {
      accepted: chunk,
      samples: currentSamples + chunk.length,
      full: chunk.length === remaining,
    };
  }

  return {
    accepted: chunk.subarray(0, remaining),
    samples: limitSamples,
    full: true,
  };
}

export function formatRecordLimit(maxSeconds = MAX_RECORD_SECONDS) {
  const minutes = Math.floor(maxSeconds / 60);
  if (minutes >= 1) return `${minutes} min`;
  return `${maxSeconds}s`;
}
