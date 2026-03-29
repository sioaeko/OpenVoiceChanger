import React, { useMemo } from 'react';

const SAMPLE_RATE_OPTIONS = [32000, 40000, 44100, 48000];
const CHUNK_SIZE_OPTIONS = [1024, 2048, 4096, 8192];

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
}

function RuntimeBadge({ label, ready }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${
      ready
        ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-50'
        : 'border-white/10 bg-black/20 text-zinc-500'
    }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium">
        {ready ? 'Ready' : 'Unavailable'}
      </p>
    </div>
  );
}

function RuntimeItem({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-zinc-100">
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export default function GlobalSettings({ config, onChange, disabled, onClose }) {
  const sampleRateOptions = useMemo(
    () => uniqueSorted([config.sampleRate, ...SAMPLE_RATE_OPTIONS]),
    [config.sampleRate]
  );
  const chunkSizeOptions = useMemo(
    () => uniqueSorted([config.chunkSize, ...CHUNK_SIZE_OPTIONS]),
    [config.chunkSize]
  );
  const onnxSelectedProviders = config.runtime?.onnx?.selectedProviders || [];
  const onnxProviders = config.runtime?.onnx?.availableProviders || [];
  const onnxProvider = config.runtime?.onnx?.activeProvider || (config.runtime?.onnx?.available ? 'CPUExecutionProvider' : 'Unavailable');
  const torchDevice = config.runtime?.torch?.device || 'unavailable';
  const gpuName = config.runtime?.torch?.gpuName || (torchDevice === 'cpu' ? 'CPU only' : 'Not detected');
  const cudaVersion = config.runtime?.torch?.cudaVersion || 'Not detected';
  const onnxGpuReady = Boolean(config.runtime?.onnx?.gpuEnabled);
  const torchGpuReady = Boolean(config.runtime?.torch?.cudaAvailable);

  return (
    <section className="rounded-[30px] border border-white/10 bg-zinc-950/92 p-6 shadow-[0_32px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-7">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-zinc-500">
            Global Settings
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-zinc-100">
            Session runtime
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Keep stream defaults and hardware runtime details in one place.
          </p>
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
            aria-label="Close settings"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-2 border-b border-white/10 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Stream Defaults
            </p>
            <p className="text-sm text-zinc-400">
              Applied to the next routing session. Stop routing before changing these values.
            </p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Sample Rate
              </label>
              <select
                value={config.sampleRate}
                onChange={(event) => onChange?.({ sampleRate: Number(event.target.value) })}
                disabled={disabled}
                className="native-select-safe mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300/40 focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sampleRateOptions.map((value) => (
                  <option key={value} value={value}>
                    {value.toLocaleString()} Hz
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                Chunk Size
              </label>
              <select
                value={config.chunkSize}
                onChange={(event) => onChange?.({ chunkSize: Number(event.target.value) })}
                disabled={disabled}
                className="native-select-safe mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-300/40 focus:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chunkSizeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value.toLocaleString()} samples
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.18em] text-zinc-500">
            {disabled
              ? 'Routing is active. Stop the stream to edit global defaults.'
              : 'Saved locally and synced to the server before the next stream starts.'}
          </p>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                Hardware Runtime
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                What the backend currently sees for ONNX, PyTorch, GPU, and CUDA.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <RuntimeBadge label="ONNX Runtime" ready={config.runtime?.onnx?.available} />
              <RuntimeBadge label="PyTorch / RVC" ready={config.runtime?.torch?.available} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <RuntimeItem
              label="ONNX Provider"
              value={onnxProvider}
              detail={
                onnxSelectedProviders.length > 0
                  ? `Selected: ${onnxSelectedProviders.join(', ')}. Available: ${onnxProviders.join(', ')}`
                  : onnxProviders.length > 0
                    ? `Available: ${onnxProviders.join(', ')}`
                    : 'No providers detected'
              }
            />
            <RuntimeItem
              label="PyTorch Device"
              value={torchDevice}
              detail={torchGpuReady ? 'CUDA acceleration is available to PyTorch.' : 'PyTorch is running without CUDA acceleration.'}
            />
            <RuntimeItem
              label="GPU"
              value={gpuName}
              detail={onnxGpuReady ? 'ONNX Runtime can use CUDAExecutionProvider.' : 'ONNX Runtime is currently on CPU provider only.'}
            />
            <RuntimeItem
              label="CUDA"
              value={cudaVersion}
              detail={config.runtime?.torch?.cudaAvailable ? 'Reported by torch.version.cuda.' : 'CUDA was not reported by the current PyTorch runtime.'}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
