import React from 'react';
import { EFFECT_DEFS, countActiveEffects, defaultEffects } from '../lib/effects';

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className={`relative h-[18px] w-8 flex-shrink-0 rounded-[3px] border transition-colors duration-150 ${
        enabled
          ? 'border-emerald-300/50 bg-emerald-400/20'
          : 'border-white/10 bg-black/40'
      }`}
    >
      <span
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-[2px] transition-all duration-150 ${
          enabled ? 'left-[calc(100%-15px)] bg-emerald-300' : 'left-[2px] bg-zinc-600'
        }`}
      />
    </button>
  );
}

function formatValue(param, value) {
  const num = Number(value);
  const text = param.step >= 1 ? String(Math.round(num)) : num.toFixed(2).replace(/\.?0+$/, '');
  return `${text}${param.unit ? ` ${param.unit}` : ''}`;
}

function EffectCard({ def, state, onChange }) {
  const enabled = Boolean(state?.enabled);

  return (
    <div
      className={`rounded-md border p-3.5 transition-colors duration-150 ${
        enabled
          ? 'border-emerald-300/30 bg-emerald-400/[0.04]'
          : 'border-white/[0.08] bg-black/20 hover:border-white/[0.16]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${enabled ? 'text-zinc-100' : 'text-zinc-400'}`}>
            {def.label}
          </p>
          <p className="truncate text-[10px] text-zinc-600">{def.tagline}</p>
        </div>
        <Toggle
          enabled={enabled}
          onToggle={() => onChange(def.key, { ...state, enabled: !enabled })}
        />
      </div>

      {def.params.length > 0 && (
        <div className={`mt-3 space-y-2.5 ${enabled ? '' : 'pointer-events-none opacity-35'}`}>
          {def.params.map((param) => (
            <div key={param.key}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                  {param.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                  {formatValue(param, state?.[param.key] ?? param.default)}
                </span>
              </div>
              <input
                type="range"
                min={param.min}
                max={param.max}
                step={param.step}
                value={state?.[param.key] ?? param.default}
                onChange={(event) =>
                  onChange(def.key, { ...state, [param.key]: Number(event.target.value) })
                }
                className="fx-slider mt-1 w-full"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EffectsRack({ effects, formantShift = 0, onEffectsChange }) {
  const activeCount = countActiveEffects(effects, formantShift);

  const handleChange = (key, entry) => {
    onEffectsChange({ ...effects, [key]: entry });
  };

  const handleBypassAll = () => {
    onEffectsChange(defaultEffects());
  };

  return (
    <section id="effects" className="panel scroll-mt-20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">Effects Rack</p>
          <h2 className="panel-title">DSP chain</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            activeCount > 0
              ? 'border-emerald-300/30 bg-emerald-400/[0.07] text-emerald-200'
              : 'border-white/10 bg-white/[0.03] text-zinc-500'
          }`}
          >
            {activeCount} active
          </span>
          <button onClick={handleBypassAll} className="chip-button">
            Bypass all
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Runs on the server after model inference — works with or without a voice model.
        The noise gate runs on the mic signal before conversion.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {EFFECT_DEFS.map((def) => (
          <EffectCard
            key={def.key}
            def={def}
            state={effects[def.key]}
            onChange={handleChange}
          />
        ))}
      </div>
    </section>
  );
}
