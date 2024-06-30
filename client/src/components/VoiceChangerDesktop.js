import React, { useState, useEffect } from 'react';

const VoiceChangerDesktop = () => {
  const [audioContext, setAudioContext] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [recorder, setRecorder] = useState(null);
  const [socket, setSocket] = useState(null);
  const [serverRunning, setServerRunning] = useState(false);
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
    audioInput: 'none',
    audioOutput: 'none',
  });
  const [monitorData, setMonitorData] = useState({
    vol: 0,
    buf: 0,
    res: 0
  });

  useEffect(() => {
    const initAudio = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(audioCtx);
    };
    initAudio();

    const ws = new WebSocket('ws://your-ngrok-url.ngrok.io');
    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = (event) => {
      const { processedAudio, rvcProcessedAudio } = JSON.parse(event.data);
      playProcessedAudio(processedAudio);
      playProcessedAudio(rvcProcessedAudio);
    };
    setSocket(ws);

    return () => ws.close();
  }, []);

  const startServer = () => {
    setServerRunning(true);
    // 실제 서버 시작 로직 추가
  };

  const stopServer = () => {
    setServerRunning(false);
    // 실제 서버 중지 로직 추가
  };

  const startRecording = () => {
    if (!mediaStream) return;
    const mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (event) => {
      setAudioChunks((prev) => [...prev, event.data]);
    };
    mediaRecorder.start();
    setRecorder(mediaRecorder);
  };

  const stopRecording = () => {
    if (!recorder) return;
    recorder.stop();
    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const audioBuffer = await audioBlob.arrayBuffer();
      sendAudioData(audioBuffer);
      setAudioChunks([]);
    };
  };

  const sendAudioData = (audioBuffer) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ audioBuffer, settings, model: settings.framework }));
    }
  };

  const playProcessedAudio = (audioBuffer) => {
    const audioCtx = new AudioContext();
    audioCtx.decodeAudioData(audioBuffer, (buffer) => {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
    });
  };

  const handleSettingChange = (name, value) => {
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = (type) => {
    // 파일 선택 로직
    console.log(`Selecting file for ${type}`);
  };

  const handleFileClear = (type) => {
    setModelInfo(prev => ({ ...prev, [type]: null }));
  };

  const handleModelUpload = () => {
    // 모델 업로드 로직
    console.log('Uploading model');
  };

  return (
    <div className="font-sans p-4 bg-gray-100 min-h-screen">
      <div className="bg-white shadow-lg rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Realtime Voice Changer Client</h1>
          <span className="bg-yellow-200 px-2 py-1 rounded">for RVC</span>
        </div>

        <div className="mb-4">
          <button className="bg-gray-200 px-3 py-1 rounded mr-2">clear setting</button>
          <button className="bg-gray-200 px-3 py-1 rounded">re-select vc</button>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <h2 className="font-bold mb-2">Server Control</h2>
          <div className="flex items-center mb-2">
            <span className="w-20">Start:</span>
            <button 
              className={`px-3 py-1 rounded mr-2 ${serverRunning ? 'bg-gray-300' : 'bg-green-500 text-white'}`}
              onClick={startServer}
              disabled={serverRunning}
            >
              start
            </button>
            <button 
              className={`px-3 py-1 rounded ${serverRunning ? 'bg-red-500 text-white' : 'bg-gray-300'}`}
              onClick={stopServer}
              disabled={!serverRunning}
            >
              stop
            </button>
          </div>
          <div className="flex items-center">
            <span className="w-20">monitor:</span>
            <span className="mr-4">vol(rms): {monitorData.vol.toFixed(4)}</span>
            <span className="mr-4">buf(ms): {monitorData.buf}</span>
            <span className="mr-4">res(ms): {monitorData.res}</span>
            <button className="bg-gray-200 px-2 py-1 rounded">more ≫</button>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <h2 className="font-bold mb-2">Model Setting</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Model Uploader</h3>
              {['onnx', 'pytorch', 'feature', 'index'].map(type => (
                <div key={type} className="mb-2">
                  <span className="mr-2">{type}(.{type})</span>
                  <button className="bg-gray-200 px-2 py-1 rounded mr-1" onClick={() => handleFileSelect(type)}>select</button>
                  <button className="bg-gray-200 px-2 py-1 rounded" onClick={() => handleFileClear(type)}>clear</button>
                  {type === 'pytorch' && (
                    <button className="bg-gray-200 px-2 py-1 rounded ml-1">export onnx</button>
                  )}
                </div>
              ))}
              <button className="bg-blue-500 text-white px-3 py-1 rounded mt-2" onClick={handleModelUpload}>upload</button>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Framework</h3>
              <select 
                value={settings.framework}
                onChange={(e) => handleSettingChange('framework', e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="PyTorch">PyTorch</option>
                <option value="ONNX">ONNX</option>
              </select>
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
                half-precision
              </label>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h2 className="font-bold mb-2">Device Setting</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1">AudioInput</label>
              <select 
                value={settings.audioInput}
                onChange={(e) => handleSettingChange('audioInput', e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="none">none</option>
                {/* Add more audio input options here */}
              </select>
            </div>
            <div>
              <label className="block mb-1">AudioOutput</label>
              <select 
                value={settings.audioOutput}
                onChange={(e) => handleSettingChange('audioOutput', e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="none">none</option>
                {/* Add more audio output options here */}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceChangerDesktop;
