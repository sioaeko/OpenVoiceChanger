import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
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
import GitHubStarButton from './components/GitHubStarButton';
import UpdateButton from './components/UpdateButton';
import RuntimeReadiness from './components/RuntimeReadiness';
import useWebSocket from './hooks/useWebSocket';
import useAudioPipeline from './hooks/useAudioPipeline';
import useAudioDevices from './hooks/useAudioDevices';
import useUpdates from './hooks/useUpdates';
import useRuntimeSetup from './hooks/useRuntimeSetup';
import { localUpdateBlock } from './lib/updates';
import { getActiveModel, fetchConfig } from './lib/api';
import { applyConfig, DEFAULT_F0_METHOD } from './lib/constants';
import { defaultEffects, effectsFromPreset } from './lib/effects';
import {
  effectsFromPresetSettings,
  presetSettingsFromVoice,
  voiceFromPreset,
} from './lib/presets';
import { buildTabUrl, readTabFromSearch } from './lib/navigation';
import { shouldTriggerShortcut } from './lib/shortcuts';
import { applyTheme, readAppliedTheme, storeTheme } from './lib/theme';
import { FALLBACK_F0_METHODS, normalizeF0Capabilities } from './lib/f0Methods';

const GLOBAL_SETTINGS_STORAGE_KEY = 'ovc_global_settings';
const VOICE_STORAGE_KEY = 'ovc_voice_v2';
const EFFECTS_STORAGE_KEY = 'ovc_effects_v2';

// Slider drags produce many changes per second; the payload goes out (and to
// storage) once the user pauses for this long.
const SETTINGS_DEBOUNCE_MS = 140;
const ACTIVE_MODEL_POLL_MS = 5000;

const DEFAULT_VOICE = {
  pitch: 0,
  formant: 0,
  f0Method: DEFAULT_F0_METHOD,
  indexRate: 0.75,
  // Matches backend OVC_RVC_FILTER_RADIUS.
  filterRadius: 3,
  rmsMixRate: 0.25,
  protect: 0.33,
  crepeHopLength: 160,
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
  silenceSaver: true,
  silenceThresholdDb: -52,
  runtime: DEFAULT_RUNTIME_INFO,
  f0Methods: FALLBACK_F0_METHODS,
};

function normalizePositiveInt(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
}

