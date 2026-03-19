import React, { useCallback, useEffect, useState } from 'react';
import Layout from './components/Layout';
import StatusIndicator from './components/StatusIndicator';
import AudioControls from './components/AudioControls';
import ModelManager from './components/ModelManager';
import VoiceSettings from './components/VoiceSettings';
import MonitorDisplay from './components/MonitorDisplay';
import useWebSocket from './hooks/useWebSocket';
import useAudioPipeline from './hooks/useAudioPipeline';
import useAudioDevices from './hooks/useAudioDevices';
import { getActiveModel, fetchConfig } from './lib/api';
import { applyConfig } from './lib/constants';

export default function App() {
  const wsHook = useWebSocket();
  const pipeline = useAudioPipeline(wsHook);
  const devices = useAudioDevices();
  const [activeModel, setActiveModel] = useState(null);

  // Fetch backend config and auto-connect WebSocket on mount
  useEffect(() => {
    fetchConfig()
      .then((cfg) => applyConfig(cfg))
      .catch(() => {})
      .finally(() => wsHook.connect());
    return () => {
      wsHook.disconnect();
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll active model status
  useEffect(() => {
    const checkActiveModel = async () => {
      try {
        const active = await getActiveModel();
        setActiveModel(active?.name || active?.model || null);
      } catch {
        // Server may not be ready yet
      }
    };

    checkActiveModel();
    const interval = setInterval(checkActiveModel, 5000);
    return () => clearInterval(interval);
  }, []);

  // Listen for settings responses from WS
  useEffect(() => {
    wsHook.setOnSettingsResponse?.((msg) => {
      if (msg.type === 'model_change') {
        setActiveModel(msg.model || null);
      }
    });
  }, [wsHook]);

  const handleSettingsChange = useCallback(
    (settings) => {
      wsHook.sendSettings(settings);
    },
    [wsHook]
  );

  return (
    <Layout>
      <div className="space-y-5">
        {/* Status bar */}
        <StatusIndicator
          wsStatus={wsHook.status}
          activeModel={activeModel}
        />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column: Model Manager */}
          <div className="lg:col-span-5 xl:col-span-4">
            <ModelManager />
          </div>

          {/* Right column: Controls, Settings, Monitor */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-5">
            <AudioControls
              devices={devices}
              pipeline={pipeline}
              wsStatus={wsHook.status}
              activeModel={activeModel}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <VoiceSettings
                onSettingsChange={handleSettingsChange}
                disabled={!pipeline.isRunning}
              />
              <MonitorDisplay
                inputLevel={pipeline.inputLevel}
                outputLevel={pipeline.outputLevel}
                latency={wsHook.latency}
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
