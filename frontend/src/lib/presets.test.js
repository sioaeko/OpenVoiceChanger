import { describe, expect, it } from 'vitest';
import {
  ADVANCED_FIELD_MAP,
  advancedFieldsInPreset,
  effectsFromPresetSettings,
  presetSettingsFromVoice,
  voiceFromPreset,
} from './presets';
import { defaultEffects } from './effects';

const CURRENT_VOICE = {
  pitch: 0,
  formant: 0,
  f0Method: 'pm',
  indexRate: 0.75,
  filterRadius: 3,
  rmsMixRate: 0.25,
  protect: 0.33,
};

const TUNED_VOICE = {
  pitch: 3.5,
  formant: -2,
  f0Method: 'rmvpe',
  indexRate: 0.4,
  filterRadius: 5,
  rmsMixRate: 0.8,
  protect: 0.2,
};

// A preset saved before the advanced fields existed, and a built-in preset:
// both describe only pitch/formant/effects.
const LEGACY_PRESET = {
  id: 'user-old',
  settings: { pitch_shift: 7, formant_shift: 4, effects: { reverb: { enabled: true } } },
};

const FULL_PRESET = {
  id: 'user-new',
  settings: {
    pitch_shift: -6,
    formant_shift: 1,
    effects: {},
    f0_method: 'harvest',
    index_rate: 0.1,
    filter_radius: 6,
    rms_mix_rate: 0.9,
    protect: 0.05,
  },
};

describe('presetSettingsFromVoice', () => {
  it('captures the whole Voice Lab state', () => {
    const settings = presetSettingsFromVoice(TUNED_VOICE, { echo: { enabled: true } });

    expect(settings.pitch_shift).toBe(3.5);
    expect(settings.formant_shift).toBe(-2);
    expect(settings.effects).toEqual({ echo: { enabled: true } });
    expect(settings.f0_method).toBe('rmvpe');
    expect(settings.index_rate).toBe(0.4);
    expect(settings.filter_radius).toBe(5);
    expect(settings.rms_mix_rate).toBe(0.8);
    expect(settings.protect).toBe(0.2);
  });

  it('emits every declared advanced field', () => {
    const settings = presetSettingsFromVoice(TUNED_VOICE, {});
    for (const field of ADVANCED_FIELD_MAP) {
      expect(settings).toHaveProperty(field.preset);
    }
  });

  it('clamps out-of-range values to what the backend accepts', () => {
    const settings = presetSettingsFromVoice(
      { ...TUNED_VOICE, indexRate: 5, filterRadius: 99, protect: -1 },
      {}
    );
    expect(settings.index_rate).toBe(1);
    expect(settings.filter_radius).toBe(7);
    expect(settings.protect).toBe(0);
  });

  it('rounds filter radius to an integer', () => {
    expect(presetSettingsFromVoice({ ...TUNED_VOICE, filterRadius: 4.7 }, {}).filter_radius).toBe(5);
  });

  it('omits fields it cannot use instead of writing zero', () => {
    const settings = presetSettingsFromVoice(
      { pitch: 1, formant: 0, indexRate: undefined, protect: null, filterRadius: 'x' },
      {}
    );
    expect(settings).not.toHaveProperty('index_rate');
    expect(settings).not.toHaveProperty('protect');
    expect(settings).not.toHaveProperty('filter_radius');
    expect(settings.pitch_shift).toBe(1);
  });

  it('omits an unknown f0 method', () => {
    expect(presetSettingsFromVoice({ ...TUNED_VOICE, f0Method: 'bogus' }, {}))
      .not.toHaveProperty('f0_method');
  });

  it('handles a missing voice object', () => {
    expect(presetSettingsFromVoice()).toMatchObject({ pitch_shift: 0, formant_shift: 0 });
  });
});

describe('voiceFromPreset', () => {
  it('restores every field from a full preset', () => {
    const next = voiceFromPreset(FULL_PRESET, CURRENT_VOICE);

    expect(next.pitch).toBe(-6);
    expect(next.formant).toBe(1);
    expect(next.f0Method).toBe('harvest');
    expect(next.indexRate).toBe(0.1);
    expect(next.filterRadius).toBe(6);
    expect(next.rmsMixRate).toBe(0.9);
    expect(next.protect).toBe(0.05);
  });

  it('keeps the current advanced values for a legacy preset', () => {
    const next = voiceFromPreset(LEGACY_PRESET, TUNED_VOICE);

    // pitch/formant still follow the preset — the long-standing behaviour.
    expect(next.pitch).toBe(7);
    expect(next.formant).toBe(4);
    // ...but nothing the preset does not mention gets reset.
    expect(next.f0Method).toBe(TUNED_VOICE.f0Method);
    expect(next.indexRate).toBe(TUNED_VOICE.indexRate);
    expect(next.filterRadius).toBe(TUNED_VOICE.filterRadius);
    expect(next.rmsMixRate).toBe(TUNED_VOICE.rmsMixRate);
    expect(next.protect).toBe(TUNED_VOICE.protect);
  });

  it('defaults pitch and formant to zero when the preset omits them', () => {
    const next = voiceFromPreset({ id: 'x', settings: { effects: {} } }, TUNED_VOICE);
    expect(next.pitch).toBe(0);
    expect(next.formant).toBe(0);
  });

  it('keeps current values when a preset carries an unusable advanced value', () => {
    const next = voiceFromPreset(
      { id: 'x', settings: { index_rate: 'nonsense', protect: null } },
      TUNED_VOICE
    );
    expect(next.indexRate).toBe(TUNED_VOICE.indexRate);
    expect(next.protect).toBe(TUNED_VOICE.protect);
  });

  it('clamps an out-of-range preset value', () => {
    const next = voiceFromPreset({ id: 'x', settings: { index_rate: 9 } }, TUNED_VOICE);
    expect(next.indexRate).toBe(1);
  });

  it('carries through voice fields the preset never describes', () => {
    const next = voiceFromPreset(LEGACY_PRESET, { ...TUNED_VOICE, custom: 'keep me' });
    expect(next.custom).toBe('keep me');
  });

  it('tolerates a missing preset', () => {
    const next = voiceFromPreset(undefined, TUNED_VOICE);
    expect(next.pitch).toBe(0);
    expect(next.indexRate).toBe(TUNED_VOICE.indexRate);
  });

  it('round-trips a save then an apply', () => {
    const saved = { id: 'rt', settings: presetSettingsFromVoice(TUNED_VOICE, {}) };
    expect(voiceFromPreset(saved, CURRENT_VOICE)).toMatchObject(TUNED_VOICE);
  });
});

describe('effectsFromPresetSettings', () => {
  it('always returns a full rack', () => {
    expect(effectsFromPresetSettings(LEGACY_PRESET).reverb.enabled).toBe(true);
    // Unlisted effects keep their defaults rather than going missing.
    expect(effectsFromPresetSettings(LEGACY_PRESET).echo).toEqual(defaultEffects().echo);
  });

  it('returns defaults for a preset without effects', () => {
    expect(effectsFromPresetSettings({ id: 'x', settings: {} })).toEqual(defaultEffects());
    expect(effectsFromPresetSettings(undefined)).toEqual(defaultEffects());
  });
});

describe('advancedFieldsInPreset', () => {
  it('reports what a preset actually restores', () => {
    expect(advancedFieldsInPreset(LEGACY_PRESET)).toEqual([]);
    expect(advancedFieldsInPreset(FULL_PRESET).sort()).toEqual(
      ['f0_method', 'filter_radius', 'index_rate', 'protect', 'rms_mix_rate']
    );
  });
});
