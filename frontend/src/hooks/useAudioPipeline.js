import { useCallback, useRef, useState } from 'react';
import { SAMPLE_RATE, CHUNK_SIZE } from '../lib/constants';

export default function useAudioPipeline(wsHook) {
  const [isRunning, setIsRunning] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const captureNodeRef = useRef(null);
  const playbackNodeRef = useRef(null);
  const inputAnalyserRef = useRef(null);
  const outputAnalyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const seqNumRef = useRef(0);

  const updateLevels = useCallback(() => {
    if (inputAnalyserRef.current) {
      const data = new Float32Array(inputAnalyserRef.current.fftSize);
      inputAnalyserRef.current.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
      }
      setInputLevel(Math.sqrt(sum / data.length));
    }

    if (outputAnalyserRef.current) {
      const data = new Float32Array(outputAnalyserRef.current.fftSize);
      outputAnalyserRef.current.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i] * data[i];
      }
      setOutputLevel(Math.sqrt(sum / data.length));
    }

    animFrameRef.current = requestAnimationFrame(updateLevels);
  }, []);

  const start = useCallback(
    async (inputDeviceId, outputDeviceId) => {
      try {
        // Create AudioContext
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        audioContextRef.current = audioContext;

        // Handle output device if supported and specified
        if (outputDeviceId && audioContext.setSinkId) {
          await audioContext.setSinkId(outputDeviceId);
        }

        // Get user media
        const constraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            ...(inputDeviceId ? { deviceId: { exact: inputDeviceId } } : {}),
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        // Create source from stream
        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        // Load worklet modules (served from public/ as a separate file,
        // not bundled — AudioWorklet requires a plain JS file URL)
        await audioContext.audioWorklet.addModule('/audioWorklet.js');

        // Create capture worklet node
        const captureNode = new AudioWorkletNode(audioContext, 'capture-processor', {
          processorOptions: { chunkSize: CHUNK_SIZE },
        });
        captureNodeRef.current = captureNode;

        // Create playback worklet node
        const playbackNode = new AudioWorkletNode(audioContext, 'playback-processor', {
          processorOptions: { chunkSize: CHUNK_SIZE },
          outputChannelCount: [1],
        });
        playbackNodeRef.current = playbackNode;

        // Create analysers
        const inputAnalyser = audioContext.createAnalyser();
        inputAnalyser.fftSize = 256;
        inputAnalyser.smoothingTimeConstant = 0.8;
        inputAnalyserRef.current = inputAnalyser;

        const outputAnalyser = audioContext.createAnalyser();
        outputAnalyser.fftSize = 256;
        outputAnalyser.smoothingTimeConstant = 0.8;
        outputAnalyserRef.current = outputAnalyser;

        // Connect pipeline:
        // source -> inputAnalyser -> captureNode (mic -> worklet -> WS)
        // playbackNode -> outputAnalyser -> destination (WS -> worklet -> speakers)
        source.connect(inputAnalyser);
        inputAnalyser.connect(captureNode);
        playbackNode.connect(outputAnalyser);
        outputAnalyser.connect(audioContext.destination);

        // Capture: worklet sends audio chunks to WS
        seqNumRef.current = 0;
        captureNode.port.onmessage = (event) => {
          const buffer = event.data;
          if (buffer instanceof Float32Array) {
            wsHook.sendAudio(buffer, seqNumRef.current++);
          }
        };

        // Playback: WS received audio goes to playback worklet
        wsHook.setOnAudioReceived((pcmData) => {
          if (playbackNodeRef.current) {
            playbackNodeRef.current.port.postMessage(pcmData);
          }
        });

        // Start level metering
        animFrameRef.current = requestAnimationFrame(updateLevels);

        setIsRunning(true);
      } catch (err) {
        console.error('Failed to start audio pipeline:', err);
        // Clean up on failure
        stop();
        // Provide user-friendly error messages
        if (err.name === 'NotAllowedError') {
          throw new Error('Microphone permission denied. Please allow microphone access in your browser settings and try again.');
        }
        if (err.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        }
        if (err.name === 'NotReadableError') {
          throw new Error('Microphone is in use by another application.');
        }
        throw err;
      }
    },
    [wsHook, updateLevels]
  );

  const stop = useCallback(() => {
    // Stop level metering
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Disconnect nodes
    try {
      sourceRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      captureNodeRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      playbackNodeRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      inputAnalyserRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      outputAnalyserRef.current?.disconnect();
    } catch { /* already disconnected */ }

    // Stop media stream tracks
    streamRef.current?.getTracks().forEach((track) => track.stop());

    // Close audio context
    audioContextRef.current?.close();

    // Clear refs
    audioContextRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    captureNodeRef.current = null;
    playbackNodeRef.current = null;
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;

    // Clear WS callback
    wsHook.setOnAudioReceived(null);

    setInputLevel(0);
    setOutputLevel(0);
    setIsRunning(false);
  }, [wsHook]);

  return { start, stop, isRunning, inputLevel, outputLevel };
}
