// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RuntimeSetupPanel from './RuntimeSetupPanel';

afterEach(cleanup);
const base = () => ({ state: { operation: { phase: 'idle' }, plan: { python: '3.10.20', asset_bytes: 370692181 } },
  install: vi.fn(), cancel: vi.fn(), refresh: vi.fn() });

it('requires informed confirmation and never installs on initial click', () => {
  const setup = base();
  render(React.createElement(RuntimeSetupPanel, { setup }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up RVC' }));
  expect(setup.install).not.toHaveBeenCalled();
  expect(screen.getByText(/Existing Python and CUDA/)).toBeTruthy();
  expect(screen.getByText(/CPU only; GPU acceleration/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Install and restart' }));
  expect(setup.install).toHaveBeenCalledTimes(1);
});

it('uses actual byte progress and allows cancellation before switching', () => {
  const setup = base();
  setup.busy = true;
  setup.state.busy = true;
  setup.state.operation = { phase: 'assets', file: 'hubert_base.pt', downloaded_bytes: 50, total_bytes: 100 };
  const view = render(React.createElement(RuntimeSetupPanel, { setup }));
  expect(screen.getByRole('progressbar').value).toBe(50);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel setup' }));
  expect(setup.cancel).toHaveBeenCalledOnce();
  setup.state.operation = { phase: 'switching' };
  view.rerender(React.createElement(RuntimeSetupPanel, { setup }));
  expect(screen.queryByRole('button', { name: 'Cancel setup' })).toBeNull();
  expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
});

it('blocks setup when audio or unsaved work is present', () => {
  const setup = { ...base(), blocked: 'Stop audio first.' };
  render(React.createElement(RuntimeSetupPanel, { setup }));
  expect(screen.getByRole('button', { name: 'Set up RVC' }).disabled).toBe(true);
});

it('keeps failure actionable without claiming model inference is ready', () => {
  const setup = base();
  setup.state.operation = { phase: 'error', error: 'Hash verification failed.' };
  render(React.createElement(RuntimeSetupPanel, { setup }));
  expect(screen.getByRole('alert').textContent).toContain('Hash verification failed.');
  expect(screen.getByRole('button', { name: 'Retry setup' })).toBeTruthy();
  expect(screen.queryByText('RVC ready')).toBeNull();
});
