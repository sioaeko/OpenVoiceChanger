import React from 'react';
import { Download, LoaderCircle, RefreshCw } from 'lucide-react';

export default function UpdateButton({ updates, onClick }) {
  if (!updates.visible) return null;
  const Icon = updates.busy ? LoaderCircle : updates.needsReload ? RefreshCw : Download;
  const title = updates.state?.available
    ? `${updates.label}: v${updates.state.latest.version}`
    : updates.label;
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip-button h-8 flex-shrink-0 gap-2 !px-2 sm:!px-3"
      aria-label={title}
      title={title}
    >
      <Icon className={`h-4 w-4 flex-shrink-0 ${updates.busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span className="sm:hidden">{updates.busy ? 'Updating' : updates.needsReload ? 'Reload' : 'Update'}</span>
      <span className="hidden sm:inline">{updates.label}</span>
    </button>
  );
}
