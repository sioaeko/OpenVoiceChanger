import React, { memo, useCallback } from 'react';
import Toggle from './Toggle';
import { EFFECT_DEFS, countActiveEffects, defaultEffects } from '../lib/effects';

function formatValue(param, value) {
  const num = Number(value);
  const text = param.step >= 1 ? String(Math.round(num)) : num.toFixed(2).replace(/\.?0+$/, '');
  return `${text}${param.unit ? ` ${param.unit}` : ''}`;
}

// Memoized so dragging one card's slider repaints that card only, not the
// other eleven.
const EffectCard = memo(function EffectCard({ def, state, onChange }) {
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
          <p className="mt-0.5 text-[11px] leading-4 text-fg-faint">{def.tagline}</p>
        </div>
        <Toggle
          checked={enabled}
          label={`Toggle ${def.label}`}
          onChange={(next) => onChange(def.key, { ...state, enabled: next })}
        />
      </div>

      {def.params.length > 0 && (
        <div className={`mt-3 space-y-2.5 ${enabled ? '' : 'pointer-events-none opacity-35'}`}>
          {def.params.map((param) => (
            <div key={param.key}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-fg-subtle">
                  {param.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                  {formatValue(param, state?.[param.key] ?? param.default)}
                </span>
              </div>
              <input
                type="range"
                aria-label={`${def.label} ${param.label}`}
                disabled={!enabled}
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
});

// `onEffectsChange` accepts either the next rack or an updater over the
// previous one (it is forwarded to a React state setter). The updater form
// keeps this callback free of `effects`, and therefore stable for the cards.
function EffectsRack({ effects, formantShift = 0, onEffectsChange }) {
  const activeCount = countActiveEffects(effects, formantShift);

  const handleChange = useCallback((key, entry) => {
    onEffectsChange((previous) => ({ ...previous, [key]: entry }));
  }, [onEffectsChange]);

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
          <span className={`rounded border px-2.5 py-1 text-[11px] font-medium ${
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

export default memo(EffectsRack);
