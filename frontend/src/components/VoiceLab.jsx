import React, { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';

const F0_METHODS = [
  { value: 'pm', label: 'PM', description: 'Lowest latency' },
  { value: 'harvest', label: 'Harvest', description: 'Stable tone' },
  { value: 'crepe', label: 'Crepe', description: 'GPU quality' },
  { value: 'rmvpe', label: 'RMVPE', description: 'Best overall' },
  { value: 'fcpe', label: 'FCPE', description: 'Fast neural, realtime' },
];

function BigSlider({ label, value, min, max, step, unit, onChange, onReset }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">{label}</p>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xl font-semibold tabular-nums tracking-normal ${value === 0 ? 'text-fg-subtle' : 'text-fg'}`}>
            {value > 0 ? '+' : ''}{Number(value).toFixed(1)}{unit}
          </span>
          <button
            onClick={onReset}
            disabled={value === 0}
            className="chip-button inline-flex h-7 w-7 items-center justify-center !p-0"
            aria-label={`Reset ${label}`}
            title={`Reset ${label}`}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full"
      />
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium text-fg-faint">
        <span>{min}</span>
        <span>0</span>
        <span>+{max}</span>
      </div>
    </div>
  );
}

function MiniSlider({ label, value, min, max, step, onChange, format = (v) => v.toFixed(2) }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-subtle">{label}</span>
        <span className="font-mono text-xs tabular-nums text-fg-secondary">{format(Number(value))}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="fx-slider mt-2 w-full"
      />
    </div>
  );
}

export default function VoiceLab({ voice, onChange, hasModel, isRunning }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="panel-kicker">Voice Lab</p>
          <h2 className="panel-title">Pitch & timbre</h2>
        </div>
        <span className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
          isRunning
            ? 'border-ok-line bg-ok-bg text-ok-fg'
            : 'border-line-strong bg-control text-fg-subtle'
        }`}
        >
          {isRunning ? 'Live' : 'Applies on start'}
        </span>
      </div>

      <div className="mt-5 space-y-6">
        <BigSlider
          label="Pitch Shift"
          value={voice.pitch}
          min={-12}
          max={12}
          step={0.5}
          unit=" st"
          onChange={(value) => onChange({ pitch: value })}
          onReset={() => onChange({ pitch: 0 })}
        />

        <BigSlider
          label="Formant Shift"
          value={voice.formant}
          min={-12}
          max={12}
          step={0.5}
          unit=" st"
          onChange={(value) => onChange({ formant: value })}
          onReset={() => onChange({ formant: 0 })}
        />
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          F0 Method {hasModel ? '' : '· needs an RVC model'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {F0_METHODS.map((method) => {
            const selected = voice.f0Method === method.value;
            return (
              <button
                key={method.value}
                onClick={() => onChange({ f0Method: method.value })}
                className={`rounded-md border px-3 py-2.5 text-left transition ${
                  selected
                    ? 'border-line-hover bg-control-hover text-fg'
                    : 'border-line bg-raised text-fg-muted hover:border-line-hover hover:text-fg-secondary'
                }`}
              >
                <p className="text-sm font-semibold leading-tight">{method.label}</p>
                <p className={`mt-0.5 text-[11px] ${selected ? 'text-fg-muted' : 'text-fg-faint'}`}>
                  {method.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle transition hover:text-fg-secondary"
        >
          RVC Advanced
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <MiniSlider
              label="Index Rate"
              value={voice.indexRate}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => onChange({ indexRate: value })}
            />
            <MiniSlider
              label="Filter Radius"
              value={voice.filterRadius}
              min={0}
              max={7}
              step={1}
              onChange={(value) => onChange({ filterRadius: value })}
              format={(v) => (v >= 3 ? String(Math.round(v)) : `${Math.round(v)} · off`)}
            />
            <MiniSlider
              label="RMS Mix"
              value={voice.rmsMixRate}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => onChange({ rmsMixRate: value })}
            />
            <MiniSlider
              label="Protect"
              value={voice.protect}
              min={0}
              max={0.5}
              step={0.01}
              onChange={(value) => onChange({ protect: value })}
            />
            <p className="text-[11px] leading-4 text-fg-faint">
              Index rate blends retrieval features, RMS mix follows input loudness,
              protect preserves breaths and consonants. Filter radius median-smooths
              the harvest pitch track — values below 3 disable it.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
