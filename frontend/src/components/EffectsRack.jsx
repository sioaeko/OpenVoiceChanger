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
          ? 'border-ok-line-strong bg-ok-bg-strong'
          : 'border-line-strong bg-input'
      }`}
    >
      <span
        className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-[2px] transition-all duration-150 ${
          enabled ? 'left-[calc(100%-15px)] bg-ok-solid' : 'left-[2px] bg-fg-faint'
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
          ? 'border-ok-line bg-ok-bg'
          : 'border-line bg-raised hover:border-line-hover'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${enabled ? 'text-fg' : 'text-fg-muted'}`}>
            {def.label}
          </p>
          <p className="truncate text-[10px] text-fg-faint">{def.tagline}</p>
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
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
                  {param.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">
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
              ? 'border-ok-line bg-ok-bg text-ok-fg'
              : 'border-line-strong bg-control text-fg-subtle'
          }`}
          >
            {activeCount} active
          </span>
          <button onClick={handleBypassAll} className="chip-button">
            Bypass all
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-fg-subtle">
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
