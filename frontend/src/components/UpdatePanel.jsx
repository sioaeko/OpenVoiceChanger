import React from 'react';
import { Download, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { APP_VERSION, UPDATE_PHASES, releaseUrl } from '../lib/updates';

export default function UpdatePanel({ updates }) {
  if (!updates) return null;
  const { state, checking, busy, needsReload, reconnecting } = updates;
  const phase = state?.operation?.phase;
  const blocked = updates.blocked || state?.install_blocked;
  const error = updates.error || state?.check_error || state?.operation?.error;
  const url = releaseUrl(state?.latest?.version);
  const status = busy
    ? reconnecting ? 'Waiting for the studio to restart' : UPDATE_PHASES[phase] || 'Starting the update'
    : needsReload ? 'Update installed. Reload this tab to finish.'
      : state?.available ? `Version ${state.latest.version} is available`
        : checking ? 'Checking for updates'
          : state?.status === 'no_release' ? 'No public releases yet'
            : state?.status === 'up_to_date' ? 'You are up to date'
              : state?.status === 'not_checked' ? 'Not checked yet'
              : 'Update check unavailable';

  return (
    <section aria-labelledby="updates-title" className="border-b border-line py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="updates-title" className="text-sm font-semibold text-fg-secondary">Updates</h3>
          <p className="mt-1 text-xs text-fg-subtle">
            Version {state?.current_version || APP_VERSION}
            {state?.automatic_checks ? ' / Checks automatically every hour' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={updates.check}
          disabled={checking || busy}
          className="frost-control inline-flex h-8 w-8 flex-shrink-0 items-center justify-center text-fg-muted"
          aria-label="Check for updates"
          title="Check for updates"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm text-fg">
          {busy ? <LoaderCircle className="h-4 w-4 flex-shrink-0 animate-spin" aria-hidden="true" /> : null}
          {status}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {url && state?.available ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-fg-muted underline underline-offset-4 hover:text-fg">
              Release notes
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          {needsReload ? (
            <button type="button" className="chip-button gap-2" onClick={updates.reload} disabled={Boolean(updates.blocked)}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload to finish
            </button>
          ) : state?.available && !busy ? (
            <button
              type="button"
              className="chip-button gap-2"
              onClick={updates.install}
              disabled={Boolean(blocked || state?.check_error || phase === 'recovery_required')}
              aria-describedby="update-install-note"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Update and restart
            </button>
          ) : null}
        </div>
      </div>

      {state?.available && !busy && !needsReload ? (
        <p id="update-install-note" className={`mt-2 text-xs leading-5 ${blocked ? 'text-warn-fg' : 'text-fg-subtle'}`}>
          {blocked || 'Restarts this studio. Models, presets and saved settings are kept.'}
        </p>
      ) : null}
      {needsReload && updates.blocked ? <p className="mt-2 text-xs text-warn-fg">{updates.blocked}</p> : null}
      {error ? <p role="alert" className="mt-2 break-words text-xs leading-5 text-warn-fg">{error}</p> : null}
    </section>
  );
}
