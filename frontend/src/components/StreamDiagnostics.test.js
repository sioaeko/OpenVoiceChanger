// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import StreamDiagnostics from './StreamDiagnostics';

afterEach(() => { cleanup(); vi.useRealTimers(); });
it('clears a recent-drop warning even when parent props are recreated', () => {
  vi.useFakeTimers();
  const props = () => ({ streamInfo: { sampleRate: 48000, chunkSize: 2048 }, transport: { dropped: 1 } });
  const view = render(React.createElement(StreamDiagnostics, props()));
  expect(screen.getByText(/Recent audio discontinuities/)).toBeTruthy();
  view.rerender(React.createElement(StreamDiagnostics, props()));
  act(() => vi.advanceTimersByTime(5100));
  expect(screen.queryByText(/Recent audio discontinuities/)).toBeNull();
});
