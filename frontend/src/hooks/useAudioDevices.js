import { useCallback, useEffect, useState } from 'react';

export default function useAudioDevices() {
  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);

  const enumerate = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(
        devices.filter((d) => d.kind === 'audioinput' && d.deviceId)
      );
      setOutputDevices(
        devices.filter((d) => d.kind === 'audiooutput' && d.deviceId)
      );
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err);
    }
  }, []);

  // Full refresh: request mic permission to get labeled device names,
  // then enumerate. Only call this on user action (e.g. clicking Start).
  const refresh = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch(() => null);

      await enumerate();

      stream?.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.error('Failed to refresh audio devices:', err);
    }
  }, [enumerate]);

  // On mount: enumerate without requesting permission (labels may be empty,
  // but at least we know devices exist). Permission is requested later when
  // the user clicks Start.
  useEffect(() => {
    enumerate();

    const handleDeviceChange = () => enumerate();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerate]);

  return { inputDevices, outputDevices, refresh };
}
