import { useCallback, useRef, useState } from 'react';
import { SAMPLE_RATE, CHUNK_SIZE } from '../lib/constants';
import { encodeWav } from '../lib/wav';

export default function useAudioPipeline(wsHook) {
  const [isRunning, setIsRunning] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [lastRecording, setLastRecording] = useState(null); // {url, seconds, size}

  const audioContextRef = useRef(null);
  const captureSinkRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const captureNodeRef = useRef(null);
  const playbackNodeRef = useRef(null);
  const inputAnalyserRef = useRef(null);
  const outputAnalyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const seqNumRef = useRef(0);
  const recordingRef = useRef(false);
  const recordChunksRef = useRef([]);
  const recordSamplesRef = useRef(0);
  const sampleRateRef = useRef(SAMPLE_RATE);

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

    if (recordingRef.current) {
      setRecordSeconds(recordSamplesRef.current / sampleRateRef.current);
    }

    animFrameRef.current = requestAnimationFrame(updateLevels);
  }, []);

  const start = useCallback(
    async (inputDeviceId, outputDeviceId) => {
      try {
        const audioContext = new AudioContext({
          sampleRate: SAMPLE_RATE,
          latencyHint: 'interactive',
        });
        audioContextRef.current = audioContext;
        sampleRateRef.current = SAMPLE_RATE;

        if (outputDeviceId && audioContext.setSinkId) {
          await audioContext.setSinkId(outputDeviceId);
        }

        const constraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: SAMPLE_RATE,
            ...(inputDeviceId ? { deviceId: { exact: inputDeviceId } } : {}),
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        await audioContext.audioWorklet.addModule('/audioWorklet.js');

        const captureNode = new AudioWorkletNode(audioContext, 'capture-processor', {
          processorOptions: { chunkSize: CHUNK_SIZE },
        });
        captureNodeRef.current = captureNode;

        const playbackNode = new AudioWorkletNode(audioContext, 'playback-processor', {
          processorOptions: { chunkSize: CHUNK_SIZE },
          outputChannelCount: [1],
        });
        playbackNodeRef.current = playbackNode;

        const captureSink = audioContext.createGain();
        captureSink.gain.value = 0;
        captureSinkRef.current = captureSink;

        const inputAnalyser = audioContext.createAnalyser();
        inputAnalyser.fftSize = 2048;
        inputAnalyser.smoothingTimeConstant = 0.82;
        inputAnalyserRef.current = inputAnalyser;

        const outputAnalyser = audioContext.createAnalyser();
        outputAnalyser.fftSize = 2048;
        outputAnalyser.smoothingTimeConstant = 0.82;
        outputAnalyserRef.current = outputAnalyser;

        source.connect(inputAnalyser);
        inputAnalyser.connect(captureNode);
        captureNode.connect(captureSink);
        captureSink.connect(audioContext.destination);
        playbackNode.connect(outputAnalyser);
        outputAnalyser.connect(audioContext.destination);

        seqNumRef.current = 0;
        captureNode.port.onmessage = (event) => {
          const buffer = event.data;
          if (buffer instanceof Float32Array) {
            wsHook.sendAudio(buffer, seqNumRef.current++);
          }
        };

        wsHook.setOnAudioReceived((pcmData) => {
          if (playbackNodeRef.current) {
            playbackNodeRef.current.port.postMessage(pcmData);
          }
          if (recordingRef.current) {
            recordChunksRef.current.push(pcmData.slice(0));
            recordSamplesRef.current += pcmData.length;
          }
        });

        await audioContext.resume();
        animFrameRef.current = requestAnimationFrame(updateLevels);

        setIsRunning(true);
      } catch (err) {
        console.error('Failed to start audio pipeline:', err);
        stop();
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

  const finalizeRecording = useCallback(() => {
    recordingRef.current = false;
    setIsRecording(false);

    const chunks = recordChunksRef.current;
    const samples = recordSamplesRef.current;
    recordChunksRef.current = [];
    recordSamplesRef.current = 0;
    setRecordSeconds(0);

    if (!chunks.length) return null;

    const blob = encodeWav(chunks, sampleRateRef.current);
    const recording = {
      url: URL.createObjectURL(blob),
      seconds: samples / sampleRateRef.current,
      size: blob.size,
    };
    setLastRecording((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return recording;
    });
    return recording;
  }, []);

  const startRecording = useCallback(() => {
    if (recordingRef.current) return;
    recordChunksRef.current = [];
    recordSamplesRef.current = 0;
    recordingRef.current = true;
    setRecordSeconds(0);
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => finalizeRecording(), [finalizeRecording]);

  const discardRecording = useCallback(() => {
    setLastRecording((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const stop = useCallback(() => {
    if (recordingRef.current) {
      finalizeRecording();
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    try {
      sourceRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      captureNodeRef.current?.disconnect();
    } catch { /* already disconnected */ }
    try {
      captureSinkRef.current?.disconnect();
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

    captureNodeRef.current?.port?.close?.();
    playbackNodeRef.current?.port?.close?.();

    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();

    audioContextRef.current = null;
    captureSinkRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    captureNodeRef.current = null;
    playbackNodeRef.current = null;
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;

    wsHook.setOnAudioReceived(null);

    setInputLevel(0);
    setOutputLevel(0);
    setIsRunning(false);
  }, [wsHook, finalizeRecording]);

  // Stable accessor so canvas components can read the live analyser nodes.
  const getAnalysers = useCallback(() => ({
    input: inputAnalyserRef.current,
    output: outputAnalyserRef.current,
  }), []);

  return {
    start,
    stop,
    isRunning,
    inputLevel,
    outputLevel,
    getAnalysers,
    isRecording,
    recordSeconds,
    lastRecording,
    startRecording,
    stopRecording,
    discardRecording,
  };
}
