import { useState, useEffect } from 'react';

export default function Home() {
  const [audioContext, setAudioContext] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [recorder, setRecorder] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const initAudio = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      setAudioContext(audioCtx);
    };
    initAudio();

    // WebSocket 연결 설정
    const ws = new WebSocket('ws://your-ngrok-url.ngrok.io'); // 여기에 ngrok URL을 사용하세요.
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    ws.onmessage = (event) => {
      const { processedAudio } = JSON.parse(event.data);
      playProcessedAudio(processedAudio);
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
      socket.send(JSON.stringify({ audioBuffer }));
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
      <main className="flex-1 grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-8 p-4 md:p-8">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg overflow-hidden aspect-video">
            <span className="w-full h-full object-cover rounded-md bg-muted" />
          </div>
          <div className="flex items-center gap-4">
            <input
              className="flex-1 slider"
              type="range"
              min="0"
              max="100"
              defaultValue="50"
            />
            <button size="icon" variant="ghost">
              <Volume2Icon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Voice Effects</div>
            </div>
            <div className="card-content grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="pitch">Pitch</label>
                  <input
                    id="pitch"
                    className="slider"
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="tone">Tone</label>
                  <input
                    id="tone"
                    className="slider"
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="reverb">Reverb</label>
                <input
                  id="reverb"
                  className="slider"
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="gain">Gain</label>
                  <input
                    id="gain"
                    className="slider"
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="noise">Noise</label>
                  <input
                    id="noise"
                    className="slider"
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="50"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Presets</div>
            </div>
            <div className="card-content grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <button size="sm" variant="outline">
                  Robot
                </button>
                <button size="sm" variant="outline">
                  Chipmunk
                </button>
                <button size="sm" variant="outline">
                  Deep Voice
                </button>
                <button size="sm" variant="outline">
                  Whisper
                </button>
              </div>
              <button size="sm" variant="outline">
                Manage Presets
              </button>
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

function Volume2Icon(props) {
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
