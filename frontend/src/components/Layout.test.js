import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Layout from './Layout';
import { TAB_IDS } from '../lib/navigation';

function render(tab) {
  return renderToStaticMarkup(React.createElement(Layout, { tab }, 'content'));
}

describe('Layout tab list', () => {
  it('marks the switcher up as a tablist with one tab per view', () => {
    const html = render('studio');
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(TAB_IDS.length);
  });

  it('points each tab at the panel App renders for it', () => {
    const html = render('models');
    for (const id of TAB_IDS) {
      expect(html).toContain(`id="tab-${id}"`);
      expect(html).toContain(`aria-controls="panel-${id}"`);
    }
  });

  it('keeps only the selected tab in the Tab order', () => {
    const html = render('converter');
    expect(html).toContain('aria-selected="true"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(TAB_IDS.length - 1);
    // The selected one is the converter.
    expect(html).toMatch(/id="tab-converter"[^>]*aria-selected="true"/);
  });

  it('gives the page a top-level heading', () => {
    expect(render('studio')).toMatch(/<h1[^>]*>OpenVoiceChanger<\/h1>/);
  });
});
