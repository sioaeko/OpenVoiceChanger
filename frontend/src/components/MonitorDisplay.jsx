import React, { useMemo } from 'react';

function VolumeBar({ label, level }) {
  const percent = Math.min(Math.max(level * 100 * 3, 0), 100);

  const barColor = useMemo(() => {
    if (percent > 80) return 'from-emerald-500 via-yellow-500 to-rose-500';
    if (percent > 50) return 'from-emerald-500 via-yellow-500 to-yellow-500';
    return 'from-cyan-300 to-emerald-400';
  }, [percent]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">{label}</span>
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-600">
          {(level * 100).toFixed(1)}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
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
      ? 'text-emerald-300'
      : latencyMs < 80
        ? 'text-amber-200'
        : 'text-rose-300';

  return (
    <section className="rounded-[28px] border border-white/10 bg-zinc-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="border-b border-white/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
          Monitor
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-zinc-100">
          Live levels
        </h2>
      </div>

      <div className="mt-6 space-y-4">
        <VolumeBar label="Input" level={inputLevel} />
        <VolumeBar label="Output" level={outputLevel} />
      </div>

      <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-4">
        <div className="grid grid-cols-[7.75rem_minmax(0,1fr)] items-start gap-4">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Round Trip
            </p>
            <p className={`mt-2 whitespace-nowrap text-3xl font-semibold tracking-[-0.05em] tabular-nums ${latencyColor}`}>
              {latencyMs > 0 ? `${latencyMs} ms` : '--'}
            </p>
          </div>
          <p className="min-w-0 text-right text-sm text-zinc-500">
            Includes WebSocket transfer and active model inference.
          </p>
        </div>
      </div>
    </section>
  );
}
