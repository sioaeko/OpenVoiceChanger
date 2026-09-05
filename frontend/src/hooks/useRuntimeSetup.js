import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelRuntimeSetup, fetchRuntimeSetup, installRuntime } from '../lib/api';

export default function useRuntimeSetup(blocked) {
  const [state, setState] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const latest = useRef({ state, blocked, pending });
  const epoch = useRef(0);
  const alive = useRef(false);
  const refresh = useRef(null);
  useEffect(() => { latest.current = { state, blocked, pending }; }, [state, blocked, pending]);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    let reading = false;
    let timer;
    let controller;
    const poll = async () => {
      if (reading || disposed) return;
      reading = true;
      clearTimeout(timer);
      const version = epoch.current;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const next = await fetchRuntimeSetup({ signal: controller.signal });
        if (!disposed && version === epoch.current) {
          latest.current.state = next;
          setState(next);
          setOffline(false);
          if (!next.busy) setCancelRequested(false);
        }
      } catch {
        if (!disposed) setOffline(true);
      } finally {
        clearTimeout(timeout);
        reading = false;
        if (!disposed) timer = setTimeout(poll, latest.current.state?.busy || latest.current.pending ? 1000 : 15000);
      }
    };
    refresh.current = poll;
    poll();
    const visible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      alive.current = false;
      clearTimeout(timer);
      controller?.abort();
      refresh.current = null;
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  const install = useCallback(async () => {
    if (!latest.current.state || latest.current.pending || latest.current.state.busy
      || latest.current.state.blocked || latest.current.blocked) return;
    latest.current.pending = true;
    epoch.current += 1;
    setPending(true);
    setError(null);
    setCancelRequested(false);
    try {
      const operation = await installRuntime({ timeoutMs: 30000 });
      if (alive.current) {
        const next = { ...latest.current.state, busy: true, operation };
        latest.current.state = next;
        setState(next);
      }
    } catch (err) {
      if (alive.current) setError(err.message || 'Unable to start setup.');
    } finally {
      epoch.current += 1;
      latest.current.pending = false;
      if (alive.current) setPending(false);
      refresh.current?.();
    }
  }, []);

  const cancel = useCallback(async () => {
    const id = latest.current.state?.operation?.job_id;
    if (!id) return;
    setCancelRequested(true);
    try {
      await cancelRuntimeSetup(id, { timeoutMs: 10000 });
    } catch (err) {
      if (alive.current) {
        setError(err.message || 'Unable to cancel setup.');
        setCancelRequested(false);
      }
    } finally { refresh.current?.(); }
  }, []);

  return { state, busy: pending || Boolean(state?.busy), pending, error, offline, cancelRequested,
    blocked, install, cancel, refresh: () => refresh.current?.() };
}
