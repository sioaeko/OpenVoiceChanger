import React, { useEffect, useMemo, useRef, useState } from 'react';

function VuMeter({ label, level }) {
  const percent = Math.min(Math.max(level * 100 * 3, 0), 100);
  const [peak, setPeak] = useState(0);
  const peakRef = useRef(0);

  useEffect(() => {
    // Peak hold with slow decay.
    peakRef.current = Math.max(peakRef.current * 0.96, percent);
    setPeak(peakRef.current);
  }, [percent]);

  // Solid zone coloring, VU convention: green / yellow / red.
  const barColor = useMemo(() => {
    if (percent > 82) return 'bg-rose-400';
    if (percent > 60) return 'bg-amber-300';
    return 'bg-emerald-400';
  }, [percent]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
          {(level * 100).toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2 bg-white/[0.06]">
        <div
          className={`h-full ${barColor} transition-all duration-75 ease-out`}
          style={{ width: `${percent}%` }}
        />
        {peak > 2 && (
          <div
            className="absolute top-0 h-full w-[2px] bg-white/70"
            style={{ left: `calc(${peak}% - 1px)` }}
          />
        )}
      </div>
    </div>
  );
}

function Sparkline({ history }) {
  const path = useMemo(() => {
    if (!history || history.length < 2) return '';
    const w = 100;
    const h = 28;
    const max = Math.max(...history, 50);
    const points = history.map((value, i) => {
      const x = (i / (history.length - 1)) * w;
      const y = h - Math.min(value / max, 1) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M${points.join(' L')}`;
  }, [history]);

  if (!path) {
    return <div className="h-[28px]" />;
  }

  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-[28px] w-full">
      <path d={path} fill="none" stroke="rgba(161,161,170,0.8)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="rounded border border-white/[0.08] bg-black/25 px-3 py-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">{value}</p>
    </div>
  );
}

export default function MonitorDisplay({
  inputLevel,
  outputLevel,
  latency,
  latencyHistory,
  serverMs,
  serverStats,
}) {
  const latencyMs = Math.round(latency);
  const networkMs = Math.max(0, Math.round(latency - (serverMs || 0)));
  const latencyColor =
    latencyMs <= 0
      ? 'text-zinc-500'
      : latencyMs < 60
        ? 'text-emerald-300'
        : latencyMs < 150
          ? 'text-amber-200'
          : 'text-rose-300';

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="panel-kicker">Monitor</p>
          <h2 className="panel-title">Levels & latency</h2>
        </div>
        {serverStats?.effectsActive > 0 && (
          <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">
            {serverStats.effectsActive} FX
          </span>
        )}
      </div>

      <div className="mt-5 space-y-3.5">
        <VuMeter label="Input" level={inputLevel} />
        <VuMeter label="Output" level={outputLevel} />
      </div>

      <div className="mt-5 rounded border border-white/[0.08] bg-black/25 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Round trip
            </p>
            <p className={`mt-1 font-mono text-3xl font-semibold tabular-nums tracking-[-0.04em] ${latencyColor}`}>
              {latencyMs > 0 ? `${latencyMs}` : '--'}
              <span className="ml-1 text-sm text-zinc-500">ms</span>
            </p>
          </div>
          <div className="w-28 flex-shrink-0 sm:w-36">
            <Sparkline history={latencyHistory} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatChip
          label="Model"
          value={serverStats?.modelMs > 0 ? `${Math.round(serverStats.modelMs)}ms` : '--'}
        />
        <StatChip
          label="DSP"
          value={serverStats?.dspMs > 0 ? `${Math.max(1, Math.round(serverStats.dspMs))}ms` : '--'}
        />
        <StatChip label="Network" value={latencyMs > 0 ? `${networkMs}ms` : '--'} />
      </div>
    </section>
  );
}
