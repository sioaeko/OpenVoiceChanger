// Effect rack definitions. Keys and parameter names mirror the backend
// EffectsChain (backend/services/dsp_effects.py) exactly.

export const EFFECT_DEFS = [
  {
    key: 'gate',
    label: 'Noise Gate',
    tagline: 'Cuts background noise before conversion',
    params: [
      { key: 'threshold', label: 'Threshold', min: -80, max: -10, step: 1, default: -45, unit: 'dB' },
    ],
  },
  {
    key: 'robot',
    label: 'Robot',
    tagline: 'Ring-mod metallic voice',
    params: [
      { key: 'freq', label: 'Carrier', min: 10, max: 300, step: 1, default: 90, unit: 'Hz' },
    ],
  },
  {
    key: 'whisper',
    label: 'Whisper',
    tagline: 'Breathy noise-excited voice',
    params: [
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, default: 1, unit: '' },
    ],
  },
  {
    key: 'telephone',
    label: 'Telephone',
    tagline: 'Narrowband landline character',
    params: [],
  },
  {
    key: 'distortion',
    label: 'Distortion',
    tagline: 'Soft-clipping drive',
    params: [
      { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.05, default: 0.4, unit: '' },
    ],
  },
  {
    key: 'bitcrush',
    label: 'Bitcrush',
    tagline: '8-bit lo-fi decimation',
    params: [
      { key: 'bits', label: 'Bits', min: 2, max: 16, step: 1, default: 8, unit: 'bit' },
      { key: 'down', label: 'Downsample', min: 1, max: 32, step: 1, default: 4, unit: 'x' },
    ],
  },
  {
    key: 'chorus',
    label: 'Chorus',
    tagline: 'Doubled, detuned shimmer',
    params: [
      { key: 'rate', label: 'Rate', min: 0.05, max: 5, step: 0.05, default: 0.8, unit: 'Hz' },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.05, default: 0.5, unit: '' },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, default: 0.5, unit: '' },
    ],
  },
  {
    key: 'echo',
    label: 'Echo',
    tagline: 'Feedback delay line',
    params: [
      { key: 'time', label: 'Time', min: 0.05, max: 1.2, step: 0.05, default: 0.25, unit: 's' },
      { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.05, default: 0.35, unit: '' },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, default: 0.3, unit: '' },
    ],
  },
  {
    key: 'reverb',
    label: 'Reverb',
    tagline: 'Schroeder room simulation',
    params: [
      { key: 'size', label: 'Size', min: 0, max: 1, step: 0.05, default: 0.5, unit: '' },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, default: 0.35, unit: '' },
    ],
  },
  {
    key: 'eq',
    label: 'Tone EQ',
    tagline: 'Low & high shelf tone control',
    params: [
      { key: 'low', label: 'Low', min: -15, max: 15, step: 0.5, default: 0, unit: 'dB' },
      { key: 'high', label: 'High', min: -15, max: 15, step: 0.5, default: 0, unit: 'dB' },
    ],
  },
  {
    key: 'compressor',
    label: 'Compressor',
    tagline: 'Evens out loudness, adds punch',
    params: [
      { key: 'threshold', label: 'Threshold', min: -60, max: 0, step: 1, default: -20, unit: 'dB' },
      { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, default: 3, unit: ':1' },
    ],
  },
  {
    key: 'gain',
    label: 'Output Gain',
    tagline: 'Final output trim',
    params: [
      { key: 'db', label: 'Gain', min: -24, max: 24, step: 0.5, default: 0, unit: 'dB' },
    ],
  },
];

export function defaultEffects() {
  const effects = {};
  for (const def of EFFECT_DEFS) {
    const entry = { enabled: false };
    for (const param of def.params) {
      entry[param.key] = param.default;
    }
    effects[def.key] = entry;
  }
  return effects;
}

// Merge a preset's (partial) effects payload over a fresh default rack.
export function effectsFromPreset(presetEffects = {}) {
  const effects = defaultEffects();
  for (const [key, value] of Object.entries(presetEffects || {})) {
    if (effects[key] && value && typeof value === 'object') {
      effects[key] = { ...effects[key], ...value };
    }
  }
  return effects;
}

export function countActiveEffects(effects, formantShift = 0) {
  let count = Math.abs(formantShift) > 0.001 ? 1 : 0;
  for (const def of EFFECT_DEFS) {
    if (effects?.[def.key]?.enabled) count += 1;
  }
  return count;
}
