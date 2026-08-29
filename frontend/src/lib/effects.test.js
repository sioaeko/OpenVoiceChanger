import { describe, expect, it } from 'vitest';
import {
  EFFECT_DEFS,
  countActiveEffects,
  defaultEffects,
  effectsFromPreset,
} from './effects';

describe('defaultEffects', () => {
  it('starts every effect disabled with its declared defaults', () => {
    const effects = defaultEffects();
    for (const def of EFFECT_DEFS) {
      expect(effects[def.key].enabled).toBe(false);
      for (const param of def.params) {
        expect(effects[def.key][param.key]).toBe(param.default);
      }
    }
  });

  it('returns a fresh object each call', () => {
    const a = defaultEffects();
    a.reverb.enabled = true;
    expect(defaultEffects().reverb.enabled).toBe(false);
  });
});

describe('effectsFromPreset', () => {
  it('merges a partial preset over the full default rack', () => {
    const effects = effectsFromPreset({ reverb: { enabled: true, mix: 0.5 } });
    expect(effects.reverb.enabled).toBe(true);
    expect(effects.reverb.mix).toBe(0.5);
    // Unspecified params keep their defaults rather than becoming undefined.
    expect(effects.reverb.size).toBe(0.5);
    expect(effects.echo.enabled).toBe(false);
  });

  it('ignores unknown keys and malformed entries', () => {
    const effects = effectsFromPreset({ notAnEffect: { enabled: true }, reverb: null });
    expect(effects.notAnEffect).toBeUndefined();
    expect(effects.reverb.enabled).toBe(false);
  });

  it('tolerates missing or nullish input', () => {
    expect(effectsFromPreset()).toEqual(defaultEffects());
    expect(effectsFromPreset(null)).toEqual(defaultEffects());
  });
});

describe('countActiveEffects', () => {
  it('counts enabled effects plus a non-zero formant shift', () => {
    const effects = effectsFromPreset({ reverb: { enabled: true }, echo: { enabled: true } });
    expect(countActiveEffects(effects, 0)).toBe(2);
    expect(countActiveEffects(effects, 3)).toBe(3);
    expect(countActiveEffects(effects, -3)).toBe(3);
  });

  it('treats a negligible formant shift as inactive', () => {
    expect(countActiveEffects(defaultEffects(), 0.0001)).toBe(0);
  });

  it('handles missing state', () => {
    expect(countActiveEffects(undefined, 0)).toBe(0);
  });
});
