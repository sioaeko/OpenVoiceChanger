import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from './components/Layout';
import StatusIndicator from './components/StatusIndicator';
import AudioControls from './components/AudioControls';
import GlobalSettings from './components/GlobalSettings';
import ModelManager from './components/ModelManager';
import MonitorDisplay from './components/MonitorDisplay';
import Visualizer from './components/Visualizer';
import VoiceLab from './components/VoiceLab';
import EffectsRack from './components/EffectsRack';
import PresetBar from './components/PresetBar';
import Recorder from './components/Recorder';
import FileConverter from './components/FileConverter';
import useWebSocket from './hooks/useWebSocket';
import useAudioPipeline from './hooks/useAudioPipeline';
import useAudioDevices from './hooks/useAudioDevices';
import { getActiveModel, fetchConfig } from './lib/api';
import { applyConfig } from './lib/constants';
import { defaultEffects, effectsFromPreset } from './lib/effects';

const GLOBAL_SETTINGS_STORAGE_KEY = 'ovc_global_settings';
const VOICE_STORAGE_KEY = 'ovc_voice_v2';
const EFFECTS_STORAGE_KEY = 'ovc_effects_v2';

const DEFAULT_VOICE = {
  pitch: 0,
  formant: 0,
  f0Method: 'pm',
  indexRate: 0.75,
  rmsMixRate: 0.25,
  protect: 0.33,
};

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

