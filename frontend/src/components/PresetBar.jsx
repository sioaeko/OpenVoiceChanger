import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { fetchPresets, savePreset, deletePreset } from '../lib/api';

function PresetChip({ preset, active, onApply, onDelete }) {
  return (
    <div className="group relative flex-shrink-0">
      <button
        onClick={() => onApply(preset)}
        title={preset.description}
        className={`rounded border px-3 py-2 text-sm font-medium transition ${
          active
            ? 'border-ok-line-strong bg-ok-bg-strong text-ok-fg'
            : 'border-line bg-input text-fg-muted hover:border-line-hover hover:text-fg-secondary'
        }`}
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {preset.emoji && (
            <span aria-hidden="true" className="text-base leading-none">
              {preset.emoji}
            </span>
          )}
          {preset.name}
        </span>
      </button>
      {onDelete && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete(preset);
          }}
          title="Delete preset"
          aria-label={`Delete ${preset.name} preset`}
          className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded border border-danger-line-strong bg-panel text-danger-fg opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function PresetBar({ activePresetId, onApplyPreset, getCurrentSettings }) {
  const [presets, setPresets] = useState({ builtin: [], user: [] });
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPresets();
      setPresets({
        builtin: Array.isArray(data?.builtin) ? data.builtin : [],
        user: Array.isArray(data?.user) ? data.user : [],
      });
      setError(null);
    } catch {
      setError('Preset service unavailable');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await savePreset(name, getCurrentSettings());
      setSaveName('');
      setShowSave(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset) => {
    try {
      await deletePreset(preset.id);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete preset');
    }
  };

  return (
    <section id="presets" className="panel scroll-mt-20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">Presets</p>
          <h2 className="panel-title">One-click voices</h2>
        </div>

        <div className="flex items-center gap-2">
          {showSave ? (
            <div className="flex items-center gap-2">
              <input
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSave();
                  if (event.key === 'Escape') setShowSave(false);
                }}
                placeholder="Preset name"
                maxLength={40}
                autoFocus
                className="w-40 rounded border border-line-hover bg-input px-3 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:border-line-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)]"
              />
              <button onClick={handleSave} disabled={saving || !saveName.trim()} className="chip-button inline-flex items-center gap-1.5">
                {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                Save
              </button>
              <button
                onClick={() => setShowSave(false)}
                className="chip-button inline-flex h-8 w-8 items-center justify-center !p-0"
                aria-label="Cancel preset save"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowSave(true)} className="chip-button inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Save current
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-danger-fg">{error}</p>}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 pt-2">
        {presets.builtin.map((preset) => (
          <PresetChip
            key={preset.id}
            preset={preset}
            active={activePresetId === preset.id}
            onApply={onApplyPreset}
          />
        ))}
        {presets.user.length > 0 && <div className="mx-1 w-px flex-shrink-0 self-stretch bg-line-strong" />}
        {presets.user.map((preset) => (
          <PresetChip
            key={preset.id}
            preset={preset}
            active={activePresetId === preset.id}
            onApply={onApplyPreset}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </section>
  );
}
