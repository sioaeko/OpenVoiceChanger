import React from 'react';

/**
 * On/off switch shared by the effect cards and the settings modal.
 *
 * `label` is the full accessible name ("Toggle Reverb"): the visible text next
 * to a switch is usually a heading, so the control names itself.
 */
export default function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className="toggle-switch"
    >
      <span aria-hidden="true" />
    </button>
  );
}
