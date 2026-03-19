// Defaults — overridden by /api/config response at runtime
export let SAMPLE_RATE = 40000;
export let CHUNK_SIZE = 4096;
export const WS_URL = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/audio`;
export const API_BASE = '/api';

export function applyConfig(config) {
  if (config.sample_rate) SAMPLE_RATE = config.sample_rate;
  if (config.chunk_size) CHUNK_SIZE = config.chunk_size;
}
