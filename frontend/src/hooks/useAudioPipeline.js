import { useCallback, useMemo, useRef, useState } from 'react';
import { SAMPLE_RATE, CHUNK_SIZE } from '../lib/constants';
import { encodeWav } from '../lib/wav';
import { formatFileTimestamp } from '../lib/format';
import { createMeterStore, rms } from '../lib/meters';
import {
  MAX_RECORD_SECONDS,
  appendRecordingChunk,
  formatRecordLimit,
  maxRecordingSamples,
} from '../lib/recording';
import {
  buildAudioConstraintCandidates,
  describeGetUserMediaError,
  getMediaDeviceSupport,
  isDeviceConstraintError,
  supportsOutputDeviceSelection,
} from '../lib/audioSupport';

// The worklet ships from public/ so it resolves relative to the app's base
// URL, wherever the studio happens to be mounted.
const WORKLET_URL = `${import.meta.env.BASE_URL}audioWorklet.js`;

export default function useAudioPipeline(wsHook) {
  // Only the stable callbacks are needed here. Depending on the whole hook
  // object would recreate start/stop every time a latency sample arrives.
  const { sendAudio, setOnAudioReceived, setStreamSampleRate } = wsHook;

  const [isRunning, setIsRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [lastRecording, setLastRecording] = useState(null); // {url, seconds, size, fileName}
  const [recordNotice, setRecordNotice] = useState(null); // {tone, message}
  const [streamInfo, setStreamInfo] = useState(null); // {sampleRate, requestedSampleRate, inputFallback}

  const audioContextRef = useRef(null);
  const captureSinkRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const captureNodeRef = useRef(null);
  const playbackNodeRef = useRef(null);
  const inputAnalyserRef = useRef(null);
  const outputAnalyserRef = useRef(null);
  const inputBufferRef = useRef(null);
  const outputBufferRef = useRef(null);
  const animFrameRef = useRef(null);
  const seqNumRef = useRef(0);
  const recordingRef = useRef(false);
  const recordChunksRef = useRef([]);
  const recordSamplesRef = useRef(0);
  const recordLimitRef = useRef(0);
  // The rate the AudioContext actually runs at — not the rate we asked for.
  const sampleRateRef = useRef(SAMPLE_RATE);

  // Animation-rate values live outside React state so meter updates never
  // re-render the App. Components that paint them subscribe individually.
  const meters = useMemo(
    () => createMeterStore({ input: 0, output: 0, recordSeconds: 0 }),
    []
  );

  const outputSelectionSupported = useMemo(() => supportsOutputDeviceSelection(), []);

  // Starts the animation-rate meter loop; stop() cancels it via animFrameRef.
  const startLevelLoop = useCallback(() => {
    function tick() {
      let input = 0;
      let output = 0;

      if (inputAnalyserRef.current && inputBufferRef.current) {
        inputAnalyserRef.current.getFloatTimeDomainData(inputBufferRef.current);
        input = rms(inputBufferRef.current);
      }
      if (outputAnalyserRef.current && outputBufferRef.current) {
        outputAnalyserRef.current.getFloatTimeDomainData(outputBufferRef.current);
        output = rms(outputBufferRef.current);
      }

      meters.set({
        input,
        output,
        recordSeconds: recordingRef.current
          ? recordSamplesRef.current / sampleRateRef.current
          : 0,
      });

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }, [meters]);

  const finalizeRecording = useCallback((notice = null) => {
    recordingRef.current = false;
    setIsRecording(false);

    const chunks = recordChunksRef.current;
    const samples = recordSamplesRef.current;
    recordChunksRef.current = [];
    recordSamplesRef.current = 0;
    meters.set({ recordSeconds: 0 });

    if (!chunks.length) {
      if (notice) setRecordNotice(notice);
      return null;
    }

    const recording = (() => {
      try {
        const blob = encodeWav(chunks, sampleRateRef.current);
        return {
          url: URL.createObjectURL(blob),
          seconds: samples / sampleRateRef.current,
          size: blob.size,
          // Named once, when the take ends, so the download keeps one name.
          fileName: `voice-take-${formatFileTimestamp()}.wav`,
        };
      } catch (err) {
        console.error('Failed to encode recording:', err);
        setRecordNotice({
          tone: 'error',
          message: 'The take could not be encoded — it may have been too long for available memory.',
        });
        return null;
      }
    })();

    if (!recording) return null;

    setLastRecording((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return recording;
    });
    setRecordNotice(notice);
    return recording;
  }, [meters]);

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
    // close() rejects if the context is already closed (a failed start that
    // never resumed it, or a second stop) — that is not worth an unhandled
    // rejection in the console.
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') {
      context.close().catch(() => {});
    }

    audioContextRef.current = null;
    captureSinkRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    captureNodeRef.current = null;
    playbackNodeRef.current = null;
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;
    inputBufferRef.current = null;
    outputBufferRef.current = null;

    setOnAudioReceived(null);

    meters.set({ input: 0, output: 0, recordSeconds: 0 });
    setStreamInfo(null);
    setIsRunning(false);
  }, [finalizeRecording, setOnAudioReceived, meters]);

  const start = useCallback(
    async (inputDeviceId, outputDeviceId) => {
      const support = getMediaDeviceSupport();
      if (!support.supported) {
        throw new Error(support.reason);
      }

      try {
        // The browser may refuse the requested rate outright (or silently pick
        // another); fall back to its preferred rate rather than failing.
        let audioContext;
        try {
          audioContext = new AudioContext({
            sampleRate: SAMPLE_RATE,
            latencyHint: 'interactive',
          });
        } catch (rateErr) {
          console.warn(
            `AudioContext rejected sampleRate=${SAMPLE_RATE} (${rateErr?.name}); using the browser default.`
          );
          audioContext = new AudioContext({ latencyHint: 'interactive' });
        }
        audioContextRef.current = audioContext;

        // Canonical rate for everything downstream: WebSocket config, WAV
        // header, record timer. Asking for 40 kHz and getting 48 kHz would
        // otherwise mis-tune conversion and save recordings at the wrong speed.
        const actualSampleRate = Math.round(audioContext.sampleRate);
        sampleRateRef.current = actualSampleRate;
        recordLimitRef.current = maxRecordingSamples(actualSampleRate);

        if (outputDeviceId && outputSelectionSupported) {
          try {
            await audioContext.setSinkId(outputDeviceId);
          } catch (sinkErr) {
            console.warn('Could not route to the selected output device:', sinkErr);
          }
        }

        const candidates = buildAudioConstraintCandidates(inputDeviceId, actualSampleRate);
        let stream = null;
        let inputFallback = null;
        let lastError = null;

        for (const candidate of candidates) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: candidate.audio });
            inputFallback = candidate.fallback || null;
            break;
          } catch (err) {
            lastError = err;
            // Only a device-specific failure is worth retrying looser; a
            // permission denial or a busy device will fail the same way again.
            if (!isDeviceConstraintError(err)) throw err;
          }
        }

        if (!stream) throw lastError || new Error('No usable microphone was found.');
        streamRef.current = stream;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        await audioContext.audioWorklet.addModule(WORKLET_URL);

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
        inputBufferRef.current = new Float32Array(inputAnalyser.fftSize);

        const outputAnalyser = audioContext.createAnalyser();
        outputAnalyser.fftSize = 2048;
        outputAnalyser.smoothingTimeConstant = 0.82;
        outputAnalyserRef.current = outputAnalyser;
        outputBufferRef.current = new Float32Array(outputAnalyser.fftSize);

        source.connect(inputAnalyser);
        inputAnalyser.connect(captureNode);
        captureNode.connect(captureSink);
        captureSink.connect(audioContext.destination);
        playbackNode.connect(outputAnalyser);
        outputAnalyser.connect(audioContext.destination);

        // Tell the server the rate we are really streaming at before any audio
        // goes out, so the first chunk is interpreted correctly.
        setStreamSampleRate?.(actualSampleRate);

        seqNumRef.current = 0;
        captureNode.port.onmessage = (event) => {
          const buffer = event.data;
          if (buffer instanceof Float32Array) {
            sendAudio(buffer, seqNumRef.current++);
          }
        };

        setOnAudioReceived((pcmData) => {
          if (playbackNodeRef.current) {
            playbackNodeRef.current.port.postMessage(pcmData);
          }
          if (!recordingRef.current) return;

          const { accepted, samples, full } = appendRecordingChunk(
            pcmData,
            recordSamplesRef.current,
            recordLimitRef.current
          );
          if (accepted && accepted.length > 0) {
            recordChunksRef.current.push(accepted.slice(0));
          }
          recordSamplesRef.current = samples;

          if (full) {
            finalizeRecording({
              tone: 'warning',
              message: `Recording stopped at the ${formatRecordLimit()} limit — the take was saved.`,
            });
          }
        });

        await audioContext.resume();
        startLevelLoop();

        setStreamInfo({
          sampleRate: actualSampleRate,
          requestedSampleRate: SAMPLE_RATE,
          inputFallback,
        });
        setIsRunning(true);
      } catch (err) {
        console.error('Failed to start audio pipeline:', err);
        stop();
        throw new Error(describeGetUserMediaError(err), { cause: err });
      }
    },
    [
      sendAudio, setOnAudioReceived, setStreamSampleRate, startLevelLoop, finalizeRecording,
      stop, outputSelectionSupported,
    ]
  );

  const startRecording = useCallback(() => {
    if (recordingRef.current) return;
    recordChunksRef.current = [];
    recordSamplesRef.current = 0;
    recordLimitRef.current = maxRecordingSamples(sampleRateRef.current);
    recordingRef.current = true;
    meters.set({ recordSeconds: 0 });
    setRecordNotice(null);
    setIsRecording(true);
  }, [meters]);

  const stopRecording = useCallback(() => finalizeRecording(), [finalizeRecording]);

  const discardRecording = useCallback(() => {
    setLastRecording((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    setRecordNotice(null);
  }, []);

  // Stable accessor so canvas components can read the live analyser nodes.
  const getAnalysers = useCallback(() => ({
    input: inputAnalyserRef.current,
    output: outputAnalyserRef.current,
  }), []);

  // Stable identity between state changes, so memoized panels that receive the
  // whole pipeline do not re-render on unrelated App updates.
  return useMemo(() => ({
    start,
    stop,
    isRunning,
    meters,
    getAnalysers,
    isRecording,
    lastRecording,
    recordNotice,
    startRecording,
    stopRecording,
    discardRecording,
    maxRecordSeconds: MAX_RECORD_SECONDS,
    outputSelectionSupported,
    streamInfo,
  }), [
    start, stop, isRunning, meters, getAnalysers, isRecording, lastRecording, recordNotice,
    startRecording, stopRecording, discardRecording, outputSelectionSupported, streamInfo,
  ]);
}
