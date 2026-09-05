import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTakeStore, takeFileName } from '../lib/takes';

const defaultStore = createTakeStore();
const durable = ({ id, name, blob, seconds, size, createdAt }) => ({ id, name, blob, seconds, size, createdAt });

export default function useRecordingLibrary(store = defaultStore) {
  const [takes, setTakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const urls = useRef(new Set());
  const mounted = useRef(false);

  const withUrl = useCallback((take) => {
    const url = URL.createObjectURL(take.blob);
    urls.current.add(url);
    return { ...take, url, fileName: takeFileName(take.name) };
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const ownedUrls = urls.current;
    store.list().then((stored) => {
      if (cancelled) return;
      const restored = stored.map((take) => withUrl({ ...take, persisted: true, hasStored: true, pending: false }));
      setTakes((current) => [...current, ...restored.filter((take) => !current.some((item) => item.id === take.id))]
        .sort((a, b) => b.createdAt - a.createdAt));
    }).catch(() => {
      if (!cancelled) setError('Saved takes could not be loaded. New takes remain downloadable in this tab.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      mounted.current = false;
      for (const url of ownedUrls) URL.revokeObjectURL(url);
      ownedUrls.clear();
    };
  }, [store, withUrl]);

  const persist = useCallback(async (take) => {
    try {
      await store.put(durable(take));
      if (mounted.current) setTakes((items) => items.map((item) => item.id === take.id
        ? { ...item, persisted: true, hasStored: true, pending: false } : item));
    } catch {
      if (mounted.current) setTakes((items) => items.map((item) => item.id === take.id
        ? { ...item, persisted: false, pending: false } : item));
    }
  }, [store]);

  const addTake = useCallback((recording) => {
    const take = withUrl({ ...recording, id: crypto.randomUUID(), createdAt: Date.now(),
      name: recording.fileName.replace(/\.wav$/i, ''), persisted: false, pending: true });
    setTakes((items) => [take, ...items]);
    void persist(take);
    return take;
  }, [withUrl, persist]);

  const renameTake = useCallback((take, name) => {
    const trimmed = name.trim().slice(0, 120);
    if (!trimmed || take.pending) return;
    const next = { ...take, name: trimmed, fileName: takeFileName(trimmed), persisted: false, pending: true, downloaded: false };
    setTakes((items) => items.map((item) => item.id === take.id ? next : item));
    void persist(next);
  }, [persist]);

  const retrySave = useCallback((take) => {
    if (take.pending) return;
    setTakes((items) => items.map((item) => item.id === take.id ? { ...item, pending: true } : item));
    void persist(take);
  }, [persist]);

  const deleteTake = useCallback(async (take) => {
    if (take.pending) return;
    setTakes((items) => items.map((item) => item.id === take.id ? { ...item, pending: true } : item));
    try {
      // Even a failed rename may have an older persisted version to remove.
      await store.remove(take.id);
    } catch {
      if (take.hasStored || take.persisted) {
        if (mounted.current) {
          setError('The take could not be deleted. Retry when browser storage is available.');
          setTakes((items) => items.map((item) => item.id === take.id ? { ...item, pending: false } : item));
        }
        return;
      }
    }
    if (!mounted.current) return;
    setTakes((items) => items.filter((item) => item.id !== take.id));
    URL.revokeObjectURL(take.url);
    urls.current.delete(take.url);
  }, [store]);

  const markDownloaded = useCallback((id) => {
    setTakes((items) => items.map((item) => item.id === id ? { ...item, downloaded: true } : item));
  }, []);

  const unsaved = takes.some((take) => take.pending || (!take.persisted && !take.downloaded));
  useEffect(() => {
    if (!unsaved) return undefined;
    const guard = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);

  return useMemo(() => ({ takes, loading, error, unsaved, addTake, renameTake, retrySave, deleteTake, markDownloaded }),
    [takes, loading, error, unsaved, addTake, renameTake, retrySave, deleteTake, markDownloaded]);
}
