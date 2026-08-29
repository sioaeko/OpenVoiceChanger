// Keyboard-shortcut gating.
//
// Global single-letter shortcuts are only safe if they stay out of the way of
// text entry: pressing "b" while naming a preset must type a b, not flip the
// bypass. Kept as a pure predicate so the rule is testable without a DOM.

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True when the event target is somewhere the user is typing. */
export function isTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName ? String(target.tagName).toUpperCase() : '';
  return TEXT_ENTRY_TAGS.has(tag);
}

/**
 * Whether a keydown should fire the given single-letter shortcut.
 *
 * Modifier combinations belong to the browser and the OS (Ctrl+B, Cmd+B), and
 * IME composition must never be interrupted mid-word.
 */
export function shouldTriggerShortcut(event, key) {
  if (!event) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.repeat) return false;
  if (event.isComposing || event.keyCode === 229) return false;
  if (typeof event.key !== 'string' || event.key.toLowerCase() !== key.toLowerCase()) return false;
  return !isTypingTarget(event.target);
}
