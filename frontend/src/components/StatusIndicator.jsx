import React from 'react';

const STATUS_CONFIG = {
  connected: {
    color: 'bg-emerald-400',
    glow: 'shadow-emerald-400/50',
    label: 'Connected',
  },
  connecting: {
    color: 'bg-amber-300',
    glow: 'shadow-amber-300/50',
    label: 'Connecting',
  },
  disconnected: {
    color: 'bg-zinc-500',
    glow: 'shadow-zinc-500/50',
    label: 'Disconnected',
  },
  error: {
    color: 'bg-rose-300',
    glow: 'shadow-rose-300/50',
    label: 'Error',
  },
};

export default function StatusIndicator({ wsStatus, activeModel }) {
  const config = STATUS_CONFIG[wsStatus] || STATUS_CONFIG.disconnected;

  return (
    <section className="rounded-[28px] border border-white/10 bg-zinc-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
              Transport
            </p>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${config.color} shadow-lg ${config.glow}`}
                />
                {wsStatus === 'connecting' && (
                  <div
                    className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${config.color} animate-ping opacity-75`}
                  />
                )}
              </div>
              <span className="text-base font-medium text-zinc-100">{config.label}</span>
            </div>
          </div>

          <div className="min-w-0 space-y-2 sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
              Active Model
            </p>
            <p className={`truncate text-lg font-semibold ${activeModel ? 'text-cyan-200' : 'text-zinc-500'}`}>
              {activeModel || 'No active model'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.24em] text-zinc-500">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            WebSocket
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            Local Session
          </div>
        </div>
      </div>
    </section>
  );
}
