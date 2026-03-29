import React, { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'ovc_voice_settings';
const F0_METHODS = [
  { value: 'pm', label: 'PM', description: 'Lowest latency' },
  { value: 'harvest', label: 'Harvest', description: 'More stable tone' },
  { value: 'crepe', label: 'Crepe', description: 'Best quality on GPU' },
];

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveSettings(pitch, f0Method) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pitch, f0Method }));
  } catch {
    // Ignore storage failures.
  }
}

export default function VoiceSettings({ onSettingsChange, disabled }) {
  const savedSettings = loadSavedSettings();
  const [pitch, setPitch] = useState(savedSettings?.pitch ?? 0);
  const [f0Method, setF0Method] = useState(savedSettings?.f0Method ?? 'pm');

  const debounceTimerRef = useRef(null);
  const currentSettingsRef = useRef({ pitch, f0Method });

  useEffect(() => {
    currentSettingsRef.current = { pitch, f0Method };
  }, [pitch, f0Method]);

  useEffect(() => () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!disabled) {
      onSettingsChange?.({
        pitch_shift: currentSettingsRef.current.pitch,
        f0_method: currentSettingsRef.current.f0Method,
      });
    }
  }, [disabled, onSettingsChange]);

  const debouncedSend = useCallback(
    (settings) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        onSettingsChange?.(settings);
      }, 180);
    },
    [onSettingsChange]
  );

  const handlePitchChange = (value) => {
    const nextPitch = Number(value);
    setPitch(nextPitch);
    saveSettings(nextPitch, f0Method);
    debouncedSend({ pitch_shift: nextPitch, f0_method: f0Method });
  };

  const handleF0Change = (value) => {
    setF0Method(value);
    saveSettings(pitch, value);
    debouncedSend({ pitch_shift: pitch, f0_method: value });
  };

  const handlePitchReset = () => {
    setPitch(0);
    saveSettings(0, f0Method);
    debouncedSend({ pitch_shift: 0, f0_method: f0Method });
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-zinc-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="border-b border-white/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
          Voice Tuning
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-zinc-100">
          Pitch and F0
        </h2>
      </div>

      <div className="mt-6 border-b border-white/10 pb-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
            Pitch Shift
          </p>

          <div className="flex items-center gap-3">
            <span className={`text-2xl font-semibold tracking-[-0.04em] tabular-nums ${
              pitch === 0 ? 'text-zinc-300' : 'text-amber-200'
            }`}
            >
              {pitch > 0 ? '+' : ''}
              {pitch.toFixed(1)} st
            </span>

            <button
              onClick={handlePitchReset}
              disabled={disabled || pitch === 0}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-400 transition hover:border-amber-200/30 hover:bg-amber-200/10 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-6">
          <input
            type="range"
            min="-12"
            max="12"
            step="0.5"
            value={pitch}
            onChange={(event) => handlePitchChange(event.target.value)}
            disabled={disabled}
            className="w-full disabled:cursor-not-allowed disabled:opacity-40"
          />

          <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
            <span>-12</span>
            <span>0</span>
            <span>+12</span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-zinc-500">
          F0 Method
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {F0_METHODS.map((method) => {
            const selected = f0Method === method.value;

            return (
              <button
                key={method.value}
                onClick={() => handleF0Change(method.value)}
                disabled={disabled}
                className={`rounded-[24px] border px-5 py-5 text-left transition ${
                  selected
                    ? 'border-cyan-300/35 bg-cyan-300/12 text-cyan-50'
                    : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20 hover:bg-white/[0.03]'
                } min-w-0 disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <p className="min-w-0 text-base font-semibold leading-tight tracking-[0.04em] text-zinc-100 sm:text-lg">
                  {method.label}
                </p>
                <p className={`mt-2 text-sm ${
                  selected ? 'text-cyan-100/80' : 'text-zinc-500'
                }`}
                >
                  {method.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-5 text-xs uppercase tracking-[0.18em] text-zinc-500">
        {disabled ? 'Start routing to adjust live voice tuning.' : 'Changes apply to the active stream.'}
      </p>
    </section>
  );
}
