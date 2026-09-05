import React, { useState } from 'react';
import { Check, Download, LoaderCircle, RefreshCw, X } from 'lucide-react';

const phases = {
  queued: 'Setup queued', preparing: 'Preparing installer', python: 'Installing isolated Python',
  packages: 'Installing CPU packages', sources: 'Installing RVC and fairseq', assets: 'Downloading model assets',
  verifying: 'Testing HuBERT and RMVPE inference', switching: 'Switching runtime', restarting: 'Restarting studio',
  complete: 'CPU runtime verified', cancelled: 'Setup cancelled', error: 'Setup failed', recovery_required: 'Recovery required',
};
const mib = (value) => `${(value / 1024 ** 2).toFixed(1)} MiB`;
const control = 'frost-control inline-flex min-h-9 items-center justify-center gap-2 px-3 py-2 text-xs font-medium disabled:opacity-50';

export default function RuntimeSetupPanel({ setup }) {
  const [confirming, setConfirming] = useState(false);
  if (!setup) return null;
  const { state, busy, error, offline, blocked, pending, cancelRequested } = setup;
  const operation = state?.operation || {};
  const reason = blocked || state?.blocked;
  const phase = operation.phase;
  const canCancel = state?.busy && !['switching', 'restarting'].includes(phase);
  const installed = Boolean(state?.active_job);
  const failed = ['error', 'cancelled'].includes(phase);
  const disabled = !state || busy || offline || Boolean(reason) || phase === 'recovery_required';
  return (
    <div className="mt-3 border-t border-line pt-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-fg-secondary">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            : installed ? <Check className="h-4 w-4 text-ok-fg" aria-hidden="true" /> : null}
          {phases[phase] || (installed ? 'Isolated CPU runtime installed' : 'Windows x64 / CPU setup')}
        </span>
        {!confirming && !busy && <button type="button" className={control} disabled={disabled}
          onClick={() => setConfirming(true)}><Download className="h-3.5 w-3.5" aria-hidden="true" />
          {failed ? 'Retry setup' : installed ? 'Reinstall runtime' : 'Set up RVC'}</button>}
        {canCancel && <button type="button" className={control} onClick={setup.cancel} disabled={cancelRequested}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />{cancelRequested ? 'Cancelling...' : 'Cancel setup'}</button>}
      </div>
      {confirming && !busy && <div className="mt-3 space-y-3">
        <p className="text-fg-muted">Python {state?.plan?.python}, CPU packages, HuBERT and RMVPE ({mib(state?.plan?.asset_bytes || 0)} of model assets).
          Requires 6 GiB free. Additional packages are downloaded. Existing Python and CUDA installations stay unchanged.</p>
        <p className="text-fg-muted">The studio restarts after verification. CPU only; GPU acceleration, voice checkpoints and optional ONNX weights are not included.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={control} disabled={disabled} onClick={() => { setConfirming(false); setup.install(); }}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Install and restart</button>
          <button type="button" className={control} onClick={() => setConfirming(false)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />Cancel</button>
        </div>
      </div>}
      {busy && <div role="status" className="mt-3 space-y-2 text-fg-muted">
        <p>{pending ? 'Requesting setup...' : operation.file || phases[phase]}</p>
        <progress className="h-1.5 w-full accent-current" aria-label={operation.file ? `Downloading ${operation.file}` : phases[phase]}
          value={operation.total_bytes > 0 ? operation.downloaded_bytes : undefined} max={operation.total_bytes || undefined} />
        {operation.total_bytes > 0 && <p>{mib(operation.downloaded_bytes)} / {mib(operation.total_bytes)}</p>}
      </div>}
      {offline && <div role="status" className="mt-3 flex flex-wrap items-center gap-2 text-warn-fg">
        <span>{busy ? 'Waiting for the server. If it stays offline, check the launcher log.' : 'Setup status unavailable.'}</span>
        <button type="button" className={control} onClick={setup.refresh} aria-label="Refresh setup status" title="Refresh setup status">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>}
      {!busy && reason && <p className="mt-2 text-fg-muted">{reason}</p>}
      {(error || operation.error) && <p role="alert" className="mt-2 break-words text-danger-fg">{error || operation.error}</p>}
    </div>
  );
}
