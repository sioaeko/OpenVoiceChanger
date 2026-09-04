import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CircleX, LoaderCircle, RefreshCw, Trash2, Upload } from 'lucide-react';
import {
  fetchModels,
  uploadModel,
  deleteModel,
  activateModel,
  deactivateModel,
  getActiveModel,
} from '../lib/api';
import { formatBytes } from '../lib/format';

// A "Confirm" that stays armed forever is a trap for the next stray click.
const DELETE_CONFIRM_MS = 4000;

function getModelType(name) {
  if (name.endsWith('.onnx')) return 'ONNX';
  if (name.endsWith('.pth') || name.endsWith('.pt')) return 'RVC';
  return 'Unknown';
}

function MetaBadge({ children, tone = 'default' }) {
  const tones = {
    default: 'border-line-strong bg-control text-fg-subtle',
    emerald: 'border-ok-line bg-ok-bg text-ok-fg',
  };
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${tones[tone] || tones.default}`}>
      {children}
    </span>
  );
}

// The active model is owned by the parent: this panel reports what the server
// says through `onActiveModelChange` and renders `activeModel` as given, so
// there is one source of truth instead of a local mirror to keep in step.
//
// `active` is true while the Models tab is showing. The panel stays mounted
// across tab switches, so this is what triggers a fresh listing on each visit.
function ModelManager({ activeModel = null, onActiveModelChange, active = true }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [operatingOn, setOperatingOn] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [modelList, active] = await Promise.all([
        fetchModels(),
        getActiveModel(),
      ]);
      setModels(Array.isArray(modelList) ? modelList : []);
      onActiveModelChange?.(active?.name || active?.model || null);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [onActiveModelChange]);

  useEffect(() => {
    if (active) loadModels();
  }, [active, loadModels]);

  // Disarm a pending delete confirmation after a moment.
  useEffect(() => {
    if (!deleteConfirm) return undefined;
    const timer = setTimeout(() => setDeleteConfirm(null), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [deleteConfirm]);

  const syncActiveModel = useCallback((name) => {
    onActiveModelChange?.(name);
  }, [onActiveModelChange]);

  const validateUploadFile = (file) => {
    const validExtensions = ['.onnx', '.pth', '.pt', '.index'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
      return 'Invalid file type. Please upload .onnx, .pth, .pt, or .index files.';
    }
    return null;
  };

  // Uploaded one at a time: a single progress bar can only honestly track one
  // transfer, and checkpoints are large enough that parallel uploads just
  // compete for the same bandwidth.
  const handleUploadAll = async (files) => {
    if (uploading || files.length === 0) return;

    const validationError = files.map(validateUploadFile).find(Boolean);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      for (const file of files) {
        setUploadProgress(0);
        // Real byte-level transport progress from the XHR upload stream.
        await uploadModel(file, setUploadProgress);
        setUploadProgress(100);
        // Keep the model list truthful even if a later file fails.
        await loadModels();
      }
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    handleUploadAll(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    handleUploadAll(files);
  };

  const handleActivate = async (name) => {
    setOperatingOn(name);
    setError(null);
    try {
      await activateModel(name);
      syncActiveModel(name);
      await loadModels();
    } catch (err) {
      setError(err.message || 'Failed to activate model');
    } finally {
      setOperatingOn(null);
    }
  };

  const handleDeactivate = async () => {
    setOperatingOn(activeModel);
    setError(null);
    try {
      await deactivateModel();
      syncActiveModel(null);
    } catch (err) {
      setError(err.message || 'Failed to deactivate model');
    } finally {
      setOperatingOn(null);
    }
  };

  const handleDelete = async (name) => {
    if (deleteConfirm !== name) {
      setDeleteConfirm(name);
      return;
    }

    setDeleteConfirm(null);
    setOperatingOn(name);
    setError(null);

    try {
      if (activeModel === name) {
        await deactivateModel();
        syncActiveModel(null);
      }
      await deleteModel(name);
      await loadModels();
    } catch (err) {
      setError(err.message || 'Failed to delete model');
    } finally {
      setOperatingOn(null);
    }
  };

  return (
    <section className="panel p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="panel-kicker">Model Bay</p>
          <h2 className="panel-title">Voice models</h2>
        </div>

        <button
          onClick={loadModels}
          disabled={loading}
          className="chip-button inline-flex h-9 w-9 items-center justify-center !p-0"
          aria-label="Refresh models"
          title="Refresh models"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <p className="mt-2 text-sm text-fg-subtle">
        One model runs at a time. Matching <code className="text-fg-muted">.index</code> files
        are picked up automatically. Without a model the studio runs in pure DSP mode.
      </p>

      <div
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-label="Upload voice model files"
        aria-disabled={uploading}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (uploading || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          fileInputRef.current?.click();
        }}
        className={`relative mt-5 cursor-pointer rounded-lg border border-dashed p-6 text-center transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--frost-focus)] sm:p-7 ${
          dragActive
            ? 'border-line-hover bg-control-hover drag-active'
            : 'border-line-strong bg-raised hover:border-line-hover hover:bg-control'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".onnx,.pth,.pt,.index"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <Upload className="mx-auto mb-3 h-9 w-9 text-fg-subtle" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-sm font-medium text-fg-secondary">
          {dragActive ? 'Drop model files here' : 'Drop checkpoints or click to upload'}
        </p>
        <p className="mt-1 text-xs text-fg-faint">
          .pth / .pt / .onnx + optional .index
        </p>

        {uploading && (
          <>
            <p className="mt-3 font-mono text-[11px] tabular-nums text-fg-muted">
              {uploadProgress >= 99 ? 'Finalizing on the server…' : `Uploading… ${uploadProgress}%`}
            </p>
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-lg bg-meter-track">
              <div
                className="h-full bg-primary"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-danger-line bg-danger-bg p-4">
          <CircleX className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger-fg" aria-hidden="true" />
          <p className="text-sm text-danger-fg">{error}</p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <LoaderCircle className="h-5 w-5 animate-spin text-fg-subtle" aria-hidden="true" />
          </div>
        ) : models.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-subtle">
            No models yet — upload an RVC checkpoint, or just use the DSP studio.
          </p>
        ) : (
          models.map((model) => {
            const name = typeof model === 'string' ? model : model.name;
            const size = typeof model === 'object' ? (model.size_bytes ?? model.size ?? null) : null;
            const hasIndex = typeof model === 'object' && Boolean(model.has_index);
            const details = typeof model === 'object' ? model.details : null;
            const isActive = activeModel === name;
            const isOperating = operatingOn === name;
            const type = getModelType(name);

            return (
              <div
                key={name}
                className={`rounded-lg border px-4 py-4 transition-colors ${
                  isActive
                    ? 'border-ok-line bg-ok-bg'
                    : 'border-line bg-raised hover:border-line-hover'
                }`}
              >
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-ok-solid" />
                      )}
                      <span className="truncate text-base font-medium text-fg" title={name}>
                        {name}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <MetaBadge>{type}</MetaBadge>
                      {size != null && <MetaBadge>{formatBytes(size)}</MetaBadge>}
                      {hasIndex && <MetaBadge tone="emerald">Index</MetaBadge>}
                      {details?.version && <MetaBadge>{details.version}</MetaBadge>}
                      {details?.target_sample_rate && (
                        <MetaBadge>{(details.target_sample_rate / 1000).toFixed(0)} kHz</MetaBadge>
                      )}
                      {details?.f0 === true && <MetaBadge>F0</MetaBadge>}
                      {details?.device && <MetaBadge>{details.device}</MetaBadge>}
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    {isActive ? (
                      <button
                        onClick={handleDeactivate}
                        disabled={isOperating}
                        title="Click to deactivate"
                        data-tone="success"
                        className="frost-control min-h-8 px-3 py-1.5 text-xs font-medium"
                      >
                        {isOperating ? '…' : 'Active'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(name)}
                        disabled={isOperating}
                        className="chip-button"
                      >
                        {isOperating ? 'Loading…' : 'Activate'}
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(name)}
                      disabled={isOperating}
                      data-tone={deleteConfirm === name ? 'danger' : undefined}
                      aria-label={deleteConfirm === name ? `Confirm deleting ${name}` : `Delete ${name}`}
                      title={deleteConfirm === name ? 'Click again to delete permanently' : undefined}
                      className="frost-control inline-flex min-h-8 min-w-[84px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-fg-muted"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {deleteConfirm === name ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default memo(ModelManager);
