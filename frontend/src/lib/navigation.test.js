import { describe, expect, it } from 'vitest';
import { buildTabUrl, isValidTab, readTabFromSearch } from './navigation';

describe('readTabFromSearch', () => {
  it('reads a valid tab', () => {
    expect(readTabFromSearch('?tab=models')).toBe('models');
    expect(readTabFromSearch('?tab=converter')).toBe('converter');
  });

  it('falls back to studio for missing, empty or unknown values', () => {
    expect(readTabFromSearch('')).toBe('studio');
    expect(readTabFromSearch('?other=1')).toBe('studio');
    expect(readTabFromSearch('?tab=nope')).toBe('studio');
    expect(readTabFromSearch(undefined)).toBe('studio');
  });

  it('keeps the tab list and the validator in agreement', () => {
    expect(isValidTab('studio')).toBe(true);
    expect(isValidTab('nope')).toBe(false);
  });
});

describe('buildTabUrl', () => {
  it('writes the tab into the query string', () => {
    expect(buildTabUrl('http://localhost:8000/', 'models')).toBe('/?tab=models');
  });

  it('drops the parameter for the default tab so the base URL stays clean', () => {
    expect(buildTabUrl('http://localhost:8000/?tab=models', 'studio')).toBe('/');
  });

  it('preserves other query parameters and the hash', () => {
    expect(buildTabUrl('http://localhost:8000/?settings&tab=models#effects', 'converter'))
      .toBe('/?settings=&tab=converter#effects');
    expect(buildTabUrl('http://localhost:8000/?settings&tab=models#effects', 'studio'))
      .toBe('/?settings=#effects');
  });

  it('round-trips through readTabFromSearch', () => {
    for (const tab of ['studio', 'models', 'converter']) {
      const url = new URL(buildTabUrl('http://localhost:8000/', tab), 'http://localhost:8000');
      expect(readTabFromSearch(url.search)).toBe(tab);
    }
  });
});
