import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AudioControls from './AudioControls';

const devices = {
  inputDevices: [],
  outputDevices: [],
  hasLabels: true,
  permissionState: 'granted',
  error: null,
  captureSupported: true,
  outputSelectionSupported: true,
};

const idlePipeline = { isRunning: false, streamInfo: null };

function render(props) {
  return renderToStaticMarkup(React.createElement(AudioControls, {
    devices,
    pipeline: idlePipeline,
    activeModel: null,
    onRetryConnection: () => {},
    ...props,
  }));
}

describe('AudioControls connection state', () => {
  it('offers an immediate retry while the reconnect back-off is waiting', () => {
    const html = render({ wsStatus: 'disconnected' });
    expect(html).toContain('retrying automatically');
    expect(html).toContain('Retry now');
  });

  it('keeps the retry available while an attempt hangs in CONNECTING', () => {
    // A dead or unreachable host can leave the socket connecting for seconds;
    // retryNow replaces that attempt, so the button must not disappear.
    const html = render({ wsStatus: 'connecting' });
    expect(html).toContain('Connecting to the server');
    expect(html).toContain('Retry now');
  });

  it('shows nothing about the connection once it is up', () => {
    const html = render({ wsStatus: 'connected' });
    expect(html).not.toContain('Retry now');
    expect(html).not.toContain('Waiting for server connection');
    expect(html).toContain('Start Voice Changer');
  });

  it('keeps Start disabled while an update is being installed', () => {
    const html = render({ wsStatus: 'connected', updateBusy: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Start Voice Changer/);
  });
});
