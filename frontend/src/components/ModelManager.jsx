import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchModels,
  uploadModel,
  deleteModel,
  activateModel,
  deactivateModel,
  getActiveModel,
} from '../lib/api';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getModelType(name) {
  if (name.endsWith('.onnx')) return 'ONNX';
  if (name.endsWith('.pth') || name.endsWith('.pt')) return 'RVC';
  return 'Unknown';
}

function MetaBadge({ children, tone = 'default' }) {
  const tones = {
    default: 'border-white/10 bg-white/[0.03] text-zinc-500',
    emerald: 'border-emerald-300/30 bg-emerald-400/[0.07] text-emerald-200',
  };
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${tones[tone] || tones.default}`}>
      {children}
    </span>
  );
}

export default function ModelManager({ activeModel = null, onActiveModelChange }) {
  const [models, setModels] = useState([]);
  const [activeModelName, setActiveModelName] = useState(null);
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
      const nextActiveModelName = active?.name || active?.model || null;
      setModels(Array.isArray(modelList) ? modelList : []);
      setActiveModelName(nextActiveModelName);
      onActiveModelChange?.(nextActiveModelName);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, [onActiveModelChange]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    setActiveModelName(activeModel || null);
  }, [activeModel]);

  const syncActiveModel = useCallback((name) => {
    setActiveModelName(name);
    onActiveModelChange?.(name);
  }, [onActiveModelChange]);

  const handleUpload = async (file) => {
    if (!file) return;

    const validExtensions = ['.onnx', '.pth', '.pt', '.index'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
      setError('Invalid file type. Please upload .onnx, .pth, .pt, or .index files.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    let progressInterval;
    try {
      progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      await uploadModel(file);

      clearInterval(progressInterval);
      progressInterval = null;
      setUploadProgress(100);

      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);

      await loadModels();
    } catch (err) {
      setError(err.message || 'Upload failed');
      setUploading(false);
      setUploadProgress(0);
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => handleUpload(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    files.forEach((file) => handleUpload(file));
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
    setOperatingOn(activeModelName);
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
      if (activeModelName === name) {
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
          className="rounded border border-white/10 bg-white/[0.03] p-2 text-zinc-500 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-zinc-200"
          title="Refresh models"
        >
          <svg
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        One model runs at a time. Matching <code className="text-zinc-400">.index</code> files
        are picked up automatically. Without a model the studio runs in pure DSP mode.
      </p>

      <div
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
        className={`relative mt-5 cursor-pointer rounded-md border border-dashed p-7 text-center transition-all duration-200 ${
          dragActive
            ? 'border-white/40 bg-white/[0.05] drag-active'
            : 'border-white/[0.12] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
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
        <svg
          className="mx-auto mb-3 h-9 w-9 text-zinc-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm font-medium text-zinc-200">
          {dragActive ? 'Drop model files here' : 'Drop checkpoints or click to upload'}
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-zinc-600">
          .pth / .pt / .onnx + optional .index
        </p>

        {uploading && (
          <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-[22px] bg-white/5">
            <div
              className="h-full bg-zinc-200 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-400/20 bg-rose-400/10 p-4">
          <svg
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p className="text-sm text-rose-100">{error}</p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <svg className="h-5 w-5 animate-spin text-zinc-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : models.length === 0 ? (
          <p className="rounded-md border border-white/[0.07] bg-black/20 px-4 py-8 text-center text-sm text-zinc-500">
            No models yet — upload an RVC checkpoint, or just use the DSP studio.
          </p>
        ) : (
          models.map((model) => {
            const name = typeof model === 'string' ? model : model.name;
            const size = typeof model === 'object' ? (model.size_bytes ?? model.size ?? null) : null;
            const hasIndex = typeof model === 'object' && Boolean(model.has_index);
            const details = typeof model === 'object' ? model.details : null;
            const isActive = activeModelName === name;
            const isOperating = operatingOn === name;
            const type = getModelType(name);

            return (
              <div
                key={name}
                className={`rounded-md border px-4 py-4 transition ${
                  isActive
                    ? 'border-emerald-300/30 bg-emerald-400/[0.04]'
                    : 'border-white/[0.07] bg-black/20 hover:border-white/[0.15]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" />
                      )}
                      <span className="truncate text-base font-medium text-zinc-100" title={name}>
                        {name}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <MetaBadge>{type}</MetaBadge>
                      {size != null && <MetaBadge>{formatFileSize(size)}</MetaBadge>}
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
                        className="rounded border border-emerald-300/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                      >
                        {isOperating ? '…' : 'Active'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(name)}
                        disabled={isOperating}
                        className="rounded border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
                      >
                        {isOperating ? 'Loading…' : 'Activate'}
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(name)}
                      disabled={isOperating}
                      className={`rounded border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition disabled:opacity-50 ${
                        deleteConfirm === name
                          ? 'border-rose-300/40 bg-rose-300/15 text-rose-100'
                          : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-rose-300/30 hover:bg-rose-300/10 hover:text-rose-100'
                      }`}
                    >
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
