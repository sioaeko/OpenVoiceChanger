import React, { useState } from 'react';

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
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xl font-semibold tabular-nums tracking-[-0.03em] ${value === 0 ? 'text-zinc-500' : 'text-zinc-100'}`}>
            {value > 0 ? '+' : ''}{Number(value).toFixed(1)}{unit}
          </span>
          <button
            onClick={onReset}
            disabled={value === 0}
            className="chip-button !px-2.5 !py-1"
          >
            ⟲
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
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-medium text-zinc-600">
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
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</span>
        <span className="font-mono text-xs tabular-nums text-zinc-300">{format(Number(value))}</span>
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
            ? 'border-emerald-300/30 bg-emerald-400/[0.07] text-emerald-200'
            : 'border-white/10 bg-white/[0.03] text-zinc-500'
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

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
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
                    ? 'border-white/30 bg-white/[0.07] text-zinc-100'
                    : 'border-white/[0.08] bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                }`}
              >
                <p className="text-sm font-semibold leading-tight">{method.label}</p>
                <p className={`mt-0.5 text-[11px] ${selected ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {method.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.08] pt-4">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 transition hover:text-zinc-300"
        >
          RVC Advanced
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
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
            <p className="text-[11px] leading-4 text-zinc-600">
              Index rate blends retrieval features, RMS mix follows input loudness,
              protect preserves breaths and consonants.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
