import { useCallback, useRef, useState } from 'react';
import { WS_URL, SAMPLE_RATE, CHUNK_SIZE } from '../lib/constants';

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

        // Send initial config (snake_case keys to match backend)
        ws.send(JSON.stringify({ sample_rate: SAMPLE_RATE, chunk_size: CHUNK_SIZE }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength < 8) return; // Malformed frame
          // Binary audio frame: 8-byte header (uint32 seq + uint32 reserved) + float32 PCM
          const view = new DataView(event.data);
          const seqNum = view.getUint32(0, true);

          // Calculate latency
          const sendTime = sendTimestampsRef.current.get(seqNum);
          if (sendTime) {
            setLatency(performance.now() - sendTime);
            sendTimestampsRef.current.delete(seqNum);
          }

          // Clean up old timestamps
          if (sendTimestampsRef.current.size > 100) {
            const keys = [...sendTimestampsRef.current.keys()].sort((a, b) => a - b);
            for (let i = 0; i < keys.length - 50; i++) {
              sendTimestampsRef.current.delete(keys[i]);
            }
          }

          const pcmData = new Float32Array(event.data, 8);
          onAudioReceivedRef.current?.(pcmData, seqNum);
        } else {
          // JSON message
          try {
            const msg = JSON.parse(event.data);
            onSettingsResponseRef.current?.(msg);
          } catch {
            // Ignore malformed JSON
          }
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };

      ws.onclose = () => {
        wsRef.current = null;
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
  }, [clearReconnectTimer, scheduleReconnect]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, [clearReconnectTimer]);

  const sendAudio = useCallback((buffer, seqNum) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Record send time for latency measurement
    sendTimestampsRef.current.set(seqNum, performance.now());

    // 8-byte header: uint32 seq + uint32 reserved, then float32 PCM
    const headerSize = 8;
    const frame = new ArrayBuffer(headerSize + buffer.byteLength);
    const view = new DataView(frame);
    view.setUint32(0, seqNum, true);
    view.setUint32(4, 0, true); // reserved

    const pcm = new Float32Array(frame, headerSize);
    pcm.set(buffer);

    ws.send(frame);
  }, []);

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
