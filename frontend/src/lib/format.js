// Human-readable formatting shared by the recorder, the converter and the
// model bay. One implementation so a take, an upload and a checkpoint all
// describe their size the same way.

function trimZeros(text) {
  return text.replace(/\.?0+$/, '');
}

/** Byte count -> "12 KB", "1.5 MB", "2.3 GB". Anything unusable reads as 0 B. */
export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${trimZeros((value / 1024 ** 2).toFixed(1))} MB`;
  return `${trimZeros((value / 1024 ** 3).toFixed(2))} GB`;
}

/** Seconds -> "m:ss", growing to "h:mm:ss" past an hour. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * Local timestamp safe for a file name: 2026-09-04_14-07-32. Sorts
 * chronologically and reads as a time, unlike a raw epoch millisecond count.
 */
export function formatFileTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
