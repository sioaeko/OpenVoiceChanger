import React, { useState, useEffect, useRef, useCallback } from 'react';

const VoiceChangerDesktop = () => {
  const [mediaStream, setMediaStream] = useState(null);
  const [recorder, setRecorder] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [] });
  const [modelInfo, setModelInfo] = useState({
    onnx: null,
    pytorch: null,
    feature: null,
    index: null
  });
  const [settings, setSettings] = useState({
    enablePyTorch: true,
    halfPrecision: true,
    framework: 'PyTorch',
    audioInput: 'default',
    audioOutput: 'default',
    pitchShift: 0,
  });
  const [monitorData, setMonitorData] = useState({
    vol: 0,
    buf: 0,
    res: 0
  });

  const audioContextRef = useRef(null);
  const audioChunksRef = useRef([]);
  const reconnectTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);

  const getWebSocketUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = process.env.REACT_APP_WS_PORT || '3001';
    return `${protocol}//${host}:${port}`;
  };

  const connectWebSocket = useCallback(() => {
    const wsUrl = getWebSocketUrl();
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const start = Date.now();
          ws.send(JSON.stringify({ type: 'ping' }));
          ws._pingStart = start;
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'processedAudio') {
          playProcessedAudio(data.data);
        } else if (data.type === 'serverStatus') {
          setServerRunning(data.running);
        } else if (data.type === 'pong') {
          const latency = Date.now() - (ws._pingStart || Date.now());
          setMonitorData(prev => ({ ...prev, res: latency }));
        } else if (data.type === 'error') {
          console.error('Server error:', data.message);
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => connectWebSocket(), 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    setSocket(ws);
    return ws;
  }, []);

  useEffect(() => {
    const ws = connectWebSocket();

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      setAudioDevices({ inputs, outputs });
    });

    return () => {
      ws.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connectWebSocket]);

  const initAudio = async () => {
    try {
      const constraints = {
        audio: settings.audioInput !== 'default'
          ? { deviceId: { exact: settings.audioInput } }
          : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setMediaStream(stream);

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      return stream;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      return null;
    }
  };

  const startServer = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'startServer' }));
    }
  };

  const stopServer = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stopServer' }));
    }
  };

  const startRecording = async () => {
    let stream = mediaStream;
    if (!stream) {
      stream = await initAudio();
      if (!stream) return;
    }

    const mediaRecorder = new MediaRecorder(stream);
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const floatArray = new Float32Array(arrayBuffer);
      sendAudioData(Array.from(floatArray));
      audioChunksRef.current = [];

      const analyser = audioContextRef.current?.createAnalyser();
      if (analyser) {
        const dataArray = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = (dataArray[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setMonitorData(prev => ({ ...prev, vol: rms }));
      }
    };

    mediaRecorder.start(100);
    setRecorder(mediaRecorder);
    setRecording(true);
  };

  const stopRecording = () => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setRecording(false);
  };

  const sendAudioData = (audioData) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payload = {
        type: 'audio',
        audio: audioData,
        settings,
        model: settings.framework === 'PyTorch' ? 'RVC' : 'ONNX',
      };
      const message = JSON.stringify(payload);
      socket.send(message);
      setMonitorData(prev => ({ ...prev, buf: message.length }));
    }
  };

  const playProcessedAudio = (audioData) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    const buffer = ctx.createBuffer(1, audioData.length, ctx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < audioData.length; i++) {
      channelData[i] = audioData[i];
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  };

  const handleSettingChange = (name, value) => {
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = async (type) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = type === 'onnx' ? '.onnx' : type === 'pytorch' ? '.pt,.pth' : '*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        setModelInfo(prev => ({ ...prev, [type]: file.name }));
      }
    };
    input.click();
  };

  const handleFileClear = (type) => {
    setModelInfo(prev => ({ ...prev, [type]: null }));
  };

  const handleModelUpload = async () => {
    console.log('Model upload - modelInfo:', modelInfo);
  };

  return (
    <div className="font-sans p-4 bg-gray-100 min-h-screen">
      <div className="bg-white shadow-lg rounded-lg p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Realtime Voice Changer Client</h1>
          <div className="flex items-center gap-2">
            <span className="bg-yellow-200 px-2 py-1 rounded text-sm">for RVC</span>
            <span className={`px-2 py-1 rounded text-sm text-white ${connected ? 'bg-green-500' : 'bg-red-500'}`}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <button
            className="bg-gray-200 px-3 py-1 rounded mr-2 hover:bg-gray-300"
            onClick={() => {
              setSettings({
                enablePyTorch: true, halfPrecision: true, framework: 'PyTorch',
                audioInput: 'default', audioOutput: 'default', pitchShift: 0,
              });
              setModelInfo({ onnx: null, pytorch: null, feature: null, index: null });
            }}
          >
            clear setting
          </button>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <h2 className="font-bold mb-2">Server Control</h2>
          <div className="flex items-center mb-2">
            <span className="w-20">Start:</span>
            <button
              className={`px-3 py-1 rounded mr-2 transition-colors ${serverRunning ? 'bg-gray-300' : 'bg-green-500 text-white hover:bg-green-600'}`}
              onClick={startServer}
              disabled={serverRunning || !connected}
            >
              start
            </button>
            <button
              className={`px-3 py-1 rounded mr-4 transition-colors ${serverRunning ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-300'}`}
              onClick={stopServer}
              disabled={!serverRunning || !connected}
            >
              stop
            </button>
            <button
              className={`px-4 py-1 rounded transition-colors ${recording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
              onClick={recording ? stopRecording : startRecording}
              disabled={!connected}
            >
              {recording ? 'Stop Recording' : 'Record'}
            </button>
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <span className="w-20">monitor:</span>
            <span className="mr-4">vol(rms): {monitorData.vol.toFixed(4)}</span>
            <span className="mr-4">buf(bytes): {monitorData.buf}</span>
            <span className="mr-4">latency(ms): {monitorData.res}</span>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <h2 className="font-bold mb-2">Model Setting</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Model Uploader</h3>
              {['onnx', 'pytorch', 'feature', 'index'].map(type => (
                <div key={type} className="mb-2 flex items-center">
                  <span className="mr-2 w-16 text-sm">{type}</span>
                  <button className="bg-gray-200 px-2 py-1 rounded mr-1 text-sm hover:bg-gray-300" onClick={() => handleFileSelect(type)}>select</button>
                  <button className="bg-gray-200 px-2 py-1 rounded text-sm hover:bg-gray-300" onClick={() => handleFileClear(type)}>clear</button>
                  {modelInfo[type] && <span className="ml-2 text-xs text-green-600 truncate max-w-[120px]">{modelInfo[type]}</span>}
                </div>
              ))}
              <button className="bg-blue-500 text-white px-3 py-1 rounded mt-2 hover:bg-blue-600" onClick={handleModelUpload}>upload</button>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Framework</h3>
              <select
                value={settings.framework}
                onChange={(e) => handleSettingChange('framework', e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="PyTorch">PyTorch (RVC)</option>
                <option value="ONNX">ONNX</option>
              </select>
              <div className="mt-3">
                <label className="block text-sm mb-1">Pitch Shift (semitones)</label>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={settings.pitchShift}
                  onChange={(e) => handleSettingChange('pitchShift', Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm text-gray-600">{settings.pitchShift > 0 ? '+' : ''}{settings.pitchShift}</span>
              </div>
            </div>
            <div>
              <label className="flex items-center mb-2">
                <input
                  type="checkbox"
                  checked={settings.enablePyTorch}
                  onChange={() => handleSettingChange('enablePyTorch', !settings.enablePyTorch)}
                  className="mr-2"
                />
                enable PyTorch
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.halfPrecision}
                  onChange={() => handleSettingChange('halfPrecision', !settings.halfPrecision)}
                  className="mr-2"
                />
                half-precision (fp16)
              </label>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h2 className="font-bold mb-2">Device Setting</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">Audio Input</label>
              <select
                value={settings.audioInput}
                onChange={(e) => handleSettingChange('audioInput', e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="default">Default</option>
                {audioDevices.inputs.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Audio Output</label>
              <select
                value={settings.audioOutput}
                onChange={(e) => handleSettingChange('audioOutput', e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="default">Default</option>
                {audioDevices.outputs.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceChangerDesktop;
