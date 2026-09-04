import { useCallback, useEffect, useRef, useState } from 'react';
import { checkForUpdates, fetchUpdateState, installUpdate } from '../lib/api';
import { canReloadAfterUpdate, updatePresentation } from '../lib/updates';

export default function useUpdates(blocked) {
  const [state, setState] = useState(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const requested = useRef(null);
  // Latest committed values for the async handlers below; synced after each
  // render rather than during it, which is the only time a ref may be written.
  const latest = useRef({ state, blocked, pending });
  useEffect(() => {
    latest.current = { state, blocked, pending };
  }, [state, blocked, pending]);
  const alive = useRef(false);
  const refreshRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    let timer;
    let controller;
    let reading = false;
    let disposed = false;
    const poll = async () => {
      if (reading || disposed) return;
      clearTimeout(timer);
      reading = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const next = await fetchUpdateState({ signal: controller.signal });
        if (!disposed) {
          if (!requested.current || next.operation?.job_id === requested.current.job_id) {
            latest.current.state = next;
            setState(next);
          }
          setReconnecting(false);
          setStatusError(null);
        }
      } catch (err) {
        if (!disposed) {
          setReconnecting(true);
          if (!latest.current.state?.busy && !requested.current) {
            setStatusError(err.name === 'AbortError' ? 'Update status request timed out.' : 'Update status is unavailable.');
          }
        }
      } finally {
        clearTimeout(timeout);
        reading = false;
        if (!disposed) {
          const busy = latest.current.state?.busy || latest.current.pending || requested.current;
          timer = setTimeout(poll, busy ? 1500 : 60000);
        }
      }
    };
    refreshRef.current = poll;
    poll();
    const visible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      alive.current = false;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visible);
      refreshRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (canReloadAfterUpdate(state, requested.current, blocked)) {
      requested.current = null;
      window.location.reload();
    } else if (['error', 'rolled_back', 'recovery_required'].includes(state?.operation?.phase)) {
      requested.current = null;
    }
  }, [state, blocked]);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const next = await checkForUpdates({ signal: AbortSignal.timeout(60000) });
      if (alive.current) {
        setState(next);
        setReconnecting(false);
        setStatusError(null);
      }
    } catch (err) {
      if (alive.current) setError(err.message || 'Unable to check for updates.');
    } finally {
      if (alive.current) setChecking(false);
    }
  }, []);

  const install = useCallback(async () => {
    if (latest.current.blocked || latest.current.pending || latest.current.state?.busy) return;
    const version = latest.current.state?.latest?.version;
    if (!version) return;
    setPending(true);
    latest.current.pending = true;
    setError(null);
    try {
      const operation = await installUpdate(version, { signal: AbortSignal.timeout(30000) });
      requested.current = operation;
      if (alive.current) setState((previous) => ({ ...previous, busy: true, operation }));
    } catch (err) {
      if (alive.current) setError(err.message || 'Unable to start the update.');
    } finally {
      latest.current.pending = false;
      if (alive.current) setPending(false);
      refreshRef.current?.();
    }
  }, []);

  const reload = useCallback(() => {
    if (!latest.current.blocked && !latest.current.pending && !latest.current.state?.busy) {
      window.location.reload();
    }
  }, []);

  return {
    state, checking: checking || Boolean(state?.checking) || (!state && !statusError),
    error: error || statusError, reconnecting,
    ...updatePresentation(state, { pending }),
    blocked, check, install, reload,
  };
}
