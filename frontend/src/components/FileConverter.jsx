import React, { memo, useEffect, useRef, useState } from 'react';
import { AudioLines, Download, FileAudio, LoaderCircle, X } from 'lucide-react';
import { convertFile, isAbortError } from '../lib/api';
import { countActiveEffects } from '../lib/effects';
import { FALLBACK_F0_METHODS, findF0Method, groupedMethods } from '../lib/f0Methods';
import { formatBytes } from '../lib/format';

const ACCEPTED = '.wav,.mp3,.flac,.ogg,.m4a,.aiff';

// Offline conversion: renders an uploaded audio file through the active
// model + current studio settings on the server, returns a WAV.
function FileConverter({ voice, effects, activeModel, f0Methods = FALLBACK_F0_METHODS, updateBusy = false, onUpdateBlockChange }) {
  const [file, setFile] = useState(null);
  const [useModel, setUseModel] = useState(true);
  const [converting, setConverting] = useState(false);
  const [result, setResult] = useState(null); // {url, name, size, downloaded}
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [f0Override, setF0Override] = useState('studio');
  const fileInputRef = useRef(null);
  // Owns the in-flight request so Cancel can abort it.
  const abortRef = useRef(null);
  // Latest blob URL, for the unmount cleanup below.
  const resultUrlRef = useRef(null);
  useEffect(() => {
    resultUrlRef.current = result?.url || null;
  }, [result]);

  const fxCount = countActiveEffects(effects, voice.formant);
  const selectedF0 = findF0Method(f0Methods, f0Override === 'studio' ? voice.f0Method : f0Override);
  const offlineGroups = groupedMethods(f0Methods, 'offline');

  useEffect(() => {
    onUpdateBlockChange?.(converting
      ? 'Wait for file conversion to finish before restarting the studio.'
      : result && !result.downloaded
        ? 'Download the converted audio before restarting the studio.'
        : null);
  }, [converting, result, onUpdateBlockChange]);

  // Unmount: release the update block, abandon a running request and free the
  // last blob URL — none of it is reachable once the panel is gone.
  useEffect(() => () => {
    onUpdateBlockChange?.(null);
    abortRef.current?.abort();
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, [onUpdateBlockChange]);

  const pickFile = (candidate) => {
    if (!candidate || updateBusy || converting) return;
    setFile(candidate);
    setError(null);
    setNotice(null);
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleConvert = async () => {
    if (!file || converting || updateBusy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setConverting(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await convertFile(file, {
        pitchShift: voice.pitch,
        formantShift: voice.formant,
        f0Method: selectedF0.id,
        effects,
        useModel: useModel && Boolean(activeModel),
        // The panel promises "uses current studio settings", so the Voice Lab
        // advanced controls have to travel with the render too.
        indexRate: voice.indexRate,
        filterRadius: voice.filterRadius,
        rmsMixRate: voice.rmsMixRate,
        protect: voice.protect,
        crepeHopLength: voice.crepeHopLength,
        signal: controller.signal,
      });
      const name = `${file.name.replace(/\.[^.]+$/, '')}_converted.wav`;
      setResult((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name, size: blob.size, downloaded: false };
      });
    } catch (err) {
      if (isAbortError(err)) {
        setNotice('Conversion cancelled.');
      } else {
        setError(err.message || 'Conversion failed');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setConverting(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">File Converter</p>
          <h2 className="panel-title">Offline voice conversion</h2>
        </div>
        <span className="text-xs text-fg-subtle">
          Uses current studio settings
        </span>
      </div>

      <p className="mt-2 text-sm text-fg-subtle">
        Render a whole audio file through {activeModel ? 'the active model and ' : ''}the
        effect chain — pitch {voice.pitch > 0 ? '+' : ''}{voice.pitch} st,
        formant {voice.formant > 0 ? '+' : ''}{voice.formant} st, {fxCount} effect{fxCount === 1 ? '' : 's'}.
      </p>

      <div className="mt-5">
        <label htmlFor="converter-f0-method" className="block text-xs font-medium text-fg-muted">
          F0 Method
        </label>
        <select
          id="converter-f0-method"
          value={f0Override}
          disabled={converting || updateBusy}
          onChange={(event) => setF0Override(event.target.value)}
          className="native-select-safe mt-2 w-full rounded-lg border border-line-strong bg-input px-3 py-2.5 text-sm text-fg focus:border-line-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="studio">Studio setting — {findF0Method(f0Methods, voice.f0Method).label}</option>
          {offlineGroups.map((group) => (
            <optgroup key={group.section} label={group.section}>
              {group.methods.map((method) => (
                <option key={method.id} value={method.id} disabled={!method.available}>
                  {method.label}{method.available ? '' : ' — unavailable'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className={`mt-2 text-[11px] leading-4 ${selectedF0.available ? 'text-fg-subtle' : 'text-warn-fg'}`}>
          {selectedF0.available ? selectedF0.description : selectedF0.reason}
        </p>
      </div>

      <div
        role="button"
        tabIndex={converting ? -1 : 0}
        aria-label="Choose an audio file to convert"
        aria-disabled={converting}
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
        onClick={() => {
          if (!converting) fileInputRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (converting || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          fileInputRef.current?.click();
        }}
        className={`mt-5 cursor-pointer rounded-lg border border-dashed p-6 text-center transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)] sm:p-8 ${
          dragActive
            ? 'border-line-hover bg-control-hover drag-active'
            : 'border-line-strong bg-raised hover:border-line-hover hover:bg-control'
        } ${converting ? 'pointer-events-none opacity-60' : ''}`}
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
        <FileAudio className="mx-auto mb-3 h-9 w-9 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
        {file ? (
          <>
            <p className="break-all text-sm font-medium text-fg">{file.name}</p>
            <p className="mt-1 text-xs text-fg-subtle">{formatBytes(file.size)} · click to choose another file</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-fg-secondary">
              {dragActive ? 'Drop the audio file here' : 'Drop an audio file or click to browse'}
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              wav · mp3 · flac · ogg · m4a
            </p>
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <label className={`flex min-w-0 flex-wrap items-center gap-2.5 text-sm ${activeModel ? 'text-fg-secondary' : 'text-fg-faint'}`}>
          <input
            type="checkbox"
            checked={useModel && Boolean(activeModel)}
            disabled={!activeModel || converting}
            onChange={(event) => setUseModel(event.target.checked)}
            className="h-4 w-4 flex-shrink-0 accent-primary"
          />
          Run through active model
          <span className="break-all text-xs text-fg-faint">
            {activeModel ? `(${activeModel})` : '(no model active — DSP only)'}
          </span>
        </label>

        {converting ? (
          <button
            type="button"
            onClick={handleCancel}
            data-tone="danger"
            className="frost-control inline-flex min-h-11 items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConvert}
            disabled={!file || updateBusy}
            data-tone="primary"
            className="frost-control inline-flex min-h-11 items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold"
          >
            <AudioLines className="h-4 w-4" aria-hidden="true" />
            Convert
          </button>
        )}
      </div>

      {converting && (
        <p className="mt-3 flex items-center gap-2 text-xs text-fg-subtle" role="status">
          <LoaderCircle className="h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-hidden="true" />
          Converting… long files can take a while — the whole file runs through the pipeline server-side.
        </p>
      )}

      {notice && !converting && (
        <p className="mt-3 text-xs text-fg-subtle" role="status">{notice}</p>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-danger-line bg-danger-bg p-4" role="alert">
          <p className="text-sm text-danger-fg">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-md border border-ok-line bg-ok-bg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-all text-sm font-medium text-ok-fg">
              {result.name} <span className="text-xs text-ok-fg-soft">({formatBytes(result.size)})</span>
            </p>
            <a
              href={result.url}
              download={result.name}
              onClick={() => setResult((current) => current?.url === result.url ? { ...current, downloaded: true } : current)}
              className="chip-button inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download WAV
            </a>
          </div>
          <audio controls src={result.url} className="mt-3 h-9 w-full" />
        </div>
      )}
    </section>
  );
}

export default memo(FileConverter);
