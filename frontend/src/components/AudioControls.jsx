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
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/50 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        Audio Controls
      </h2>

      {/* Input device */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-500">
          Input Device
        </label>
        <select
          value={selectedInput}
          onChange={(e) => setSelectedInput(e.target.value)}
          disabled={pipeline.isRunning}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Default Microphone</option>
          {devices.inputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone (${device.deviceId.slice(0, 8)}...)`}
            </option>
          ))}
        </select>
      </div>

      {/* Output device */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-500">
          Output Device
        </label>
        <select
          value={selectedOutput}
          onChange={(e) => setSelectedOutput(e.target.value)}
          disabled={pipeline.isRunning}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Default Speaker</option>
          {devices.outputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Speaker (${device.deviceId.slice(0, 8)}...)`}
            </option>
          ))}
        </select>
      </div>

      {/* Start/Stop button */}
      <div className="pt-1">
        {!pipeline.isRunning ? (
          <button
            onClick={handleStart}
            disabled={!canStart || starting}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-emerald-600 to-emerald-500
              hover:from-emerald-500 hover:to-emerald-400
              disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500
              text-white shadow-lg shadow-emerald-600/20
              disabled:shadow-none disabled:cursor-not-allowed
              focus:outline-none focus:ring-2 focus:ring-emerald-500/50
              transform active:scale-[0.98]"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
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
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Start Voice Changer
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={!canStop}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm
              bg-gradient-to-r from-rose-600 to-rose-500
              hover:from-rose-500 hover:to-rose-400
              text-white shadow-lg shadow-rose-600/20
              focus:outline-none focus:ring-2 focus:ring-rose-500/50
              transform active:scale-[0.98]"
          >
            <span className="flex items-center justify-center gap-2">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Stop Voice Changer
            </span>
          </button>
        )}
      </div>

      {/* Disabled reason hints */}
      {!pipeline.isRunning && !canStart && (
        <p className="text-xs text-slate-500 text-center">
          {wsStatus !== 'connected'
            ? 'Waiting for server connection...'
            : !activeModel
              ? 'Load and activate a model to begin.'
              : ''}
        </p>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-rose-900/30 border border-rose-800/50 p-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}
    </div>
  );
}
