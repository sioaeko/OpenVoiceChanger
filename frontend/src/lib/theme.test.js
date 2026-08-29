import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeTheme,
  readAppliedTheme,
  readStoredTheme,
  readThemeColors,
  storeTheme,
} from './theme';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

const throwingStorage = {
  getItem() { throw new DOMException('blocked'); },
  setItem() { throw new DOMException('blocked'); },
};

function fakeRoot() {
  const attrs = {};
  return {
    attrs,
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
  };
}

describe('constants', () => {
  it('ships dark as the product default', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(THEMES).toEqual(['dark', 'light']);
    expect(THEME_STORAGE_KEY).toBe('ovc_theme');
  });
});

describe('normalizeTheme', () => {
  it('passes through supported themes', () => {
    expect(normalizeTheme('dark')).toBe('dark');
    expect(normalizeTheme('light')).toBe('light');
  });

  it.each([undefined, null, '', 'Dark', 'LIGHT', 'sepia', 0, 1, {}, [], true, '{"a":1}'])(
    'falls back to dark for %o',
    (value) => {
      expect(normalizeTheme(value)).toBe('dark');
    }
  );
});

describe('readStoredTheme', () => {
  it('reads a saved theme', () => {
    expect(readStoredTheme(fakeStorage({ ovc_theme: 'light' }))).toBe('light');
    expect(readStoredTheme(fakeStorage({ ovc_theme: 'dark' }))).toBe('dark');
  });

  it('defaults when nothing is stored', () => {
    expect(readStoredTheme(fakeStorage())).toBe('dark');
  });

  it('defaults on a corrupt value rather than throwing', () => {
    expect(readStoredTheme(fakeStorage({ ovc_theme: '{"theme":"light"}' }))).toBe('dark');
    expect(readStoredTheme(fakeStorage({ ovc_theme: 'LIGHT' }))).toBe('dark');
  });

  it('survives storage that throws or is absent', () => {
    expect(readStoredTheme(throwingStorage)).toBe('dark');
    expect(readStoredTheme(undefined)).toBe('dark');
    expect(readStoredTheme(null)).toBe('dark');
  });
});

describe('storeTheme', () => {
  it('persists a normalized value', () => {
    const storage = fakeStorage();
    expect(storeTheme('light', storage)).toBe(true);
    expect(storage.data.ovc_theme).toBe('light');
  });

  it('never writes an unsupported value', () => {
    const storage = fakeStorage();
    storeTheme('sepia', storage);
    expect(storage.data.ovc_theme).toBe('dark');
  });

  it('reports failure instead of throwing when storage is blocked', () => {
    expect(storeTheme('light', throwingStorage)).toBe(false);
    expect(storeTheme('light', undefined)).toBe(false);
  });

  it('round-trips through readStoredTheme', () => {
    for (const theme of THEMES) {
      const storage = fakeStorage();
      storeTheme(theme, storage);
      expect(readStoredTheme(storage)).toBe(theme);
    }
  });
});

describe('applyTheme', () => {
  it('writes data-theme on the root', () => {
    const root = fakeRoot();
    expect(applyTheme('light', root)).toBe('light');
    expect(root.attrs['data-theme']).toBe('light');
  });

  it('normalizes before applying, so the DOM never holds a bad value', () => {
    const root = fakeRoot();
    expect(applyTheme('neon', root)).toBe('dark');
    expect(root.attrs['data-theme']).toBe('dark');
  });

  it('returns the resolved theme even without a root', () => {
    expect(applyTheme('light', null)).toBe('light');
  });
});

describe('readAppliedTheme', () => {
  it('reads back what applyTheme wrote', () => {
    const root = fakeRoot();
    applyTheme('light', root);
    expect(readAppliedTheme(root)).toBe('light');
  });

  it('defaults for an unset or unusable root', () => {
    expect(readAppliedTheme(fakeRoot())).toBe('dark');
    expect(readAppliedTheme(undefined)).toBe('dark');
    expect(readAppliedTheme({})).toBe('dark');
  });

  it('matches the index.html pre-paint contract', () => {
    // The blocking script only ever writes 'light' or 'dark'; anything else
    // that reaches the attribute must still resolve to the default.
    const root = fakeRoot();
    root.setAttribute('data-theme', 'tampered');
    expect(readAppliedTheme(root)).toBe('dark');
  });
});

describe('readThemeColors', () => {
  it('resolves custom properties to concrete values', () => {
    const root = {};
    const spy = vi.fn(() => ({ getPropertyValue: (p) => (p === '--viz-output' ? ' #059669 ' : '') }));
    vi.stubGlobal('window', { getComputedStyle: spy });

    expect(readThemeColors({ output: '--viz-output' }, root)).toEqual({ output: '#059669' });
    expect(spy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('returns empty strings when there is no root or no window', () => {
    vi.stubGlobal('window', undefined);
    expect(readThemeColors({ output: '--viz-output' }, null)).toEqual({ output: '' });
    vi.unstubAllGlobals();
  });

  it('reads the whole set in a single getComputedStyle call', () => {
    // The visualizer calls this on theme change only; one style recalc per
    // call is the budget, regardless of how many colours it needs.
    const spy = vi.fn(() => ({ getPropertyValue: () => '#000' }));
    vi.stubGlobal('window', { getComputedStyle: spy });

    readThemeColors({ a: '--a', b: '--b', c: '--c' }, {});
    expect(spy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
