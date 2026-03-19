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
  if (name.endsWith('.pth')) return 'RVC';
  return 'Unknown';
}

export default function ModelManager() {
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
    try {
      const [modelList, active] = await Promise.all([
        fetchModels(),
        getActiveModel(),
      ]);
      setModels(Array.isArray(modelList) ? modelList : []);
      setActiveModelName(active?.name || active?.model || null);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleUpload = async (file) => {
    if (!file) return;

    const validExtensions = ['.onnx', '.pth'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!validExtensions.includes(ext)) {
      setError('Invalid file type. Please upload .onnx or .pth files.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Simulate progress since fetch doesn't support progress natively
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      await uploadModel(file);

      clearInterval(progressInterval);
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
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleActivate = async (name) => {
    setOperatingOn(name);
    setError(null);
    try {
      await activateModel(name);
      setActiveModelName(name);
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
      setActiveModelName(null);
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
        setActiveModelName(null);
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
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/50 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Models
        </h2>
        <button
          onClick={loadModels}
          disabled={loading}
          className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          title="Refresh models"
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
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

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
          transition-all duration-200
          ${
            dragActive
              ? 'border-blue-400 bg-blue-500/10 drag-active'
              : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".onnx,.pth"
          onChange={handleFileSelect}
          className="hidden"
        />
        <svg
          className="w-8 h-8 mx-auto mb-2 text-slate-500"
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
        <p className="text-sm text-slate-400">
          {dragActive
            ? 'Drop model file here'
            : 'Drag & drop or click to upload'}
        </p>
        <p className="text-xs text-slate-600 mt-1">.onnx, .pth files</p>

        {/* Upload progress */}
        {uploading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800 rounded-b-xl overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-rose-900/30 border border-rose-800/50 p-3 flex items-start gap-2">
          <svg
            className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-2">
        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <svg
              className="animate-spin h-5 w-5 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : models.length === 0 ? (
          <p className="text-sm text-slate-600 text-center py-6">
            No models uploaded yet.
          </p>
        ) : (
          models.map((model) => {
            const name = typeof model === 'string' ? model : model.name;
            const size = typeof model === 'object' ? (model.size_bytes ?? model.size ?? null) : null;
            const isActive = activeModelName === name;
            const isOperating = operatingOn === name;
            const type = getModelType(name);

            return (
              <div
                key={name}
                className={`group rounded-lg border p-3 transition-all duration-200 ${
                  isActive
                    ? 'border-emerald-600/50 bg-emerald-900/10'
                    : 'border-slate-800 bg-slate-800/20 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Active indicator */}
                    {isActive && (
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 shadow-sm shadow-emerald-400/50" />
                    )}

                    {/* Model name */}
                    <span
                      className="text-sm font-medium text-slate-200 truncate"
                      title={name}
                    >
                      {name}
                    </span>

                    {/* Type badge */}
                    <span
                      className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        type === 'ONNX'
                          ? 'bg-blue-900/50 text-blue-400 border border-blue-800/50'
                          : type === 'RVC'
                            ? 'bg-purple-900/50 text-purple-400 border border-purple-800/50'
                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      {type}
                    </span>

                    {/* Size */}
                    {size != null && (
                      <span className="text-[11px] text-slate-600 flex-shrink-0">
                        {formatFileSize(size)}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Activate / Deactivate */}
                    {isActive ? (
                      <button
                        onClick={handleDeactivate}
                        disabled={isOperating}
                        className="text-xs px-2.5 py-1 rounded-md bg-emerald-800/40 text-emerald-400 hover:bg-emerald-800/60 border border-emerald-700/50 disabled:opacity-50 transition-colors"
                      >
                        {isOperating ? '...' : 'Active'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(name)}
                        disabled={isOperating}
                        className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 border border-slate-700 hover:border-blue-700/50 disabled:opacity-50 transition-colors"
                      >
                        {isOperating ? '...' : 'Activate'}
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(name)}
                      disabled={isOperating}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                        deleteConfirm === name
                          ? 'bg-rose-800/40 text-rose-400 border-rose-700/50'
                          : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-rose-400 hover:bg-rose-900/20 hover:border-rose-700/50'
                      }`}
                    >
                      {deleteConfirm === name ? 'Confirm?' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