function readStored(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
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
        selectedProviders: Array.isArray(config?.runtime?.onnx?.selectedProviders)
          ? config.runtime.onnx.selectedProviders
          : [],
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

function loadInitialVoice() {
  const stored = readStored(VOICE_STORAGE_KEY);
  return stored ? { ...DEFAULT_VOICE, ...stored } : { ...DEFAULT_VOICE };
}

function loadInitialEffects() {
  const stored = readStored(EFFECTS_STORAGE_KEY);
  return stored ? effectsFromPreset(stored) : defaultEffects();
}

export default function App() {
  const wsHook = useWebSocket();
  const pipeline = useAudioPipeline(wsHook);
  const devices = useAudioDevices();

  // Deep links: ?tab=models|converter selects a tab, ?settings opens the modal.
  const [tab, setTab] = useState(() => {
    const param = new URLSearchParams(window.location.search).get('tab');
    return ['studio', 'models', 'converter'].includes(param) ? param : 'studio';
  });
  const [activeModel, setActiveModel] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState(DEFAULT_RUNTIME_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    () => new URLSearchParams(window.location.search).has('settings')
  );
  const [voice, setVoice] = useState(loadInitialVoice);
  const [effects, setEffects] = useState(loadInitialEffects);
  const [activePresetId, setActivePresetId] = useState(null);
  const [latencyHistory, setLatencyHistory] = useState([]);

  const {
    status: wsStatus,
    latency,
    serverMs,
    serverStats,
    connect,
    disconnect,
    sendSettings,
    setOnSettingsResponse,
    setOnOpen,
  } = wsHook;

  // --- Settings payload sync -------------------------------------------------

  const settingsPayloadRef = useRef(null);
  settingsPayloadRef.current = {
    pitch_shift: voice.pitch,
    formant_shift: voice.formant,
    f0_method: voice.f0Method,
    index_rate: voice.indexRate,
    rms_mix_rate: voice.rmsMixRate,
    protect: voice.protect,
    effects,
  };

  const settingsDebounceRef = useRef(null);
  useEffect(() => {
    writeStored(VOICE_STORAGE_KEY, voice);
    writeStored(EFFECTS_STORAGE_KEY, effects);

    if (wsStatus !== 'connected') return undefined;
    if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current);
    settingsDebounceRef.current = setTimeout(() => {
      sendSettings(settingsPayloadRef.current);
    }, 140);
    return () => {
      if (settingsDebounceRef.current) clearTimeout(settingsDebounceRef.current);
    };
  }, [voice, effects, wsStatus, sendSettings]);

  // Push the full current settings as soon as a connection opens.
  useEffect(() => {
    setOnOpen(() => sendSettings(settingsPayloadRef.current));
  }, [setOnOpen, sendSettings]);

  // --- Bootstrap -------------------------------------------------------------

  useEffect(() => {
    const storedConfig = readStored(GLOBAL_SETTINGS_STORAGE_KEY);

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

  // SPA-safe anchor scrolling (e.g. /#effects) once the page has rendered.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return undefined;
    const timer = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
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
      if (msg.type === 'status' && msg.active_model !== undefined) {
        setActiveModel(msg.active_model);
      }
    });
  }, [setOnSettingsResponse]);

  // Rolling round-trip latency history for the sparkline.
  useEffect(() => {
    if (latency <= 0) return;
    setLatencyHistory((prev) => {
      const next = [...prev, latency];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, [latency]);

  useEffect(() => {
    if (!pipeline.isRunning) setLatencyHistory([]);
  }, [pipeline.isRunning]);

  // --- Handlers --------------------------------------------------------------

  const handleVoiceChange = useCallback((partial) => {
    setActivePresetId(null);
    setVoice((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleEffectsChange = useCallback((nextEffects) => {
    setActivePresetId(null);
    setEffects(nextEffects);
  }, []);

  const applyPreset = useCallback((preset) => {
    const settings = preset?.settings || {};
    setVoice((prev) => ({
      ...prev,
      pitch: Number(settings.pitch_shift ?? 0),
      formant: Number(settings.formant_shift ?? 0),
    }));
    setEffects(effectsFromPreset(settings.effects));
    setActivePresetId(preset.id);
  }, []);

  const getCurrentSettings = useCallback(() => ({
    pitch_shift: voice.pitch,
    formant_shift: voice.formant,
    effects,
  }), [voice, effects]);

  const handleGlobalSettingsChange = useCallback(
    (partialConfig) => {
      setRuntimeConfig((currentConfig) => {
        const nextRuntimeConfig = {
          ...currentConfig,
          sampleRate: normalizePositiveInt(partialConfig.sampleRate, currentConfig.sampleRate),
          chunkSize: normalizePositiveInt(partialConfig.chunkSize, currentConfig.chunkSize),
        };

        writeStored(GLOBAL_SETTINGS_STORAGE_KEY, {
          sampleRate: nextRuntimeConfig.sampleRate,
          chunkSize: nextRuntimeConfig.chunkSize,
        });
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

  // --- Render ----------------------------------------------------------------

  const headerActions = (
    <button
      onClick={() => setIsSettingsOpen(true)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition hover:border-white/25 hover:bg-white/[0.06] hover:text-zinc-200"
      title="Session settings"
      aria-label="Open settings"
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
    </button>
  );

  return (
    <Layout
      tab={tab}
      onTabChange={setTab}
      statusSlot={<StatusIndicator wsStatus={wsStatus} activeModel={activeModel} mode={serverStats.mode} />}
      headerActions={headerActions}
    >
      {tab === 'studio' && (
        <div className="space-y-5 animate-fade-in-up">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              <Visualizer getAnalysers={pipeline.getAnalysers} isRunning={pipeline.isRunning} />
              <AudioControls
                devices={devices}
                pipeline={pipeline}
                wsStatus={wsStatus}
                activeModel={activeModel}
              />
              <Recorder pipeline={pipeline} />
            </div>

            <div className="space-y-5">
              <MonitorDisplay
                inputLevel={pipeline.inputLevel}
                outputLevel={pipeline.outputLevel}
                latency={latency}
                latencyHistory={latencyHistory}
                serverMs={serverMs}
                serverStats={serverStats}
              />
              <VoiceLab
                voice={voice}
                onChange={handleVoiceChange}
                hasModel={Boolean(activeModel)}
                isRunning={pipeline.isRunning}
              />
            </div>
          </div>

          <PresetBar
            activePresetId={activePresetId}
            onApplyPreset={applyPreset}
            getCurrentSettings={getCurrentSettings}
          />

          <EffectsRack
            effects={effects}
            formantShift={voice.formant}
            onEffectsChange={handleEffectsChange}
          />
        </div>
      )}

      {tab === 'models' && (
        <div className="mx-auto max-w-4xl animate-fade-in-up">
          <ModelManager activeModel={activeModel} onActiveModelChange={setActiveModel} />
        </div>
      )}

      {tab === 'converter' && (
        <div className="mx-auto max-w-3xl animate-fade-in-up">
          <FileConverter
            voice={voice}
            effects={effects}
            activeModel={activeModel}
          />
        </div>
      )}

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
    </Layout>
  );
}
