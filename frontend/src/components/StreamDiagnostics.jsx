import React, { useEffect, useRef, useState } from 'react';

export default function StreamDiagnostics({ streamInfo, playbackStats, transport = {}, serverMs = 0 }) {
  const previous = useRef(0);
  const [recentIssue, setRecentIssue] = useState(false);
  const running = Boolean(streamInfo);
  const loss = (transport.dropped || 0) + (transport.timedOut || 0)
    + (playbackStats?.underruns || 0) + (playbackStats?.droppedSamples || 0);
  useEffect(() => {
    if (!running || loss < previous.current) { previous.current = loss; setRecentIssue(false); return undefined; }
    if (loss === previous.current) return undefined;
    previous.current = loss;
    setRecentIssue(true);
    const timer = setTimeout(() => setRecentIssue(false), 5000);
    return () => clearTimeout(timer);
  }, [loss, running]);

  const rate = streamInfo?.sampleRate || 0;
  const chunkMs = rate ? streamInfo.chunkSize / rate * 1000 : 0;
  const ms = (value) => rate && value != null ? `${Math.round(value)} ms` : '--';
  const rows = [
    ['Capture chunk', ms(chunkMs)],
    ['Queued capture', ms((transport.pending || 0) * chunkMs)],
    ['Playback buffered', ms(playbackStats == null ? null : playbackStats.bufferedSamples / rate * 1000)],
    ['Browser output latency', ms(streamInfo?.outputLatency == null ? null : streamInfo.outputLatency * 1000)],
    ['In flight / queued', rate ? `${transport.inFlight || 0} / ${transport.pending || 0}` : '--'],
    ['Dropped / timed out frames', rate ? `${transport.dropped || 0} / ${transport.timedOut || 0}` : '--'],
    ['Playback underruns', rate && playbackStats ? playbackStats.underruns : '--'],
    ['Playback trimmed', ms(playbackStats == null ? null : playbackStats.droppedSamples / rate * 1000)],
  ];
  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-xs font-medium text-fg-secondary">Stream diagnostics</summary>
      <dl className="mt-3 space-y-2 text-xs">
        {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3">
          <dt className="text-fg-subtle">{label}</dt><dd className="shrink-0 font-mono tabular-nums text-fg-secondary">{value}</dd>
        </div>)}
      </dl>
      {streamInfo && (recentIssue || serverMs > chunkMs) && <p role="status" className="mt-3 text-xs text-warn-fg">
        {serverMs > chunkMs ? 'Processing exceeds the capture interval. Try a lighter F0 method or a larger buffer.'
          : 'Recent audio discontinuities detected. Check CPU load, output device and buffer size.'}
      </p>}
    </details>
  );
}
