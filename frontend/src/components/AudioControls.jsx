import React, { useState } from 'react';

export default function AudioControls({
  devices,
  pipeline,
  wsStatus,
  activeModel,
}) {
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const canStart =
    wsStatus === 'connected' && !!activeModel && !pipeline.isRunning;
  const canStop = pipeline.isRunning;

  const handleStart = async () => {
    setError(null);
    setStarting(true);
    try {
      await devices.refresh?.();
      await pipeline.start(
        selectedInput || undefined,
        selectedOutput || undefined
      );
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
    <section className="rounded-[28px] border border-white/10 bg-zinc-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
            Routing
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-zinc-100">
            Input and output path
          </h2>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <p className="max-w-sm text-sm text-zinc-400 sm:text-right">
            Pick devices, activate the current model, and start local streaming.
          </p>
          <button
            onClick={() => devices.refresh?.().catch(() => {})}
            disabled={pipeline.isRunning || devices.isRefreshing}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {devices.isRefreshing ? 'Refreshing...' : 'Refresh Devices'}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Input Device
          </label>

          <select
            value={selectedInput}
            onChange={(e) => setSelectedInput(e.target.value)}
            disabled={pipeline.isRunning}
            className="native-select-safe mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300/40 focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Default Microphone</option>
            {devices.inputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone (${device.deviceId.slice(0, 8)}...)`}
              </option>
            ))}
          </select>

          {!devices.hasLabels && (
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-zinc-600">
              Grant microphone permission to load actual device names.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
            Output Device
          </label>
          <select
            value={selectedOutput}
            onChange={(e) => setSelectedOutput(e.target.value)}
            disabled={pipeline.isRunning}
            className="native-select-safe mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300/40 focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Default Speaker</option>
            {devices.outputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker (${device.deviceId.slice(0, 8)}...)`}
              </option>
            ))}
          </select>

          {devices.permissionState === 'denied' && (
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-rose-300">
              Microphone permission is blocked, so the browser will not expose full device labels.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="text-sm text-zinc-400">
          Start only when the WebSocket is live and one model is active.
        </div>

        {!pipeline.isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="w-full rounded-full border border-cyan-300/30 bg-cyan-300/12 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-50 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-500 lg:w-auto"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Starting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Start Routing
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={!canStop}
            className="w-full rounded-full border border-rose-300/30 bg-rose-300/12 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-rose-50 transition hover:bg-rose-300/18 lg:w-auto"
          >
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Stop Routing
            </span>
          </button>
        )}
      </div>

      {!pipeline.isRunning && !canStart && (
        <p className="mt-4 text-xs uppercase tracking-[0.16em] text-zinc-500">
          {wsStatus !== 'connected'
            ? 'Waiting for server connection...'
            : !activeModel
              ? 'Load and activate a model to begin.'
              : ''}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4">
          <p className="text-sm text-rose-100">{error}</p>
        </div>
      )}

      {devices.error && !error && (
        <div className="mt-4 rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4">
          <p className="text-sm text-amber-100">{devices.error}</p>
        </div>
      )}
    </section>
  );
}
