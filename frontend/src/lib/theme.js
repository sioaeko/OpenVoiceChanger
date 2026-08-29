// Theme resolution, persistence and application.
//
// Pure functions over injected storage/DOM so the rules can be tested without a
// browser, and so the same normalisation runs in three places that must agree:
// the blocking script in index.html (inlined copy of `normalizeTheme`), the
// React state that owns the toggle, and these helpers.

export const THEME_STORAGE_KEY = 'ovc_theme';
export const THEMES = ['dark', 'light'];
export const DEFAULT_THEME = 'dark';

/** Coerce anything into a supported theme. Unknown or corrupt input -> dark. */
export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : DEFAULT_THEME;
}

/**
 * Read the persisted theme.
 *
 * The value is stored as a bare string rather than JSON so a half-written or
 * hand-edited entry degrades to the default instead of throwing. Storage
 * itself can throw (private mode, blocked cookies), so it is guarded too.
 */
export function readStoredTheme(storage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Persist a theme choice.
 *
 * Returns whether the value actually reached storage — absent storage must
 * report false rather than short-circuiting to a truthy "success", or the
 * caller would believe a preference was saved that will not survive a reload.
 */
export function storeTheme(theme, storage) {
  if (typeof storage?.setItem !== 'function') return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a theme to the document root.
 *
 * `data-theme` drives the CSS custom properties; `color-scheme` is what makes
 * UA-rendered widgets (the <audio> player, scrollbars, form controls) follow
 * along, which CSS alone cannot do for shadow-DOM internals.
 */
export function applyTheme(theme, root) {
  const normalized = normalizeTheme(theme);
  if (!root) return normalized;
  root.setAttribute('data-theme', normalized);
  return normalized;
}

/** The theme currently applied to the document root. */
export function readAppliedTheme(root) {
  return normalizeTheme(root?.getAttribute?.('data-theme'));
}

/**
 * Resolve CSS custom properties to concrete colour strings.
 *
 * Canvas and inline SVG cannot reference `var()`, so those renderers need real
 * values. This is deliberately a one-shot read: callers must call it when the
 * theme changes, never inside an animation frame — `getComputedStyle` forces a
 * style recalc, and the visualizer runs at 60fps.
 */
export function readThemeColors(names, root) {
  const result = {};
  if (!root || typeof window === 'undefined' || !window.getComputedStyle) {
    for (const [key] of Object.entries(names)) result[key] = '';
    return result;
  }
  const styles = window.getComputedStyle(root);
  for (const [key, property] of Object.entries(names)) {
    result[key] = styles.getPropertyValue(property).trim();
  }
  return result;
}
