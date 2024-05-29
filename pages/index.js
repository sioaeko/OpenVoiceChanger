import { useState, useEffect } from 'react';

export default function Home() {
  const [audioContext, setAudioContext] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [recorder, setRecorder] = useState(null);
  const [socket, setSocket] = useState(null);
  const [modelImage, setModelImage] = useState('model1.jpg');
  const [settings, setSettings] = useState({
    responseThreshold: 50,
    toneSetting: 50,
    indexRate: 50,
    sampleLength: 50,
    fadeLength: 50,
    inferenceExtraTime: 50,
    inputNoiseReduction: false,
    outputNoiseReduction: false,
  });

  useEffect(() => {
    const initAudio = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(audioCtx);
    };
    initAudio();

    const ws = new WebSocket('ws://your-ngrok-url.ngrok.io'); // 여기에 ngrok URL을 사용하세요.
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    ws.onmessage = (event) => {
      const { processedAudio, rvcProcessedAudio } = JSON.parse(event.data);
      playProcessedAudio(processedAudio);
      playProcessedAudio(rvcProcessedAudio);
    };
    setSocket(ws);

    return () => {
      ws.close();
    };
  }, []);

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
      socket.send(JSON.stringify({ audioBuffer, settings, model: document.getElementById('rvc-model').value }));
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

  const handleSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prevSettings) => ({
      ...prevSettings,
      [name]: type === 'checkbox' ? checked : parseFloat(value),
    }));
  };

  const updateModelImage = () => {
    const modelSelect = document.getElementById('rvc-model');
    const selectedOption = modelSelect.options[modelSelect.selectedIndex];
    const imgSrc = selectedOption.getAttribute('data-img');
    setModelImage(imgSrc);
  };

  return (
    <div>
      <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b">
        <a className="flex items-center gap-2" href="#">
          <MicIcon className="w-6 h-6" />
          <span className="font-bold text-lg">Voice Changer</span>
        </a>
        <nav className="hidden md:flex items-center gap-4">
          <a className="text-sm font-medium hover:underline" href="#">
            Home
          </a>
          <a className="text-sm font-medium hover:underline" href="#">
            Presets
          </a>
          <a className="text-sm font-medium hover:underline" href="#">
            Effects
          </a>
          <a className="text-sm font-medium hover:underline" href="#">
            Settings
          </a>
        </nav>
        <button className="md:hidden" size="icon" variant="ghost">
          <MenuIcon className="w-6 h-6" />
        </button>
      </header>
      <main className="p-4 md:p-8">
        <div className="controls mb-8">
          <div className="mb-4">
            <button className="mr-2" onClick={startRecording}>Start Recording</button>
            <button onClick={stopRecording}>Stop Recording</button>
          </div>
          <div className="model-select mb-4">
            <label htmlFor="rvc-model" className="mr-2">RVC Model:</label>
            <select id="rvc-model" onChange={updateModelImage} className="mr-2">
              <option value="model1" data-img="model1.jpg">Model 1</option>
              <option value="model2" data-img="model2.jpg">Model 2</option>
              <option value="model3" data-img="model3.jpg">Model 3</option>
            </select>
            <img id="model-image" src={modelImage} alt="Model Image" className="w-12 h-12 rounded" />
          </div>
        </div>
        <div className="card mb-8">
          <div className="card-header">General Settings</div>
          <div className="card-content">
            <div className="mb-4">
              <label htmlFor="responseThreshold" className="block">Response Threshold</label>
              <input id="responseThreshold" name="responseThreshold" className="slider" type="range" min="0" max="100" value={settings.responseThreshold} onChange={handleSettingChange} />
            </div>
            <div className="mb-4">
              <label htmlFor="toneSetting" className="block">Tone Setting</label>
              <input id="toneSetting" name="toneSetting" className="slider" type="range" min="0" max="100" value={settings.toneSetting} onChange={handleSettingChange} />
            </div>
            <div className="mb-4">
              <label htmlFor="indexRate" className="block">Index Rate</label>
              <input id="indexRate" name="indexRate" className="slider" type="range" min="0" max="100" value={settings.indexRate} onChange={handleSettingChange} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Performance Settings</div>
          <div className="card-content">
            <div className="mb-4">
              <label htmlFor="sampleLength" className="block">Sample Length</label>
              <input id="sampleLength" name="sampleLength" className="slider" type="range" min="0" max="100" value={settings.sampleLength} onChange={handleSettingChange} />
            </div>
            <div className="mb-4">
              <label htmlFor="fadeLength" className="block">Fade Length</label>
              <input id="fadeLength" name="fadeLength" className="slider" type="range" min="0" max="100" value={settings.fadeLength} onChange={handleSettingChange} />
            </div>
            <div className="mb-4">
              <label htmlFor="inferenceExtraTime" className="block">Inference Extra Time</label>
              <input id="inferenceExtraTime" name="inferenceExtraTime" className="slider" type="range" min="0" max="100" value={settings.inferenceExtraTime} onChange={handleSettingChange} />
            </div>
            <div className="mb-4">
              <label htmlFor="inputNoiseReduction" className="block">Input Noise Reduction</label>
              <input id="inputNoiseReduction" name="inputNoiseReduction" className="mr-2" type="checkbox" checked={settings.inputNoiseReduction} onChange={handleSettingChange} />
            </div>
            <div className="mb-4">
              <label htmlFor="outputNoiseReduction" className="block">Output Noise Reduction</label>
              <input id="outputNoiseReduction" name="outputNoiseReduction" className="mr-2" type="checkbox" checked={settings.outputNoiseReduction} onChange={handleSettingChange} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MenuIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function MicIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
