import React, { useMemo } from 'react';

function VolumeBar({ label, level }) {
  // Normalize level: RMS values typically 0..1, scale for display
  const percent = Math.min(Math.max(level * 100 * 3, 0), 100);

  const barColor = useMemo(() => {
    if (percent > 80) return 'from-emerald-500 via-yellow-500 to-rose-500';
    if (percent > 50) return 'from-emerald-500 via-yellow-500 to-yellow-500';
    return 'from-emerald-500 to-emerald-400';
  }, [percent]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-[10px] font-mono text-slate-600">
          {(level * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-75 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function MonitorDisplay({ inputLevel, outputLevel, latency }) {
  const latencyMs = Math.round(latency);
  const latencyColor =
    latencyMs < 30
      ? 'text-emerald-400'
      : latencyMs < 80
        ? 'text-yellow-400'
        : 'text-rose-400';

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/50 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        Monitor
      </h2>

      {/* Volume meters */}
      <div className="space-y-3">
        <VolumeBar label="Input" level={inputLevel} />
        <VolumeBar label="Output" level={outputLevel} />
      </div>

      {/* Latency */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-800/50">
        <div className="flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xs font-medium text-slate-500">Latency</span>
        </div>
        <span className={`text-sm font-mono font-semibold ${latencyColor}`}>
          {latencyMs > 0 ? `${latencyMs} ms` : '-- ms'}
        </span>
      </div>
    </div>
  );
}
