import React from 'react';

const STATUS_CONFIG = {
  connected: { color: 'bg-emerald-400', label: 'Live' },
  connecting: { color: 'bg-amber-300', label: 'Connecting' },
  disconnected: { color: 'bg-zinc-500', label: 'Offline' },
  error: { color: 'bg-rose-400', label: 'Error' },
};

// Compact header status: connection dot, engine mode, active model.
export default function StatusIndicator({ wsStatus, activeModel, mode }) {
  const config = STATUS_CONFIG[wsStatus] || STATUS_CONFIG.disconnected;
  const engineLabel = activeModel
    ? (mode === 'onnx' ? 'ONNX' : 'RVC')
    : 'DSP';

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
        <div className="relative">
          <div className={`h-2 w-2 rounded-full ${config.color}`} />
          {wsStatus === 'connecting' && (
            <div className={`absolute inset-0 h-2 w-2 rounded-full ${config.color} animate-ping opacity-75`} />
          )}
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
          {config.label}
        </span>
      </div>

      <div
        className="hidden items-center gap-2 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 md:flex"
        title={activeModel || 'No model loaded — pure DSP mode'}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-200">
          {engineLabel}
        </span>
        <span className="max-w-[160px] truncate text-[11px] text-zinc-500">
          {activeModel || 'Effects only'}
        </span>
      </div>
    </div>
  );
}
