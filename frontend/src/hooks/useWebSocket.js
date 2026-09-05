import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WS_URL, SAMPLE_RATE, CHUNK_SIZE } from '../lib/constants';
import { createFrameScheduler } from '../lib/frameQueue';

// Round-trip samples kept for the sparkline and the profile recommendation.
const MAX_LATENCY_SAMPLES = 60;
// How often latency/serverMs reach React state. Audio replies arrive per chunk
// (10-40 per second); pushing each one through setState would re-render the
// whole studio at frame rate, and a readout that flickers 40x a second is not
// more informative than one that updates 4x a second.
const UI_FLUSH_INTERVAL_MS = 250;
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const EMPTY_TRANSPORT = { pending: 0, inFlight: 0, dropped: 0, timedOut: 0 };

const DEFAULT_SERVER_STATS = {
  modelMs: 0,
  dspMs: 0,
  mode: 'dsp',
  activeModel: null,
  effectsActive: 0,
  bypass: false,
  silenceSaver: true,
  silenceThresholdDb: -52,
  inferenceSleeping: false,
  inferenceDutyPercent: 0,
  processingError: null,
};

function transmitFrame(ws, buffer, seqNum) {
  const headerSize = 8;
  const frame = new ArrayBuffer(headerSize + buffer.byteLength);
  const view = new DataView(frame);
  view.setUint32(0, seqNum, true);
  view.setUint32(4, 0, true);
  new Float32Array(frame, headerSize).set(buffer);
  ws.send(frame);
}

