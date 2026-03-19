import React, { useCallback, useEffect, useRef, useState } from 'react';

const F0_METHODS = [
  { value: 'dio', label: 'DIO', description: 'Fast, lower quality' },
  { value: 'harvest', label: 'Harvest', description: 'Balanced' },
  { value: 'crepe', label: 'CREPE', description: 'Best quality, GPU intensive' },
];

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem('ovc_voice_settings');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

function saveSettings(pitch, f0Method) {
  try {
    localStorage.setItem('ovc_voice_settings', JSON.stringify({ pitch, f0Method }));
  } catch { /* ignore */ }
}

export default function VoiceSettings({ onSettingsChange, disabled }) {
  const saved = loadSavedSettings();
  const [pitch, setPitch] = useState(saved?.pitch ?? 0);
  const [f0Method, setF0Method] = useState(saved?.f0Method ?? 'dio');

  const debounceTimerRef = useRef(null);

  const debouncedSend = useCallback(
    (settings) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onSettingsChange?.(settings);
      }, 200);
    },
    [onSettingsChange]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handlePitchChange = (value) => {
    const newPitch = parseFloat(value);
    setPitch(newPitch);
    saveSettings(newPitch, f0Method);
    debouncedSend({ pitch_shift: newPitch, f0_method: f0Method });
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
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/50 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        Voice Settings
      </h2>

      {/* Pitch shift */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-slate-500">
            Pitch Shift
          </label>
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-mono font-semibold ${
                pitch === 0
                  ? 'text-slate-400'
                  : pitch > 0
                    ? 'text-blue-400'
                    : 'text-purple-400'
              }`}
            >
              {pitch > 0 ? '+' : ''}
              {pitch.toFixed(1)} st
            </span>
            <button
              onClick={handlePitchReset}
              disabled={disabled || pitch === 0}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Reset to 0"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <input
            type="range"
            min="-12"
            max="12"
            step="0.5"
            value={pitch}
            onChange={(e) => handlePitchChange(e.target.value)}
            disabled={disabled}
            className="w-full disabled:opacity-40 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-[10px] text-slate-600">
            <span>-12</span>
            <span>0</span>
            <span>+12</span>
          </div>
        </div>
      </div>

      {/* F0 method */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-500">
          F0 Method
        </label>
        <div className="grid grid-cols-3 gap-2">
          {F0_METHODS.map((method) => (
            <button
              key={method.value}
              onClick={() => handleF0Change(method.value)}
              disabled={disabled}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
                ${
                  f0Method === method.value
                    ? 'bg-blue-600/20 text-blue-400 border-blue-600/50 shadow-sm shadow-blue-500/10'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-300'
                }`}
            >
              <div>{method.label}</div>
              <div
                className={`mt-0.5 text-[9px] ${
                  f0Method === method.value ? 'text-blue-500' : 'text-slate-600'
                }`}
              >
                {method.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
