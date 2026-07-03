import React from 'react';

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

// Records the converted output stream and offers a WAV download.
export default function Recorder({ pipeline }) {
  const { isRunning, isRecording, recordSeconds, lastRecording } = pipeline;

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="panel-kicker">Recorder</p>
          <h2 className="panel-title">Capture output</h2>
        </div>

        {isRecording ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-rose-200">
              <span className="rec-blink inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
              {formatDuration(recordSeconds)}
            </span>
            <button
              onClick={() => pipeline.stopRecording()}
              className="rounded border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-500/25"
            >
              ■ Stop
            </button>
          </div>
        ) : (
          <button
            onClick={() => pipeline.startRecording()}
            disabled={!isRunning}
            className="rounded border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            title={isRunning ? 'Record the converted output' : 'Start routing first'}
          >
            ● Record
          </button>
        )}
      </div>

      {lastRecording ? (
        <div className="mt-4 rounded-md border border-white/[0.08] bg-black/25 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Last take · {formatDuration(lastRecording.seconds)} · {formatSize(lastRecording.size)}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={lastRecording.url}
                download={`voice-take-${Date.now()}.wav`}
                className="chip-button !normal-case"
              >
                ↓ Download WAV
              </a>
              <button onClick={() => pipeline.discardRecording()} className="chip-button !px-2.5">
                ✕
              </button>
            </div>
          </div>
          <audio controls src={lastRecording.url} className="mt-3 h-9 w-full" />
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-600">
          {isRunning
            ? 'Capture the converted voice as a 16-bit WAV file.'
            : 'Start the voice changer, then record your converted voice.'}
        </p>
      )}
    </section>
  );
}
