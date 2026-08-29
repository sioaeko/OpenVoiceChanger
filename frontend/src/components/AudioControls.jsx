import React, { useState } from 'react';

export default function AudioControls({
  devices,
  pipeline,
  wsStatus,
  activeModel,
  bypass = false,
  onBypassChange,
}) {
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const outputSelectable = devices.outputSelectionSupported !== false;
  const captureSupported = devices.captureSupported !== false;

  // A voice model is optional: without one, the stream runs through the
  // server-side DSP chain (pitch + effects) instead.
  const canStart = wsStatus === 'connected' && !pipeline.isRunning && captureSupported;

  const handleStart = async () => {
    setError(null);
    setStarting(true);
    try {
      await devices.refresh?.();
      await pipeline.start(selectedInput || undefined, selectedOutput || undefined);
    } catch (err) {
      setError(err.message || 'Failed to start audio pipeline');
    } finally {
      setStarting(false);
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
          <span className="rounded border border-line-strong bg-control px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            {activeModel ? 'Model engine' : 'DSP engine'}
          </span>
          <button
            onClick={() => devices.refresh?.().catch(() => {})}
            disabled={pipeline.isRunning || devices.isRefreshing}
            className="chip-button"
          >
            {devices.isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            Input
          </label>
          <select
            value={selectedInput}
            onChange={(event) => setSelectedInput(event.target.value)}
            disabled={pipeline.isRunning}
            className="native-select-safe mt-2 w-full rounded-md border border-line bg-input px-3 py-2.5 text-sm text-fg outline-none transition focus:border-line-hover disabled:cursor-not-allowed disabled:opacity-50"
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
          <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            Output
          </label>
          <select
            value={outputSelectable ? selectedOutput : ''}
            onChange={(event) => setSelectedOutput(event.target.value)}
            disabled={pipeline.isRunning || !outputSelectable}
            title={
              outputSelectable
                ? undefined
                : 'This browser cannot route Web Audio to a specific device.'
            }
            className="native-select-safe mt-2 w-full rounded-md border border-line bg-input px-3 py-2.5 text-sm text-fg outline-none transition focus:border-line-hover disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-line bg-raised px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            A/B Monitor
          </p>
          <p className="mt-1 text-[11px] text-fg-faint">
            {bypass
              ? 'Bypassed — hearing your raw input, conversion and effects are off.'
              : 'Converted — model, pitch, formant and the effect rack are applied.'}
          </p>
        </div>
        <button
          onClick={() => onBypassChange?.(!bypass)}
          role="switch"
          aria-checked={bypass}
          title="Toggle full conversion bypass (shortcut: B)"
          className={`flex-shrink-0 rounded border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
            bypass
              ? 'border-warn-line-strong bg-warn-bg-strong text-warn-fg hover:bg-warn-bg-strong'
              : 'border-line-strong bg-control text-fg-muted hover:border-line-hover hover:bg-control-hover hover:text-fg'
          }`}
        >
          {bypass ? 'Bypass on' : 'Bypass off'}
          <span className="ml-2 font-mono text-[10px] opacity-60">B</span>
        </button>
      </div>

      <div className="mt-4">
        {!pipeline.isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="w-full rounded-md bg-primary px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-control-hover disabled:text-fg-subtle"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Starting…
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Start Voice Changer
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="w-full rounded-md border border-danger-line-strong bg-danger-bg px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-danger-fg transition hover:bg-danger-bg-strong"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
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
        <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
          Waiting for server connection…
        </p>
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
