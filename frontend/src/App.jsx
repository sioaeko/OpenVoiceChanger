import React, { useCallback, useEffect, useState } from 'react';
import Layout from './components/Layout';
import StatusIndicator from './components/StatusIndicator';
import AudioControls from './components/AudioControls';
import GlobalSettings from './components/GlobalSettings';
import ModelManager from './components/ModelManager';
import VoiceSettings from './components/VoiceSettings';
import MonitorDisplay from './components/MonitorDisplay';
import useWebSocket from './hooks/useWebSocket';
import useAudioPipeline from './hooks/useAudioPipeline';
import useAudioDevices from './hooks/useAudioDevices';
import { getActiveModel, fetchConfig } from './lib/api';
import { applyConfig } from './lib/constants';

const GLOBAL_SETTINGS_STORAGE_KEY = 'ovc_global_settings';
const DEFAULT_RUNTIME_INFO = {
  onnx: {
    available: false,
    activeProvider: null,
    availableProviders: [],
    gpuEnabled: false,
  },
  torch: {
    available: false,
    device: 'unavailable',
    gpuName: null,
    cudaAvailable: false,
    cudaVersion: null,
  },
};
const DEFAULT_RUNTIME_CONFIG = {
  sampleRate: 40000,
  chunkSize: 4096,
  runtime: DEFAULT_RUNTIME_INFO,
};

function normalizePositiveInt(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}

