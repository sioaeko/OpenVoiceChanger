import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import RuntimeReadiness from './RuntimeReadiness';
import StatusIndicator from './StatusIndicator';

it('distinguishes detected prerequisites from verified model inference', () => {
  const html = renderToStaticMarkup(React.createElement(RuntimeReadiness, {
    readiness: { prerequisitesDetected: true, checks: [] }, onRefresh: () => {},
  }));
  expect(html).toContain('Model loading verifies inference');
  expect(html).not.toContain('RVC ready');
  expect(html).toContain('Recheck runtime');
});

it('reports muted inference failures in the header, not a healthy RVC mode', () => {
  const html = renderToStaticMarkup(React.createElement(StatusIndicator, {
    wsStatus: 'connected', activeModel: 'model.pth', mode: 'error',
  }));
  expect(html).toContain('Muted');
  expect(html).toContain('ERROR');
  expect(html).not.toContain('>RVC<');
});
