export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';

export const UPDATE_PHASES = {
  queued: 'Update queued',
  preparing: 'Checking the installation',
  downloading: 'Downloading the update',
  verifying: 'Verifying downloaded files',
  applying: 'Installing the update',
  restarting: 'Restarting the studio',
  rolling_back: 'Restoring the previous version',
  complete: 'Update installed',
  rolled_back: 'Previous version restored',
  error: 'Update failed',
  recovery_required: 'Recovery needs attention',
};

export function releaseUrl(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '')
    ? `https://github.com/sioaeko/OpenVoiceChanger/releases/tag/v${version}`
    : null;
}

export function updatePresentation(state, { pending = false, clientVersion = APP_VERSION } = {}) {
  const busy = pending || Boolean(state?.busy);
  const reload = Boolean(state?.current_version && clientVersion !== 'unknown'
    && state.current_version !== clientVersion && !busy);
  const failed = ['error', 'rolled_back', 'recovery_required'].includes(state?.operation?.phase);
  return {
    busy,
    needsReload: reload,
    visible: busy || reload || Boolean(state?.available) || failed,
    label: busy ? 'Updating...' : reload ? 'Reload to finish' : state?.available ? 'Update available' : 'Update status',
  };
}

export function localUpdateBlock({ isStarting, isRunning, isRecording, lastRecording, converterBlock }) {
  if (isRecording) return 'Stop recording before restarting the studio.';
  if (isStarting) return 'Finish or cancel microphone setup before restarting the studio.';
  if (isRunning) return 'Stop audio routing before restarting the studio.';
  if (lastRecording) return 'Download and clear the last recording before restarting the studio.';
  return converterBlock || null;
}

export function canReloadAfterUpdate(state, requested, blocked) {
  return Boolean(requested && !blocked && !state?.busy
    && state?.operation?.phase === 'complete'
    && state.operation.job_id === requested.job_id
    && state.current_version === requested.version);
}
