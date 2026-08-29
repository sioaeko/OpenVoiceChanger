import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMediaDeviceSupport, supportsOutputDeviceSelection } from '../lib/audioSupport';

export default function useAudioDevices() {
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLabels, setHasLabels] = useState(false);
  const [permissionState, setPermissionState] = useState('prompt');
  const [error, setError] = useState(null);

  // Probed once: whether this browser can capture at all, and whether it can
  // route Web Audio output to a chosen device.
  const support = useMemo(() => getMediaDeviceSupport(), []);
  const outputSelectionSupported = useMemo(() => supportsOutputDeviceSelection(), []);

  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError(support.reason || 'This browser does not support media device enumeration.');
      setInputDevices([]);
      setOutputDevices([]);
      setHasLabels(false);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
      const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId);
      setInputDevices(inputs);
      setOutputDevices(outputs);
      setHasLabels([...inputs, ...outputs].some((d) => d.label));
      // Devices may enumerate fine while capture itself is unavailable (an
      // insecure origin exposing enumerateDevices but not getUserMedia), so
      // the capture problem must survive a successful enumeration.
      setError(support.supported ? null : support.reason);
    } catch (err) {
      setError(err.message || 'Failed to enumerate audio devices.');
      console.error('Failed to enumerate audio devices:', err);
    }
  }, [support.supported, support.reason]);

  // Full refresh: request mic permission to get labeled device names,
  // then enumerate. Only call this on user action (e.g. clicking Start).
  const refresh = useCallback(async () => {
    if (!support.supported) {
      setError(support.reason);
      return;
    }

    setIsRefreshing(true);
    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setPermissionState('granted');
      } catch (err) {
        if (err?.name === 'NotAllowedError') {
          setPermissionState('denied');
          setError('Microphone permission is required to reveal device names.');
        } else {
          setError(err.message || 'Failed to access the microphone.');
        }
      }

      await enumerate();

      stream?.getTracks().forEach((t) => t.stop());
    } catch (err) {
      setError(err.message || 'Failed to refresh audio devices.');
      console.error('Failed to refresh audio devices:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [enumerate, support.supported, support.reason]);

  // On mount: enumerate without requesting permission (labels may be empty,
  // but at least we know devices exist). Permission is requested later when
  // the user clicks Start.
  useEffect(() => {
    enumerate();

    let permissionStatus = null;
    const handleDeviceChange = () => enumerate();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' })
        .then((status) => {
          permissionStatus = status;
          setPermissionState(status.state);

          if (status.state === 'granted') {
            enumerate();
          }

          status.onchange = () => {
            setPermissionState(status.state);
            enumerate();
          };
        })
        .catch(() => {});
    }

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [enumerate]);

  return {
    inputDevices,
    outputDevices,
    refresh,
    isRefreshing,
    hasLabels,
    permissionState,
    error,
    captureSupported: support.supported,
    insecureContext: Boolean(support.insecureContext),
    outputSelectionSupported,
  };
}
