import React, { memo, useEffect, useRef, useState } from 'react';
import { Circle, Download, Square, Trash2, Check, Pencil, RefreshCw, X } from 'lucide-react';
import { formatBytes, formatDuration } from '../lib/format';

// The elapsed counter ticks at animation rate. It subscribes to the pipeline's
// meter store and writes the text itself, so a running recording never
// re-renders the rest of the studio.
function RecordTimer({ meters }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!meters?.subscribe) return undefined;
    let shown = null;
    return meters.subscribe((value) => {
      const text = formatDuration(value?.recordSeconds ?? 0);
      if (text !== shown && ref.current) {
        ref.current.textContent = text;
        shown = text;
      }
    });
  }, [meters]);

  return <span ref={ref}>0:00</span>;
}

// Records the converted output stream and offers a WAV download.
function TakeRow({ take, library }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(take.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameRef = useRef(null);
  const deleteRef = useRef(null);
  const finishEditing = () => {
    setEditing(false);
    requestAnimationFrame(() => renameRef.current?.focus());
  };
  const iconButton = 'chip-button inline-flex h-9 w-9 shrink-0 items-center justify-center !p-0';
  return (
    <li className="min-w-0 py-4">
      {editing ? (
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) { library.renameTake(take, name); finishEditing(); }
        }}>
          <input autoFocus aria-label="Take name" maxLength={120} value={name} required
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') finishEditing(); }}
            className="min-w-0 flex-1 rounded border border-line bg-input px-2 py-1 text-sm text-fg" />
          <button className={iconButton} aria-label="Save name" title="Save name" disabled={!name.trim()}><Check className="h-4 w-4" /></button>
          <button type="button" className={iconButton} aria-label="Cancel rename" title="Cancel rename" onClick={finishEditing}><X className="h-4 w-4" /></button>
        </form>
      ) : <p className="break-words text-sm font-medium text-fg-secondary">{take.name}</p>}
      <p className="mt-1 text-xs text-fg-subtle">
        {formatDuration(take.seconds)} · {formatBytes(take.size)} · {take.pending ? 'Saving...' : take.persisted ? 'Saved in this browser' : 'Not saved'}
      </p>
      {!take.persisted && !take.pending && <p role="status" className="mt-2 text-xs text-warn-fg">Storage failed. Download this take before closing the tab, or retry saving.</p>}
      <audio controls preload="none" src={take.url} aria-label={`Play ${take.name}`} className="mt-3 h-9 w-full min-w-0" />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <a href={take.url} download={take.fileName} onClick={() => library.markDownloaded(take.id)}
          className={iconButton} title="Download WAV" aria-label={`Download ${take.name}`}><Download className="h-4 w-4" /></a>
        <button ref={renameRef} className={iconButton} disabled={take.pending} title="Rename take" aria-label={`Rename ${take.name}`}
          onClick={() => { setName(take.name); setEditing(true); }}><Pencil className="h-4 w-4" /></button>
        {!take.persisted && <button className={iconButton} disabled={take.pending} title="Retry saving" aria-label={`Retry saving ${take.name}`}
          onClick={() => library.retrySave(take)}><RefreshCw className="h-4 w-4" /></button>}
        <button ref={deleteRef} className={iconButton} disabled={take.pending} title="Delete take" aria-label={`Delete ${take.name}`}
          onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /></button>
      </div>
      {confirmDelete && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-fg-secondary">Delete this take permanently?</span>
        <button className="chip-button text-danger-fg" disabled={take.pending} onClick={() => {
          setConfirmDelete(false); void library.deleteTake(take);
        }}>Delete</button>
        <button className="chip-button" onClick={() => { setConfirmDelete(false); deleteRef.current?.focus(); }}>Cancel</button>
      </div>}
    </li>
  );
}

function Recorder({ pipeline }) {
  const { isRunning, isRecording, library, recordNotice, meters } = pipeline;

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">Recorder</p>
          <h2 className="panel-title">Capture output</h2>
        </div>

        {isRecording ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-danger-fg">
              <span className="rec-blink inline-block h-2.5 w-2.5 rounded-full bg-danger-solid" />
              <RecordTimer meters={meters} />
            </span>
            <button
              onClick={() => pipeline.stopRecording()}
              data-tone="danger"
              title="Stop recording (shortcut: R)"
              className="frost-control inline-flex h-9 items-center gap-2 px-4 text-xs font-semibold"
            >
              <Square className="h-3 w-3 fill-current" aria-hidden="true" />
              Stop
            </button>
          </div>
        ) : (
          <button
            onClick={() => pipeline.startRecording()}
            disabled={!isRunning}
            data-tone="danger"
            className="frost-control inline-flex h-9 items-center gap-2 px-4 text-xs font-semibold"
            title={isRunning ? 'Record the converted output (shortcut: R)' : 'Start routing first'}
          >
            <Circle className="h-3 w-3 fill-current" aria-hidden="true" />
            Record
          </button>
        )}
      </div>

      {recordNotice && (
        <div
          role="status"
          className={`mt-3 rounded-md border p-3 ${
            recordNotice.tone === 'error'
              ? 'border-danger-line bg-danger-bg'
              : 'border-warn-line bg-warn-bg'
          }`}
        >
          <p className={`text-xs ${recordNotice.tone === 'error' ? 'text-danger-fg' : 'text-warn-fg'}`}>
            {recordNotice.message}
          </p>
        </div>
      )}

      {library.error && <p role="alert" className="mt-3 text-xs text-warn-fg">{library.error}</p>}
      <div className="mt-4 border-t border-line pt-3">
        <p className="text-xs font-semibold text-fg-secondary">Takes ({library.takes.length})</p>
        {library.loading && <p role="status" className="mt-2 text-xs text-fg-subtle">Loading saved takes...</p>}
        {!library.loading && !library.takes.length && <p className="mt-2 text-xs text-fg-faint">No takes yet.</p>}
        <ul className="max-h-96 overflow-y-auto divide-y divide-line">
          {library.takes.map((take) => <TakeRow key={take.id} take={take} library={library} />)}
        </ul>
      </div>
    </section>
  );
}

export default memo(Recorder);
