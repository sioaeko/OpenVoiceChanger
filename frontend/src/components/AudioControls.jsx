import React, { memo, useState } from 'react';
import { LoaderCircle, Pause, Play, RefreshCw } from 'lucide-react';

function AudioControls({
  devices,
  pipeline,
  wsStatus,
  activeModel,
  bypass = false,
  onBypassChange,
  onRetryConnection,
  updateBusy = false,
  onStartingChange,
}) {
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const outputSelectable = devices.outputSelectionSupported !== false;
  const captureSupported = devices.captureSupported !== false;

  // A voice model is optional: without one, the stream runs through the
  // server-side DSP chain (pitch + effects) instead.
  const canStart = wsStatus === 'connected' && !pipeline.isRunning && captureSupported && !updateBusy;

  const handleStart = async () => {
    if (!canStart) return;
    setError(null);
    setStarting(true);
    onStartingChange?.(true);
    try {
      await devices.refresh?.();
      await pipeline.start(selectedInput || undefined, selectedOutput || undefined);
    } catch (err) {
      setError(err.message || 'Failed to start audio pipeline');
    } finally {
      setStarting(false);
      onStartingChange?.(false);
    }
  };

  const handleStop = () => {
    setError(null);
    pipeline.stop();
  };

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">Routing</p>
          <h2 className="panel-title">Devices & stream</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-line bg-control px-2.5 py-1 text-[11px] font-medium text-fg-muted">
            {activeModel ? 'Model engine' : 'DSP engine'}
          </span>
          <button
            onClick={() => devices.refresh?.().catch(() => {})}
            disabled={pipeline.isRunning || devices.isRefreshing}
            className="chip-button inline-flex items-center gap-1.5"
            aria-label="Refresh audio devices"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${devices.isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {devices.isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="audio-input-device" className="block text-xs font-medium text-fg-muted">
            Input
          </label>
          <select
            id="audio-input-device"
            value={selectedInput}
            onChange={(event) => setSelectedInput(event.target.value)}
            disabled={pipeline.isRunning}
            className="native-select-safe mt-2 w-full rounded-[var(--frost-radius)] border border-line bg-input px-3 py-2.5 text-sm text-fg transition focus:border-line-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Default Microphone</option>
            {devices.inputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone (${device.deviceId.slice(0, 8)}...)`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audio-output-device" className="block text-xs font-medium text-fg-muted">
            Output
          </label>
          <select
            id="audio-output-device"
            value={outputSelectable ? selectedOutput : ''}
            onChange={(event) => setSelectedOutput(event.target.value)}
            disabled={pipeline.isRunning || !outputSelectable}
            title={
              outputSelectable
                ? undefined
                : 'This browser cannot route Web Audio to a specific device.'
            }
            className="native-select-safe mt-2 w-full rounded-[var(--frost-radius)] border border-line bg-input px-3 py-2.5 text-sm text-fg transition focus:border-line-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* Without setSinkId the browser always plays to the system default,
                so offering a device list here would be a promise we can't keep. */}
            <option value="">
              {outputSelectable ? 'Default Speaker' : 'System default (not selectable)'}
            </option>
            {outputSelectable
              && devices.outputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Speaker (${device.deviceId.slice(0, 8)}...)`}
                </option>
              ))}
          </select>
          {!outputSelectable && (
            <p className="mt-2 text-[11px] text-fg-faint">
              This browser has no <code className="text-fg-subtle">AudioContext.setSinkId</code> —
              output follows the system default device. Choose the device in your OS sound settings.
            </p>
          )}
        </div>
      </div>

      {captureSupported && !devices.hasLabels && (
        <p className="mt-2 text-[11px] text-fg-faint">
          Grant microphone permission to reveal device names.
        </p>
      )}
      {devices.permissionState === 'denied' && (
        <p className="mt-2 text-[11px] text-danger-fg">
          Microphone permission is blocked in the browser.
        </p>
      )}

      {/* True A/B: keeps the mic, the WebSocket and the output routing live and
          returns the raw input instead of the converted signal. */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-muted">
            A/B Monitor
          </p>
          <p className="mt-1 text-[11px] text-fg-faint">
            {bypass ? 'Original input' : 'Converted signal'}
          </p>
        </div>
        <button
          onClick={() => onBypassChange?.(!bypass)}
          role="switch"
          aria-checked={bypass}
          aria-label="Conversion bypass"
          title="Toggle full conversion bypass (shortcut: B)"
          data-tone={bypass ? 'warning' : undefined}
          className="frost-control inline-flex h-9 min-w-[112px] flex-shrink-0 items-center justify-center px-3.5 text-xs font-medium text-fg-muted"
        >
          {bypass ? 'Bypass on' : 'Bypass off'}
        </button>
      </div>

      <div className="mt-4">
        {!pipeline.isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            data-tone="primary"
            className="frost-control min-h-11 w-full px-5 py-2.5 text-sm font-semibold"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                Starting…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                Start Voice Changer
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={handleStop}
            data-tone="danger"
            className="frost-control min-h-11 w-full px-5 py-2.5 text-sm font-semibold"
          >
            <span className="flex items-center justify-center gap-2">
              <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
              Stop
            </span>
          </button>
        )}
      </div>

      {!captureSupported && (
        <div className="mt-3 rounded-md border border-danger-line bg-danger-bg p-3">
          <p className="text-sm text-danger-fg">{devices.error}</p>
        </div>
      )}

      {pipeline.streamInfo?.inputFallback && (
        <p className="mt-3 text-[11px] text-warn-fg-soft">
          {pipeline.streamInfo.inputFallback === 'default'
            ? 'The selected microphone was unavailable — recording from the system default instead.'
            : pipeline.streamInfo.inputFallback === 'sample-rate'
              ? 'The microphone rejected the preferred capture rate — the browser is resampling it into the active audio stream.'
              : 'The selected microphone could not be matched exactly — the browser picked the closest match.'}
        </p>
      )}

      {pipeline.streamInfo
        && pipeline.streamInfo.sampleRate !== pipeline.streamInfo.requestedSampleRate && (
        <p className="mt-3 text-[11px] text-fg-subtle">
          Streaming at {pipeline.streamInfo.sampleRate.toLocaleString()} Hz — the browser did not
          grant the requested {pipeline.streamInfo.requestedSampleRate.toLocaleString()} Hz. The
          server and recordings follow the actual rate.
        </p>
      )}

      {captureSupported && !pipeline.isRunning && wsStatus !== 'connected' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-fg-subtle" role="status">
            {wsStatus === 'connecting'
              ? 'Connecting to the server…'
              : 'Waiting for server connection — retrying automatically.'}
          </p>
          {/* The back-off grows to 30 s, and an attempt to an unreachable host
              can hang in CONNECTING for a long time; either way someone who just
              restarted the backend should not have to wait it out. retryNow
              replaces a pending attempt rather than stacking a second one. */}
          {onRetryConnection ? (
            <button
              type="button"
              onClick={onRetryConnection}
              className="chip-button inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry now
            </button>
          ) : null}
        </div>
      )}
      {!pipeline.isRunning && wsStatus === 'connected' && !activeModel && (
        <p className="mt-3 text-[11px] text-fg-subtle">
          No model active — streaming will use the DSP pitch shifter and effects rack.
          Load an RVC/ONNX model in the Models tab for full voice conversion.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-danger-line bg-danger-bg p-3">
          <p className="text-sm text-danger-fg">{error}</p>
        </div>
      )}
      {devices.error && !error && captureSupported && (
        <div className="mt-3 rounded-md border border-warn-line bg-warn-bg p-3">
          <p className="text-sm text-warn-fg">{devices.error}</p>
        </div>
      )}
    </section>
  );
}

export default memo(AudioControls);