export default function useWebSocket() {
  const [status, setStatus] = useState('disconnected');
  const [latency, setLatency] = useState(0);
  const [latencyHistory, setLatencyHistory] = useState([]);
  const [serverMs, setServerMs] = useState(0);
  // Server-reported processing breakdown (from periodic status messages).
  const [serverStats, setServerStats] = useState(DEFAULT_SERVER_STATS);
  const [transport, setTransport] = useState(EMPTY_TRANSPORT);

  const wsRef = useRef(null);
  const connectRef = useRef(null);
  const onAudioReceivedRef = useRef(null);
  const onSettingsResponseRef = useRef(null);
  const onOpenRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(RECONNECT_INITIAL_MS);
  const intentionalCloseRef = useRef(false);
  const schedulerRef = useRef(null);
  if (schedulerRef.current == null) schedulerRef.current = createFrameScheduler();

  // Per-frame measurements accumulate here and reach React state in batches.
  const latestLatencyRef = useRef(0);
  const latestServerMsRef = useRef(0);
  const historyRef = useRef([]);
  const lastFlushRef = useRef(0);
  // Rate the live AudioContext actually runs at, once a stream has started.
  // Null until then, when the configured default is the best guess we have.
  const streamSampleRateRef = useRef(null);

  const flushMeasurements = useCallback((now, force = false) => {
    if (!force && now - lastFlushRef.current < UI_FLUSH_INTERVAL_MS) return;
    lastFlushRef.current = now;
    setLatency(latestLatencyRef.current);
    setServerMs(latestServerMsRef.current);
    setLatencyHistory(historyRef.current.slice());
    const queue = schedulerRef.current;
    setTransport({ pending: queue.pendingCount, inFlight: queue.inFlightCount,
      dropped: queue.droppedCount, timedOut: queue.timedOutCount });
  }, []);

  /** Clear the round-trip readout, e.g. when the audio stream stops. */
  const resetLatency = useCallback(() => {
    latestLatencyRef.current = 0;
    latestServerMsRef.current = 0;
    historyRef.current = [];
    lastFlushRef.current = 0;
    setLatency(0);
    setServerMs(0);
    setLatencyHistory([]);
    schedulerRef.current.reset();
    setTransport(EMPTY_TRANSPORT);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return;

    clearReconnectTimer();
    const delay = reconnectDelayRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current?.();
    }, delay);
    reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    intentionalCloseRef.current = false;
    setStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setStatus('connected');
        reconnectDelayRef.current = RECONNECT_INITIAL_MS;
        clearReconnectTimer();
        schedulerRef.current.reset();
        setTransport(EMPTY_TRANSPORT);
        setServerStats(DEFAULT_SERVER_STATS);

        // Re-announce the live stream's real rate after a reconnect, so the
        // server never resumes processing with a stale assumption.
        ws.send(JSON.stringify({
          sample_rate: streamSampleRateRef.current ?? SAMPLE_RATE,
          chunk_size: CHUNK_SIZE,
        }));

        // Let the app push its full current settings (pitch, effects, ...).
        onOpenRef.current?.();
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength < 8) return;

          const view = new DataView(event.data);
          const seqNum = view.getUint32(0, true);
          const serverHundredthsMs = view.getUint32(4, true);
          const now = performance.now();

          const { rttMs, send } = schedulerRef.current.acknowledge(seqNum, now);
          if (rttMs !== null) {
            latestLatencyRef.current = rttMs;
            const history = historyRef.current;
            history.push(rttMs);
            if (history.length > MAX_LATENCY_SAMPLES) {
              history.splice(0, history.length - MAX_LATENCY_SAMPLES);
            }
          }
          latestServerMsRef.current = serverHundredthsMs / 100;
          flushMeasurements(now);

          for (const next of send) transmitFrame(ws, next.buffer, next.seqNum);

          const pcmData = new Float32Array(event.data, 8);
          if (rttMs !== null) onAudioReceivedRef.current?.(pcmData, seqNum);
          return;
        }

        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'status') {
            setServerStats({
              modelMs: msg.model_ms ?? 0,
              dspMs: msg.dsp_ms ?? 0,
              mode: msg.mode ?? 'dsp',
              processingError: msg.processing_error ?? null,
              activeModel: msg.active_model ?? null,
              effectsActive: msg.effects_active ?? 0,
              // Older backends omit this; absence means "not bypassed".
              bypass: Boolean(msg.bypass),
              silenceSaver: msg.silence_saver !== false,
              silenceThresholdDb: msg.silence_threshold_db ?? -52,
              inferenceSleeping: Boolean(msg.inference_sleeping),
              inferenceDutyPercent: msg.inference_duty_percent ?? 0,
            });
          }
          onSettingsResponseRef.current?.(msg);
        } catch {
          // Ignore malformed JSON payloads.
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        schedulerRef.current.reset();
        setStatus('disconnected');
        setTransport(EMPTY_TRANSPORT);
        setServerStats(DEFAULT_SERVER_STATS);
        if (!intentionalCloseRef.current) scheduleReconnect();
      };

      wsRef.current = ws;
    } catch {
      setStatus('error');
      scheduleReconnect();
    }
  }, [clearReconnectTimer, flushMeasurements, scheduleReconnect]);

  // The reconnect timer fires long after any render, so an effect-synced ref
  // is the right way for it to reach the current connect().
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    schedulerRef.current.reset();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [clearReconnectTimer]);

  /** Skip the remaining back-off and try to connect right away. */
  const retryNow = useCallback(() => {
    clearReconnectTimer();
    reconnectDelayRef.current = RECONNECT_INITIAL_MS;

    // Abandon an attempt that is still hanging in CONNECTING (an unreachable
    // host can sit there for a long time). Its handlers are detached first so
    // the eventual close cannot schedule a competing reconnect.
    const current = wsRef.current;
    if (current && current.readyState !== WebSocket.OPEN) {
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      wsRef.current = null;
      try {
        current.close();
      } catch { /* already closing */ }
    }
    connect();
  }, [clearReconnectTimer, connect]);

  const sendAudio = useCallback((buffer, seqNum) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const send = schedulerRef.current.offer({ buffer, seqNum }, performance.now());
    for (const next of send) transmitFrame(ws, next.buffer, next.seqNum);
    flushMeasurements(performance.now());
  }, [flushMeasurements]);

  const sendSettings = useCallback((settings) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'settings', ...settings }));
  }, []);

  /** Publish the rate the AudioContext actually runs at (see useAudioPipeline). */
  const setStreamSampleRate = useCallback((rate) => {
    const numeric = Number(rate);
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    streamSampleRateRef.current = Math.round(numeric);
    sendSettings({ sample_rate: streamSampleRateRef.current });
  }, [sendSettings]);

  const setOnAudioReceived = useCallback((callback) => {
    onAudioReceivedRef.current = callback;
  }, []);

  const setOnSettingsResponse = useCallback((callback) => {
    onSettingsResponseRef.current = callback;
  }, []);

  const setOnOpen = useCallback((callback) => {
    onOpenRef.current = callback;
  }, []);

  // A stable object lets consumers (and React.memo) depend on the fields they
  // use instead of a fresh wrapper every render.
  return useMemo(() => ({
    status,
    connect,
    disconnect,
    retryNow,
    sendAudio,
    sendSettings,
    setStreamSampleRate,
    setOnAudioReceived,
    setOnSettingsResponse,
    setOnOpen,
    latency,
    latencyHistory,
    serverMs,
    serverStats,
    transport,
    resetLatency,
  }), [
    status, connect, disconnect, retryNow, sendAudio, sendSettings, setStreamSampleRate,
    setOnAudioReceived, setOnSettingsResponse, setOnOpen, latency, latencyHistory,
    serverMs, serverStats, transport, resetLatency,
  ]);
}
