import React from 'react';

const STATUS_CONFIG = {
  connected: { color: 'bg-ok-solid', label: 'Live' },
  connecting: { color: 'bg-warn-solid', label: 'Connecting' },
  disconnected: { color: 'bg-fg-subtle', label: 'Offline' },
  error: { color: 'bg-danger-solid', label: 'Error' },
};

// Compact header status: connection dot, engine mode, active model.
export default function StatusIndicator({ wsStatus, activeModel, mode, bypass = false }) {
  const failed = mode === 'error' && !bypass;
  const config = failed && wsStatus === 'connected'
    ? { color: 'bg-danger-solid', label: 'Muted' }
    : STATUS_CONFIG[wsStatus] || STATUS_CONFIG.disconnected;
  // Bypass replaces the engine label: while it is on, neither the model nor
  // the DSP chain is doing anything, so naming either one would be a lie.
  const bypassed = bypass || mode === 'bypass';
  const engineLabel = bypassed
    ? 'BYPASS'
    : failed ? 'ERROR' : activeModel
      ? (mode === 'onnx' ? 'ONNX' : 'RVC')
      : 'DSP';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded border border-line bg-control px-2.5 py-1.5">
        <div className="relative">
          <div className={`h-2 w-2 rounded-full ${config.color}`} />
          {wsStatus === 'connecting' && (
            <div className={`absolute inset-0 h-2 w-2 rounded-full ${config.color} animate-ping opacity-75`} />
          )}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-secondary">
          {config.label}
        </span>
      </div>

      <div
        className={`hidden items-center gap-2 rounded border px-2.5 py-1.5 md:flex ${
          bypassed
            ? 'border-warn-line-strong bg-warn-bg'
            : 'border-line bg-control'
        }`}
        title={
          bypassed
            ? 'Conversion bypassed — monitoring raw input (press B)'
            : failed ? 'Model inference failed; output muted' : activeModel || 'No model loaded — pure DSP mode'
        }
      >
        <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
          bypassed ? 'text-warn-fg' : 'text-fg-secondary'
        }`}
        >
          {engineLabel}
        </span>
        <span className={`max-w-[160px] truncate text-[11px] ${
          bypassed ? 'text-warn-fg-soft' : 'text-fg-subtle'
        }`}
        >
          {bypassed ? 'Raw input' : (activeModel || 'Effects only')}
        </span>
      </div>
    </div>
  );
}