function readStoredGlobalSettings() {
  try {
    const saved = localStorage.getItem(GLOBAL_SETTINGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function writeStoredGlobalSettings(config) {
  try {
    localStorage.setItem(
      GLOBAL_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        sampleRate: config.sampleRate,
        chunkSize: config.chunkSize,
      })
    );
  } catch {
    // Ignore storage failures.
  }
}

function mergeRuntimeConfig(config, stored = null) {
  const baseSampleRate = normalizePositiveInt(
    config?.sample_rate ?? config?.sampleRate,
    DEFAULT_RUNTIME_CONFIG.sampleRate
  );
  const baseChunkSize = normalizePositiveInt(
    config?.chunk_size ?? config?.chunkSize,
    DEFAULT_RUNTIME_CONFIG.chunkSize
  );

  return {
    sampleRate: normalizePositiveInt(stored?.sampleRate, baseSampleRate),
    chunkSize: normalizePositiveInt(stored?.chunkSize, baseChunkSize),
    runtime: {
      onnx: {
        ...DEFAULT_RUNTIME_INFO.onnx,
        available: Boolean(config?.runtime?.onnx?.available ?? config?.onnx_available),
        activeProvider: config?.runtime?.onnx?.activeProvider ?? DEFAULT_RUNTIME_INFO.onnx.activeProvider,
        availableProviders: Array.isArray(config?.runtime?.onnx?.availableProviders)
          ? config.runtime.onnx.availableProviders
          : DEFAULT_RUNTIME_INFO.onnx.availableProviders,
        gpuEnabled: Boolean(config?.runtime?.onnx?.gpuEnabled),
      },
      torch: {
        ...DEFAULT_RUNTIME_INFO.torch,
        available: Boolean(config?.runtime?.torch?.available ?? config?.torch_available),
        device: config?.runtime?.torch?.device ?? DEFAULT_RUNTIME_INFO.torch.device,
        gpuName: config?.runtime?.torch?.gpuName ?? DEFAULT_RUNTIME_INFO.torch.gpuName,
        cudaAvailable: Boolean(config?.runtime?.torch?.cudaAvailable),
        cudaVersion: config?.runtime?.torch?.cudaVersion ?? DEFAULT_RUNTIME_INFO.torch.cudaVersion,
      },
    },
  };
}

export default function App() {
  const wsHook = useWebSocket();
  const pipeline = useAudioPipeline(wsHook);
  const devices = useAudioDevices();
  const [activeModel, setActiveModel] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState(DEFAULT_RUNTIME_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const {
    status: wsStatus,
    latency,
    connect,
    disconnect,
    sendSettings,
    setOnSettingsResponse,
  } = wsHook;

  useEffect(() => {
    const storedConfig = readStoredGlobalSettings();

    fetchConfig()
      .then((cfg) => {
        const nextRuntimeConfig = mergeRuntimeConfig(cfg, storedConfig);
        applyConfig({
          sample_rate: nextRuntimeConfig.sampleRate,
          chunk_size: nextRuntimeConfig.chunkSize,
        });
        setRuntimeConfig(nextRuntimeConfig);
      })
      .catch(() => {
        const nextRuntimeConfig = mergeRuntimeConfig({}, storedConfig);
        applyConfig({
          sample_rate: nextRuntimeConfig.sampleRate,
          chunk_size: nextRuntimeConfig.chunkSize,
        });
        setRuntimeConfig(nextRuntimeConfig);
      })
      .finally(() => connect());
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const checkActiveModel = async () => {
      try {
        const active = await getActiveModel();
        setActiveModel(active?.name || active?.model || null);
      } catch {
        // Server may not be ready yet.
      }
    };

    checkActiveModel();
    const interval = setInterval(checkActiveModel, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setOnSettingsResponse?.((msg) => {
      if (msg.type === 'model_change') {
        setActiveModel(msg.model || null);
      }
    });
  }, [setOnSettingsResponse]);

  const handleSettingsChange = useCallback(
    (settings) => {
      sendSettings(settings);
    },
    [sendSettings]
  );

  const handleGlobalSettingsChange = useCallback(
    (partialConfig) => {
      setRuntimeConfig((currentConfig) => {
        const nextRuntimeConfig = {
          ...currentConfig,
          sampleRate: normalizePositiveInt(
            partialConfig.sampleRate,
            currentConfig.sampleRate
          ),
          chunkSize: normalizePositiveInt(
            partialConfig.chunkSize,
            currentConfig.chunkSize
          ),
        };

        writeStoredGlobalSettings(nextRuntimeConfig);
        applyConfig({
          sample_rate: nextRuntimeConfig.sampleRate,
          chunk_size: nextRuntimeConfig.chunkSize,
        });

        if (!pipeline.isRunning && wsStatus === 'connected') {
          sendSettings({
            sample_rate: nextRuntimeConfig.sampleRate,
            chunk_size: nextRuntimeConfig.chunkSize,
          });
        }

        return nextRuntimeConfig;
      });
    },
    [pipeline.isRunning, sendSettings, wsStatus]
  );

  useEffect(() => {
    if (!isSettingsOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen]);

  const headerActions = (
    <button
      onClick={() => setIsSettingsOpen(true)}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
      Settings
    </button>
  );

  return (
    <Layout headerActions={headerActions}>
      <>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(360px,420px)_1fr]">
          <div className="space-y-6">
            <StatusIndicator
              wsStatus={wsStatus}
              activeModel={activeModel}
            />
            <ModelManager
              activeModel={activeModel}
              onActiveModelChange={setActiveModel}
            />
          </div>

          <div className="space-y-6">
            <AudioControls
              devices={devices}
              pipeline={pipeline}
              wsStatus={wsStatus}
              activeModel={activeModel}
            />

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <VoiceSettings
                onSettingsChange={handleSettingsChange}
                disabled={!pipeline.isRunning}
              />
              <MonitorDisplay
                inputLevel={pipeline.inputLevel}
                outputLevel={pipeline.outputLevel}
                latency={latency}
              />
            </div>
          </div>
        </div>
        {isSettingsOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
            <button
              className="absolute inset-0 bg-black/72 backdrop-blur-md"
              onClick={() => setIsSettingsOpen(false)}
              aria-label="Close settings modal"
            />
            <div className="relative max-h-[calc(100svh-2.5rem)] w-full max-w-5xl overflow-y-auto">
              <GlobalSettings
                config={runtimeConfig}
                onChange={handleGlobalSettingsChange}
                disabled={pipeline.isRunning}
                onClose={() => setIsSettingsOpen(false)}
              />
            </div>
          </div>
        ) : null}
      </>
    </Layout>
  );
}
