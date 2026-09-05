import React from 'react';
import { Check, CircleAlert, ExternalLink, RefreshCw } from 'lucide-react';
import RuntimeSetupPanel from './RuntimeSetupPanel';

export default function RuntimeReadiness({ readiness, checking, error, onRefresh, setup }) {
  const checks = readiness?.checks || [];
  return (
    <section className="min-w-0 py-4" aria-label="RVC readiness">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg-secondary">RVC readiness</h3>
        <button type="button" className="frost-control inline-flex h-9 w-9 shrink-0 items-center justify-center"
          title="Recheck runtime" aria-label="Recheck runtime" onClick={onRefresh} disabled={checking}>
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <p role="status" className={`mt-2 text-xs ${error ? 'text-danger-fg' : 'text-fg-muted'}`}>
        {error || (checking ? 'Checking prerequisites...' : !readiness ? 'Runtime status unavailable.'
          : readiness.prerequisitesDetected ? 'Prerequisites detected. Model loading verifies inference.' : 'RVC prerequisites are missing. Model-free DSP remains available.')}
      </p>
      <RuntimeSetupPanel setup={setup} />
      {['Required', 'Optional'].map((group) => (
        <details key={group} open={group === 'Required'} className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-fg-secondary">{group}</summary>
          <ul className="mt-2 divide-y divide-line">
            {checks.filter((item) => item.required === (group === 'Required')).map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-2 text-xs">
                {item.available ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok-fg" aria-hidden="true" />
                  : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn-fg" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <span className="text-fg-secondary">{item.label}</span>
                  {item.setting && <code className="mt-1 block break-all text-[11px] text-fg-faint">{item.setting}</code>}
                </div>
                <span className="shrink-0 text-fg-subtle">{item.available ? 'Detected' : 'Missing'}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <a href="https://github.com/sioaeko/OpenVoiceChanger#quick-start" target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 text-xs text-fg-secondary underline underline-offset-4">
        Installation guide <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </section>
  );
}
