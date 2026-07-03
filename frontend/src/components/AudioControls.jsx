import React, { useState } from 'react';

export default function AudioControls({ devices, pipeline, wsStatus, activeModel }) {
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  // A voice model is optional: without one, the stream runs through the
  // server-side DSP chain (pitch + effects) instead.
  const canStart = wsStatus === 'connected' && !pipeline.isRunning;

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
          <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
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
          <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Input
          </label>
          <select
            value={selectedInput}
            onChange={(event) => setSelectedInput(event.target.value)}
            disabled={pipeline.isRunning}
            className="native-select-safe mt-2 w-full rounded-md border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
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
          <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Output
          </label>
          <select
            value={selectedOutput}
            onChange={(event) => setSelectedOutput(event.target.value)}
            disabled={pipeline.isRunning}
            className="native-select-safe mt-2 w-full rounded-md border border-white/[0.08] bg-black/25 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Default Speaker</option>
            {devices.outputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker (${device.deviceId.slice(0, 8)}...)`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!devices.hasLabels && (
        <p className="mt-2 text-[11px] text-zinc-600">
          Grant microphone permission to reveal device names.
        </p>
      )}
      {devices.permissionState === 'denied' && (
        <p className="mt-2 text-[11px] text-rose-300">
          Microphone permission is blocked in the browser.
        </p>
      )}

      <div className="mt-5">
        {!pipeline.isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="w-full rounded-md bg-zinc-100 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-zinc-500"
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
            className="w-full rounded-md border border-rose-400/40 bg-rose-500/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-500/20"
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

      {!pipeline.isRunning && wsStatus !== 'connected' && (
        <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-zinc-500">
          Waiting for server connection…
        </p>
      )}
      {!pipeline.isRunning && wsStatus === 'connected' && !activeModel && (
        <p className="mt-3 text-[11px] text-zinc-500">
          No model active — streaming will use the DSP pitch shifter and effects rack.
          Load an RVC/ONNX model in the Models tab for full voice conversion.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-400/25 bg-rose-500/10 p-3">
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      )}
      {devices.error && !error && (
        <div className="mt-3 rounded-md border border-amber-300/25 bg-amber-400/10 p-3">
          <p className="text-sm text-amber-100">{devices.error}</p>
        </div>
      )}
    </section>
  );
}
