// A tiny synchronous store for values that change at animation rate.
//
// Input/output levels and the record timer update ~60x per second. Holding
// them in React state re-renders the entire App (visualizer, controls, effect
// rack, preset bar...) on every animation frame. This store keeps them out of
// the React tree entirely: producers write, and only the handful of subscribers
// that actually paint a meter get called.

export function createMeterStore(initialValue = {}) {
  let value = { ...initialValue };
  const listeners = new Set();

  return {
    get() {
      return value;
    },

    set(next) {
      value = { ...value, ...next };
      for (const listener of listeners) {
        // One misbehaving meter must not stop the rest from updating.
        try {
          listener(value);
        } catch (err) {
          console.error('Meter subscriber failed:', err);
        }
      }
    },

    /** Subscribe and receive the current value immediately. Returns an unsubscribe. */
    subscribe(listener) {
      listeners.add(listener);
      try {
        listener(value);
      } catch (err) {
        console.error('Meter subscriber failed:', err);
      }
      return () => {
        listeners.delete(listener);
      };
    },

    get listenerCount() {
      return listeners.size;
    },
  };
}

/** RMS of a time-domain float buffer — the level a VU meter shows. */
export function rms(data) {
  if (!data || data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
}

// Meter geometry, shared by the store's producers and the bar that paints it.
export const METER_GAIN = 3;
export const PEAK_DECAY = 0.96;

/** Map an RMS level (0..1) to bar width in percent. */
export function levelToPercent(level) {
  return Math.min(Math.max(level * 100 * METER_GAIN, 0), 100);
}

/** Next peak-hold position: instant attack, slow decay. */
export function nextPeak(previousPeak, percent) {
  return Math.max(previousPeak * PEAK_DECAY, percent);
}
