import React, { useEffect, useRef } from 'react';
import { Circle, Download, Square, Trash2 } from 'lucide-react';
import { formatRecordLimit } from '../lib/recording';

function formatDuration(seconds) {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
export default function Recorder({ pipeline }) {
  const { isRunning, isRecording, lastRecording, recordNotice, meters, maxRecordSeconds } = pipeline;

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
              className="inline-flex items-center gap-2 rounded border border-danger-line-strong bg-danger-bg px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-danger-fg transition hover:bg-danger-bg-strong"
            >
              <Square className="h-3 w-3 fill-current" aria-hidden="true" />
              Stop
            </button>
          </div>
        ) : (
          <button
            onClick={() => pipeline.startRecording()}
            disabled={!isRunning}
            className="inline-flex items-center gap-2 rounded border border-danger-line bg-danger-bg px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-danger-fg transition hover:bg-danger-bg-strong disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-control disabled:text-fg-faint"
            title={isRunning ? 'Record the converted output' : 'Start routing first'}
          >
            <Circle className="h-3 w-3 fill-current" aria-hidden="true" />
            Record
          </button>
        )}
      </div>

      {recordNotice && (
        <div
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

      {lastRecording ? (
        <div className="mt-4 rounded-md border border-line bg-input p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
              Last take · {formatDuration(lastRecording.seconds)} · {formatSize(lastRecording.size)}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={lastRecording.url}
                download={`voice-take-${Date.now()}.wav`}
                className="chip-button inline-flex items-center gap-1.5 !normal-case"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download WAV
              </a>
              <button
                onClick={() => pipeline.discardRecording()}
                className="chip-button inline-flex h-8 w-8 items-center justify-center !p-0"
                aria-label="Discard recording"
                title="Discard recording"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <audio controls src={lastRecording.url} className="mt-3 h-9 w-full" />
        </div>
      ) : (
        <p className="mt-3 text-xs text-fg-faint">
          {isRunning
            ? `Capture the converted voice as a 16-bit WAV file. Takes are held in memory and stop automatically at ${formatRecordLimit(maxRecordSeconds)}.`
            : 'Start the voice changer, then record your converted voice.'}
        </p>
      )}
    </section>
  );
}
