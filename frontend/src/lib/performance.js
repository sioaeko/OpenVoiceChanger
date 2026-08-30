export const PERFORMANCE_PROFILES = [
  { id: 'responsive', label: 'Responsive', chunkSize: 2048 },
  { id: 'balanced', label: 'Balanced', chunkSize: 4096 },
  { id: 'stable', label: 'Stable', chunkSize: 8192 },
];

function finitePositive(values) {
  return (values || []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
}

export function percentile(values, ratio) {
  const sorted = finitePositive(values).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

export function bufferDurationMs(chunkSize, sampleRate) {
  const size = Number(chunkSize);
  const rate = Number(sampleRate);
  if (!Number.isFinite(size) || !Number.isFinite(rate) || size <= 0 || rate <= 0) return 0;
  return (size * 1000) / rate;
}

export function profileForChunkSize(chunkSize) {
  const size = Number(chunkSize);
  return PERFORMANCE_PROFILES.find((profile) => profile.chunkSize === size) || {
    id: 'custom',
    label: 'Custom',
    chunkSize: size,
  };
}

export function recommendPerformanceProfile({
  latencyHistory,
  sampleRate,
  serverMs,
  serverStats,
  isRunning,
}) {
  const samples = finitePositive(latencyHistory).slice(-30);
  const processingMs = Math.max(
    Number(serverMs) || 0,
    (Number(serverStats?.modelMs) || 0) + (Number(serverStats?.dspMs) || 0)
  );

  if (!isRunning || samples.length < 8 || processingMs <= 0 || serverStats?.inferenceSleeping) {
    return {
      ready: false,
      sampleCount: samples.length,
      p95Ms: percentile(samples, 0.95),
      processingMs,
    };
  }

  const p95Ms = percentile(samples, 0.95);
  const profile = PERFORMANCE_PROFILES.find((candidate) => {
    const budgetMs = bufferDurationMs(candidate.chunkSize, sampleRate);
    return processingMs <= budgetMs * 0.7 && p95Ms <= budgetMs * 1.65;
  }) || PERFORMANCE_PROFILES[PERFORMANCE_PROFILES.length - 1];

  return {
    ready: true,
    profile,
    p95Ms,
    processingMs,
    constrained: profile.id === 'stable'
      && (processingMs > bufferDurationMs(profile.chunkSize, sampleRate) * 0.7
        || p95Ms > bufferDurationMs(profile.chunkSize, sampleRate) * 1.65),
    sampleCount: samples.length,
  };
}