function normalizeSilenceThreshold(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= -80 && numeric <= -20 ? numeric : fallback;
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
  const baseSilenceSaver = typeof config?.silence_saver === 'boolean'
    ? config.silence_saver
    : DEFAULT_RUNTIME_CONFIG.silenceSaver;
  const baseSilenceThresholdDb = normalizeSilenceThreshold(
    config?.silence_threshold_db,
    DEFAULT_RUNTIME_CONFIG.silenceThresholdDb
  );

  return {
    sampleRate: normalizePositiveInt(stored?.sampleRate, baseSampleRate),
    chunkSize: normalizePositiveInt(stored?.chunkSize, baseChunkSize),
    silenceSaver: typeof stored?.silenceSaver === 'boolean'
      ? stored.silenceSaver
      : baseSilenceSaver,
    silenceThresholdDb: normalizeSilenceThreshold(
      stored?.silenceThresholdDb,
      baseSilenceThresholdDb
    ),
    f0Methods: normalizeF0Capabilities(config?.f0_methods),
    runtime: {
      rvc: config?.runtime?.rvc ?? null,
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

/** The persisted slice of the runtime config — hardware info is never stored. */
function persistedRuntimeConfig(config) {
  return {
    sampleRate: config.sampleRate,
    chunkSize: config.chunkSize,
    silenceSaver: config.silenceSaver,
    silenceThresholdDb: config.silenceThresholdDb,
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

/** Drop ?settings from the address bar without adding a history entry. */
function clearSettingsParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('settings')) return;
  url.searchParams.delete('settings');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function App() {
  const wsHook = useWebSocket();
  const pipeline = useAudioPipeline(wsHook);
  const devices = useAudioDevices();
  const [converterBlock, setConverterBlock] = useState(null);
  const [audioStarting, setAudioStarting] = useState(false);
  const maintenanceBlock = localUpdateBlock({
    isStarting: audioStarting,
    isRunning: pipeline.isRunning,
    isRecording: pipeline.isRecording,
    lastRecording: pipeline.library.unsaved,
    converterBlock,
  });
  const runtimeSetup = useRuntimeSetup(maintenanceBlock);
  const updates = useUpdates(maintenanceBlock || (runtimeSetup.busy ? 'Wait for runtime setup to finish.' : null));

  // Deep links: ?tab=models|converter selects a tab, ?settings opens the modal.
  const [tab, setTab] = useState(() => readTabFromSearch(window.location.search));
  const [activeModel, setActiveModel] = useState(null);
  const [runtimeConfig, setRuntimeConfig] = useState(DEFAULT_RUNTIME_CONFIG);
  const [runtimeRefresh, setRuntimeRefresh] = useState(0);
  const [runtimeChecking, setRuntimeChecking] = useState(false);
  const [runtimeError, setRuntimeError] = useState(null);
  const [capabilitiesRevision, setCapabilitiesRevision] = useState(0);
  const refreshRuntime = useCallback(() => setRuntimeRefresh((value) => value + 1), []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    () => new URLSearchParams(window.location.search).has('settings')
  );
  const [voice, setVoice] = useState(loadInitialVoice);
  const [effects, setEffects] = useState(loadInitialEffects);
  const [activePresetId, setActivePresetId] = useState(null);
  // Full conversion bypass. Deliberately not persisted: a monitoring toggle
  // should never be silently still on the next time the studio opens.
  const [bypass, setBypass] = useState(false);
  // Seeded from the attribute the blocking script in index.html already set,
  // so React adopts the pre-paint theme instead of deciding it a second time.
  const [theme, setTheme] = useState(() => readAppliedTheme(document.documentElement));

  const {
    status: wsStatus,
    latency,
    latencyHistory,
    serverMs,
    serverStats,
    connect,
    disconnect,
    retryNow,
    sendSettings,
    setOnSettingsResponse,
    setOnOpen,
    resetLatency,
  } = wsHook;

  const updateBusy = updates.busy || updates.needsReload || runtimeSetup.busy;
  const setupControls = { ...runtimeSetup, blocked: maintenanceBlock
    || (updates.busy || updates.needsReload ? 'Finish the app update before installing the runtime.' : null) };

  useEffect(() => { refreshRuntime(); }, [runtimeSetup.state?.active_job, refreshRuntime]);

  // --- Settings payload sync -------------------------------------------------

  // The full settings message, kept in a ref so the connection-open callback
  // and the debounced sender always read the latest values.
  const settingsPayloadRef = useRef(null);
  useEffect(() => {
    settingsPayloadRef.current = {
      pitch_shift: voice.pitch,
      formant_shift: voice.formant,
      f0_method: voice.f0Method,
      index_rate: voice.indexRate,
      filter_radius: voice.filterRadius,
      rms_mix_rate: voice.rmsMixRate,
      protect: voice.protect,
      crepe_hop_length: voice.crepeHopLength,
      effects,
      bypass,
      silence_saver: runtimeConfig.silenceSaver,
      silence_threshold_db: runtimeConfig.silenceThresholdDb,
    };
  }, [voice, effects, bypass, runtimeConfig.silenceSaver, runtimeConfig.silenceThresholdDb]);

  const wsStatusRef = useRef(wsStatus);
  useEffect(() => {
    wsStatusRef.current = wsStatus;
  }, [wsStatus]);

  // Persist and push voice/effects once the user pauses. Storage writes sit
  // inside the debounce too: serialising the whole rack on every slider tick
  // was pure waste. A reconnect re-sends everything through onOpen, so the
  // status is only consulted at fire time.
  useEffect(() => {
    const timer = setTimeout(() => {
      writeStored(VOICE_STORAGE_KEY, voice);
      writeStored(EFFECTS_STORAGE_KEY, effects);
      if (wsStatusRef.current === 'connected') {
        sendSettings(settingsPayloadRef.current);
      }
    }, SETTINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [voice, effects, sendSettings]);

  // Bypass is a monitoring action, not a parameter tweak: send it immediately
  // rather than through the settings debounce, so A/B feels instant.
  useEffect(() => {
    if (wsStatus !== 'connected') return;
    sendSettings({ bypass });
  }, [bypass, wsStatus, sendSettings]);

  // Push the full current settings as soon as a connection opens.
  useEffect(() => {
    setOnOpen(() => sendSettings(settingsPayloadRef.current));
  }, [setOnOpen, sendSettings]);

  // --- Bootstrap -------------------------------------------------------------

  useEffect(() => {
    if (wsStatus !== 'connected' && runtimeRefresh === 0) return undefined;
    let cancelled = false;
    setRuntimeChecking(true);
    fetchConfig().then((config) => {
      if (cancelled) return;
      const next = mergeRuntimeConfig(config);
      // Refresh capabilities only: never change live transport geometry.
      setRuntimeConfig((current) => ({ ...current, runtime: next.runtime, f0Methods: next.f0Methods }));
      setCapabilitiesRevision((value) => value + 1);
      setRuntimeError(null);
    }).catch(() => {
      if (!cancelled) setRuntimeError('Runtime check failed. Reconnect to the server and retry.');
    }).finally(() => {
      if (!cancelled) setRuntimeChecking(false);
    });
    return () => { cancelled = true; };
  }, [wsStatus, runtimeRefresh]);

  useEffect(() => {
    let cancelled = false;
    const storedConfig = readStored(GLOBAL_SETTINGS_STORAGE_KEY);

    const adopt = (cfg) => {
      if (cancelled) return;
      const nextRuntimeConfig = mergeRuntimeConfig(cfg, storedConfig);
      applyConfig({
        sample_rate: nextRuntimeConfig.sampleRate,
        chunk_size: nextRuntimeConfig.chunkSize,
      });
      setRuntimeConfig(nextRuntimeConfig);
    };

    fetchConfig()
      .then(adopt)
      .catch(() => adopt({}))
      .finally(() => { if (!cancelled) connect(); });
    return () => {
      cancelled = true;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab selection is reflected in ?tab= so the current view can be linked and
  // Back/Forward moves between tabs instead of leaving the app.
  // Note: pushState stays outside the state updater — StrictMode invokes
  // updaters twice in development, which would push two history entries.
  const handleTabChange = useCallback((nextTab) => {
    if (nextTab === tab) return;
    window.history.pushState({ tab: nextTab }, '', buildTabUrl(window.location.href, nextTab));
    setTab(nextTab);
  }, [tab]);

  useEffect(() => {
    const handlePopState = () => setTab(readTabFromSearch(window.location.search));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Studio shortcuts, all single letters that stay out of the way of typing:
  // "B" toggles the A/B bypass, "R" starts/stops a take while routing runs.
  const { isRunning, isRecording, startRecording, stopRecording } = pipeline;
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isSettingsOpen) return;
      if (shouldTriggerShortcut(event, 'b')) {
        event.preventDefault();
        setBypass((prev) => !prev);
        return;
      }
      if (shouldTriggerShortcut(event, 'r') && isRunning) {
        event.preventDefault();
        if (isRecording) stopRecording();
        else startRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, isRunning, isRecording, startRecording, stopRecording]);

  // SPA-safe anchor scrolling (e.g. /#effects) once the page has rendered.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return undefined;
    const timer = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // While audio streams, the server's status messages carry the active model,
  // so polling is only needed when the studio is idle — and never while the
  // tab is in the background.
  useEffect(() => {
    if (isRunning) return undefined;

    let cancelled = false;
    const checkActiveModel = async () => {
      if (document.hidden) return;
      try {
        const active = await getActiveModel({ timeoutMs: ACTIVE_MODEL_POLL_MS });
        if (!cancelled) setActiveModel(active?.name || active?.model || null);
      } catch {
        // Server may not be ready yet, or is busy loading a checkpoint.
      }
    };

    checkActiveModel();
    const interval = setInterval(checkActiveModel, ACTIVE_MODEL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isRunning]);

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

  // A stopped stream has no round trip: clear the readout and the sparkline
  // instead of leaving the last measurement on screen.
  useEffect(() => {
    if (!isRunning) resetLatency();
  }, [isRunning, resetLatency]);

  // --- Handlers --------------------------------------------------------------

  // Theme is pure presentation: it only writes an attribute and a storage key,
  // and never touches the audio pipeline or the WebSocket, so switching it
  // mid-stream cannot interrupt playback.
  const handleThemeChange = useCallback((nextTheme) => {
    const applied = applyTheme(nextTheme, document.documentElement);
    storeTheme(applied, window.localStorage);
    setTheme(applied);
  }, []);

  const handleVoiceChange = useCallback((partial) => {
    setActivePresetId(null);
    setVoice((prev) => ({ ...prev, ...partial }));
  }, []);

  // Accepts a rack or an updater over the previous rack (see EffectsRack).
  const handleEffectsChange = useCallback((nextEffects) => {
    setActivePresetId(null);
    setEffects(nextEffects);
  }, []);

  const applyPreset = useCallback((preset) => {
    // Advanced RVC values are only overwritten when the preset carries them,
    // so built-ins and pre-existing presets leave the current tuning intact.
    setVoice((prev) => voiceFromPreset(preset, prev));
    setEffects(effectsFromPresetSettings(preset));
    setActivePresetId(preset.id);
  }, []);

  const getCurrentSettings = useCallback(
    () => presetSettingsFromVoice(voice, effects),
    [voice, effects]
  );

  // The next config is derived from the rendered state and its side effects
  // (storage, transport constants, the live settings message) run once, here.
  // Doing that inside a setState updater would repeat them: React may invoke
  // an updater more than once and expects it to be pure.
  const handleGlobalSettingsChange = useCallback(
    (partialConfig) => {
      const nextRuntimeConfig = {
        ...runtimeConfig,
        sampleRate: normalizePositiveInt(partialConfig.sampleRate, runtimeConfig.sampleRate),
        chunkSize: normalizePositiveInt(partialConfig.chunkSize, runtimeConfig.chunkSize),
        silenceSaver: typeof partialConfig.silenceSaver === 'boolean'
          ? partialConfig.silenceSaver
          : runtimeConfig.silenceSaver,
        silenceThresholdDb: normalizeSilenceThreshold(
          partialConfig.silenceThresholdDb,
          runtimeConfig.silenceThresholdDb
        ),
      };

      setRuntimeConfig(nextRuntimeConfig);
      writeStored(GLOBAL_SETTINGS_STORAGE_KEY, persistedRuntimeConfig(nextRuntimeConfig));
      applyConfig({
        sample_rate: nextRuntimeConfig.sampleRate,
        chunk_size: nextRuntimeConfig.chunkSize,
      });

      if (wsStatus === 'connected') {
        const liveSettings = {
          silence_saver: nextRuntimeConfig.silenceSaver,
          silence_threshold_db: nextRuntimeConfig.silenceThresholdDb,
        };
        // Transport geometry cannot change under a live stream; it applies
        // when the next one starts.
        if (!isRunning) {
          Object.assign(liveSettings, {
            sample_rate: nextRuntimeConfig.sampleRate,
            chunk_size: nextRuntimeConfig.chunkSize,
          });
        }
        sendSettings(liveSettings);
      }
    },
    [runtimeConfig, isRunning, sendSettings, wsStatus]
  );

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
    // Otherwise a reload would reopen the modal the user just closed.
    clearSettingsParam();
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeSettings();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsOpen, closeSettings]);

  // --- Render ----------------------------------------------------------------

  const headerActions = (
    <>
      <UpdateButton updates={updates} onClick={openSettings} />
      <GitHubStarButton />

      <button
        onClick={openSettings}
        /* frost-control owns the surface, border, radius, transition and focus
           ring — the previous bg/border utilities would have overridden it. */
        className="frost-control inline-flex h-8 w-8 items-center justify-center text-fg-muted hover:text-fg-secondary"
        title="Session settings"
        aria-label="Open settings"
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );

  // Every tab panel stays mounted and is hidden with the `hidden` attribute.
  // Unmounting them threw away a converter's chosen file, an in-progress
  // render, the selected microphone and open disclosure state on every tab
  // switch — none of which the user asked to reset.
  const panelProps = (id) => ({
    role: 'tabpanel',
    id: `panel-${id}`,
    'aria-labelledby': `tab-${id}`,
    hidden: tab !== id,
  });

  return (
    <Layout
      tab={tab}
      onTabChange={handleTabChange}
      statusSlot={(
        <StatusIndicator
          wsStatus={wsStatus}
          activeModel={activeModel}
          mode={serverStats.mode}
          bypass={bypass}
        />
      )}
      headerActions={headerActions}
    >
      <div {...panelProps('studio')} className="space-y-5 animate-fade-in-up">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Visualizer
              getAnalysers={pipeline.getAnalysers}
              isRunning={pipeline.isRunning}
              theme={theme}
              active={tab === 'studio'}
            />
            <AudioControls
              devices={devices}
              pipeline={pipeline}
              wsStatus={wsStatus}
              activeModel={activeModel}
              bypass={bypass}
              onBypassChange={setBypass}
              onRetryConnection={retryNow}
              updateBusy={updateBusy}
              onStartingChange={setAudioStarting}
            />
            <Recorder pipeline={pipeline} />
          </div>

          <div className="space-y-5">
            <MonitorDisplay
              streamInfo={pipeline.streamInfo}
              playbackStats={pipeline.playbackStats}
              transport={wsHook.transport}
              meters={pipeline.meters}
              latency={latency}
              latencyHistory={latencyHistory}
              serverMs={serverMs}
              serverStats={serverStats}
              bypass={bypass}
            />
            <VoiceLab
              voice={voice}
              onChange={handleVoiceChange}
              hasModel={Boolean(activeModel)}
              isRunning={pipeline.isRunning}
              f0Methods={runtimeConfig.f0Methods}
            />
          </div>
        </div>

        <PresetBar
          refreshRevision={capabilitiesRevision}
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

      <div {...panelProps('models')} className="mx-auto max-w-4xl animate-fade-in-up">
        <ModelManager
          activeModel={activeModel}
          onActiveModelChange={setActiveModel}
          active={tab === 'models'}
        />
        <RuntimeReadiness readiness={runtimeConfig.runtime?.rvc} checking={runtimeChecking}
          error={runtimeError} onRefresh={refreshRuntime} setup={setupControls} />
      </div>

      <div {...panelProps('converter')} className="mx-auto max-w-3xl animate-fade-in-up">
        <FileConverter
          voice={voice}
          effects={effects}
          activeModel={activeModel}
          f0Methods={runtimeConfig.f0Methods}
          updateBusy={updateBusy}
          onUpdateBlockChange={setConverterBlock}
        />
      </div>

      {isSettingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
          <button
            className="absolute inset-0 bg-scrim backdrop-blur-md"
            onClick={closeSettings}
            aria-label="Close settings modal"
          />
          <div className="relative max-h-[calc(100svh-2.5rem)] w-full max-w-5xl overflow-y-auto">
            <GlobalSettings
              runtimeSetup={setupControls}
              runtimeChecking={runtimeChecking}
              runtimeError={runtimeError}
              onRefreshRuntime={refreshRuntime}
              config={runtimeConfig}
              onChange={handleGlobalSettingsChange}
              disabled={pipeline.isRunning}
              onClose={closeSettings}
              theme={theme}
              onThemeChange={handleThemeChange}
              latencyHistory={latencyHistory}
              serverMs={serverMs}
              serverStats={serverStats}
              streamSampleRate={pipeline.streamInfo?.sampleRate}
              updates={updates}
            />
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
