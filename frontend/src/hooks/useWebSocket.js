import { useCallback, useRef, useState } from 'react';
import { WS_URL, SAMPLE_RATE, CHUNK_SIZE } from '../lib/constants';

const MAX_IN_FLIGHT_AUDIO_FRAMES = 1;
const MAX_PENDING_AUDIO_FRAMES = 2;

export default function useWebSocket() {
  const [status, setStatus] = useState('disconnected');
  const [latency, setLatency] = useState(0);

  const wsRef = useRef(null);
  const onAudioReceivedRef = useRef(null);
  const onSettingsResponseRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(1000);
  const intentionalCloseRef = useRef(false);
  const sendTimestampsRef = useRef(new Map());
  const pendingAudioFramesRef = useRef([]);

  const sendBinaryFrame = useCallback((ws, buffer, seqNum) => {
    sendTimestampsRef.current.set(seqNum, performance.now());

    const headerSize = 8;
    const frame = new ArrayBuffer(headerSize + buffer.byteLength);
    const view = new DataView(frame);
    view.setUint32(0, seqNum, true);
    view.setUint32(4, 0, true);

    const pcm = new Float32Array(frame, headerSize);
    pcm.set(buffer);

    ws.send(frame);
  }, []);

  const enqueuePendingAudio = useCallback((buffer, seqNum) => {
    const nextQueue = [
      ...pendingAudioFramesRef.current,
      { buffer: buffer.slice(0), seqNum },
    ];

    while (nextQueue.length > MAX_PENDING_AUDIO_FRAMES) {
      nextQueue.shift();
    }

    pendingAudioFramesRef.current = nextQueue;
  }, []);

  const flushPendingAudio = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (
      sendTimestampsRef.current.size < MAX_IN_FLIGHT_AUDIO_FRAMES
      && pendingAudioFramesRef.current.length > 0
    ) {
      const next = pendingAudioFramesRef.current.shift();
      sendBinaryFrame(ws, next.buffer, next.seqNum);
    }
  }, [sendBinaryFrame]);

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
      connect();
    }, delay);
    reconnectDelayRef.current = Math.min(delay * 2, 30000);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    intentionalCloseRef.current = false;
    setStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setStatus('connected');
        reconnectDelayRef.current = 1000;
        clearReconnectTimer();
        pendingAudioFramesRef.current = [];
        sendTimestampsRef.current.clear();

        ws.send(JSON.stringify({
          sample_rate: SAMPLE_RATE,
          chunk_size: CHUNK_SIZE,
          f0_method: 'pm',
        }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength < 8) return;

          const view = new DataView(event.data);
          const seqNum = view.getUint32(0, true);
          const sendTime = sendTimestampsRef.current.get(seqNum);

          if (sendTime) {
            setLatency(performance.now() - sendTime);
            sendTimestampsRef.current.delete(seqNum);
          }

          flushPendingAudio();

          if (sendTimestampsRef.current.size > 100) {
            const keys = [...sendTimestampsRef.current.keys()].sort((a, b) => a - b);
            for (let i = 0; i < keys.length - 50; i += 1) {
              sendTimestampsRef.current.delete(keys[i]);
            }
          }

          const pcmData = new Float32Array(event.data, 8);
          onAudioReceivedRef.current?.(pcmData, seqNum);
          return;
        }

        try {
          const msg = JSON.parse(event.data);
          onSettingsResponseRef.current?.(msg);
        } catch {
          // Ignore malformed JSON payloads.
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };

      ws.onclose = () => {
        wsRef.current = null;
        pendingAudioFramesRef.current = [];
        sendTimestampsRef.current.clear();
        if (!intentionalCloseRef.current) {
          setStatus('disconnected');
          scheduleReconnect();
        } else {
          setStatus('disconnected');
        }
      };

      wsRef.current = ws;
    } catch {
      setStatus('error');
      scheduleReconnect();
    }
  }, [clearReconnectTimer, flushPendingAudio, scheduleReconnect]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    pendingAudioFramesRef.current = [];
    sendTimestampsRef.current.clear();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [clearReconnectTimer]);

  const sendAudio = useCallback((buffer, seqNum) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (sendTimestampsRef.current.size >= MAX_IN_FLIGHT_AUDIO_FRAMES) {
      enqueuePendingAudio(buffer, seqNum);
      return;
    }

    sendBinaryFrame(ws, buffer, seqNum);
  }, [enqueuePendingAudio, sendBinaryFrame]);

  const sendSettings = useCallback((settings) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'settings', ...settings }));
  }, []);

  const setOnAudioReceived = useCallback((callback) => {
    onAudioReceivedRef.current = callback;
  }, []);

  const setOnSettingsResponse = useCallback((callback) => {
    onSettingsResponseRef.current = callback;
  }, []);

  return {
    status,
    connect,
    disconnect,
    sendAudio,
    sendSettings,
    setOnAudioReceived,
    setOnSettingsResponse,
    latency,
  };
}
