import React, { useRef, useState } from 'react';
import { convertFile } from '../lib/api';
import { countActiveEffects } from '../lib/effects';

const ACCEPTED = '.wav,.mp3,.flac,.ogg,.m4a,.aiff';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Offline conversion: renders an uploaded audio file through the active
// model + current studio settings on the server, returns a WAV.
export default function FileConverter({ voice, effects, activeModel }) {
  const [file, setFile] = useState(null);
  const [useModel, setUseModel] = useState(true);
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState(null); // {url, name, size}
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const fxCount = countActiveEffects(effects, voice.formant);

  const pickFile = (candidate) => {
    if (!candidate) return;
    setFile(candidate);
    setError(null);
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleConvert = async () => {
    if (!file || converting) return;
    setConverting(true);
    setError(null);
    try {
      const blob = await convertFile(file, {
        pitchShift: voice.pitch,
        formantShift: voice.formant,
        f0Method: voice.f0Method,
        effects,
        useModel: useModel && Boolean(activeModel),
        // The panel promises "uses current studio settings", so the Voice Lab
        // advanced controls have to travel with the render too.
        indexRate: voice.indexRate,
        filterRadius: voice.filterRadius,
        rmsMixRate: voice.rmsMixRate,
        protect: voice.protect,
      });
      const name = `${file.name.replace(/\.[^.]+$/, '')}_converted.wav`;
      setResult((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name, size: blob.size };
      });
    } catch (err) {
      setError(err.message || 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">File Converter</p>
          <h2 className="panel-title">Offline voice conversion</h2>
        </div>
        <span className="rounded border border-line-strong bg-control px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
          Uses current studio settings
        </span>
      </div>

      <p className="mt-2 text-sm text-fg-subtle">
        Render a whole audio file through {activeModel ? 'the active model and ' : ''}the
        effect chain — pitch {voice.pitch > 0 ? '+' : ''}{voice.pitch} st,
        formant {voice.formant > 0 ? '+' : ''}{voice.formant} st, {fxCount} effect{fxCount === 1 ? '' : 's'}.
      </p>

      <div
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          pickFile(event.dataTransfer.files?.[0]);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`mt-5 cursor-pointer rounded-md border border-dashed p-8 text-center transition-all duration-200 ${
          dragActive
            ? 'border-line-hover bg-control-hover drag-active'
            : 'border-line-strong bg-raised hover:border-line-hover hover:bg-control'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          onChange={(event) => {
            pickFile(event.target.files?.[0]);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className="hidden"
        />
        <svg className="mx-auto mb-3 h-9 w-9 text-fg-subtle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        {file ? (
          <>
            <p className="text-sm font-medium text-fg">{file.name}</p>
            <p className="mt-1 text-xs text-fg-subtle">{formatSize(file.size)} · click to choose another file</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-fg-secondary">
              {dragActive ? 'Drop the audio file here' : 'Drop an audio file or click to browse'}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-fg-faint">
              wav · mp3 · flac · ogg · m4a
            </p>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <label className={`flex items-center gap-2.5 text-sm ${activeModel ? 'text-fg-secondary' : 'text-fg-faint'}`}>
          <input
            type="checkbox"
            checked={useModel && Boolean(activeModel)}
            disabled={!activeModel}
            onChange={(event) => setUseModel(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Run through active model
          <span className="text-xs text-fg-faint">
            {activeModel ? `(${activeModel})` : '(no model active — DSP only)'}
          </span>
        </label>

        <button
          onClick={handleConvert}
          disabled={!file || converting}
          className="rounded-md bg-primary px-6 py-3 text-sm font-bold uppercase tracking-[0.14em] text-primary-fg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-control-hover disabled:text-fg-subtle"
        >
          {converting ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Converting…
            </span>
          ) : (
            'Convert'
          )}
        </button>
      </div>

      {converting && (
        <p className="mt-3 text-xs text-fg-subtle">
          Long files can take a while — the whole file runs through the pipeline server-side.
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-danger-line bg-danger-bg p-4">
          <p className="text-sm text-danger-fg">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-md border border-ok-line bg-ok-bg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ok-fg">
              {result.name} <span className="text-xs text-ok-fg-soft">({formatSize(result.size)})</span>
            </p>
            <a href={result.url} download={result.name} className="chip-button !normal-case">
              ↓ Download WAV
            </a>
          </div>
          <audio controls src={result.url} className="mt-3 h-9 w-full" />
        </div>
      )}
    </section>
  );
}
