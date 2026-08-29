import React, { useMemo } from 'react';

const SAMPLE_RATE_OPTIONS = [32000, 40000, 44100, 48000];
const CHUNK_SIZE_OPTIONS = [1024, 2048, 4096, 8192];

const SunIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const MoonIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

/**
 * Light/Dark picker.
 *
 * A radiogroup rather than a pair of buttons: the two options are mutually
 * exclusive states of one setting, which is what lets a screen reader announce
 * "2 of 2, Dark, selected" and what makes arrow keys move between them. Each
 * option keeps both an icon and its text label so the choice never depends on
 * recognising a glyph.
 */
function ThemePicker({ theme, onThemeChange }) {
  const handleKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = Math.max(0, THEME_OPTIONS.findIndex(({ value }) => value === theme));
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? THEME_OPTIONS.length - 1
        : (currentIndex + delta + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    const nextTheme = THEME_OPTIONS[nextIndex].value;

    onThemeChange?.(nextTheme);
    event.currentTarget
      .querySelector(`[data-theme-option="${nextTheme}"]`)
      ?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      onKeyDown={handleKeyDown}
      className="mt-4 flex items-center gap-0.5 rounded-md border border-[color:var(--frost-border)] bg-sunken p-0.5"
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const selected = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-theme-option={value}
            onClick={() => onThemeChange?.(value)}
            data-selected={selected}
            className={`flex flex-1 items-center justify-center gap-2 rounded border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              selected
                ? 'frost-control text-fg'
                : 'border-transparent text-fg-subtle transition-colors duration-150 ease-out hover:text-fg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)]'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
}

function RuntimeBadge({ label, ready }) {
  return (
    <div className={`rounded-md border px-4 py-3 ${
      ready
        ? 'border-ok-line bg-ok-bg text-ok-fg'
        : 'border-line-strong bg-raised text-fg-subtle'
    }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fg-subtle">
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
    <div className="rounded-md border border-line-strong bg-raised px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fg-subtle">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-fg">
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-fg-subtle">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export default function GlobalSettings({ config, onChange, disabled, onClose, theme, onThemeChange }) {
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
    <section className="rounded-lg border border-line-strong bg-overlay p-6 shadow-[0_32px_120px_var(--overlay-shadow)] backdrop-blur-2xl sm:p-7">
      <div className="flex flex-col gap-4 border-b border-line-strong pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-fg-subtle">
            Global Settings
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-fg">
            Session runtime
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            Keep stream defaults and hardware runtime details in one place.
          </p>
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            /* frost-control owns the surface, border, radius, transition and
               focus ring — see index.css. */
            className="frost-control inline-flex h-10 w-10 items-center justify-center text-fg-muted hover:text-fg-secondary"
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
        <div className="rounded-md border border-line-strong bg-raised p-5">
          <div className="flex flex-col gap-2 border-b border-line-strong pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fg-subtle">
              Stream Defaults
            </p>
            <p className="text-sm text-fg-muted">
              Applied to the next routing session. Stop routing before changing these values.
            </p>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.2em] text-fg-subtle">
                Sample Rate
              </label>
              <select
                value={config.sampleRate}
                onChange={(event) => onChange?.({ sampleRate: Number(event.target.value) })}
                disabled={disabled}
                className="native-select-safe mt-3 w-full rounded-md border border-line-strong bg-raised px-4 py-3 text-sm text-fg outline-none transition focus:border-line-hover focus:bg-control disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sampleRateOptions.map((value) => (
                  <option key={value} value={value}>
                    {value.toLocaleString()} Hz
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.2em] text-fg-subtle">
                Chunk Size
              </label>
              <select
                value={config.chunkSize}
                onChange={(event) => onChange?.({ chunkSize: Number(event.target.value) })}
                disabled={disabled}
                className="native-select-safe mt-3 w-full rounded-md border border-line-strong bg-raised px-4 py-3 text-sm text-fg outline-none transition focus:border-line-hover focus:bg-control disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chunkSizeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value.toLocaleString()} samples
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-5 text-xs uppercase tracking-[0.18em] text-fg-subtle">
            {disabled
              ? 'Routing is active. Stop the stream to edit global defaults.'
              : 'Saved locally and synced to the server before the next stream starts.'}
          </p>

          <div className="mt-6 border-t border-line-strong pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fg-subtle">
              Appearance
            </p>
            <ThemePicker theme={theme} onThemeChange={onThemeChange} />
          </div>
        </div>

        <div className="rounded-md border border-line-strong bg-raised p-5">
          <div className="flex flex-col gap-4 border-b border-line-strong pb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-fg-subtle">
                Hardware Runtime
              </p>
              <p className="mt-2 text-sm text-fg-muted">
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
