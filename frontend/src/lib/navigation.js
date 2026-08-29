// Tab <-> URL synchronisation.
//
// The app already read ?tab= on first load, but selecting a tab never wrote it
// back, so a link to the current view could not be copied and Back/Forward
// walked out of the app instead of between tabs. These helpers keep the query
// string authoritative while preserving every other parameter and the hash.

export const TAB_IDS = ['studio', 'models', 'converter'];
export const DEFAULT_TAB = 'studio';

export function isValidTab(tab) {
  return TAB_IDS.includes(tab);
}

/** Read the tab from a location search string, falling back to the default. */
export function readTabFromSearch(search) {
  const param = new URLSearchParams(search || '').get('tab');
  return isValidTab(param) ? param : DEFAULT_TAB;
}

/**
 * URL for a tab, relative to the current one.
 *
 * The default tab drops ?tab= entirely so the base URL stays clean, and any
 * other query parameter (notably ?settings) plus the hash survive the switch.
 */
export function buildTabUrl(currentUrl, tab) {
  const url = new URL(currentUrl);
  if (tab === DEFAULT_TAB) {
    url.searchParams.delete('tab');
  } else {
    url.searchParams.set('tab', tab);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
