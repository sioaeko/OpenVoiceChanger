import React from 'react';

const STATUS_CONFIG = {
  connected: {
    color: 'bg-emerald-500',
    glow: 'shadow-emerald-500/50',
    label: 'Connected',
  },
  connecting: {
    color: 'bg-yellow-500',
    glow: 'shadow-yellow-500/50',
    label: 'Connecting...',
  },
  disconnected: {
    color: 'bg-slate-500',
    glow: 'shadow-slate-500/50',
    label: 'Disconnected',
  },
  error: {
    color: 'bg-rose-500',
    glow: 'shadow-rose-500/50',
    label: 'Error',
  },
};

export default function StatusIndicator({ wsStatus, activeModel }) {
  const config = STATUS_CONFIG[wsStatus] || STATUS_CONFIG.disconnected;

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/50 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Connection status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div
                className={`w-2.5 h-2.5 rounded-full ${config.color} shadow-lg ${config.glow}`}
              />
              {wsStatus === 'connecting' && (
                <div
                  className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${config.color} animate-ping opacity-75`}
                />
              )}
            </div>
            <span className="text-sm font-medium text-slate-300">
              {config.label}
            </span>
          </div>
        </div>

        {/* Active model */}
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          {activeModel ? (
            <span className="text-sm font-medium text-emerald-400">
              {activeModel}
            </span>
          ) : (
            <span className="text-sm text-slate-500">No model loaded</span>
          )}
        </div>
      </div>
    </div>
  );
}
