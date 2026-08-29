import { describe, expect, it } from 'vitest';
import { isTypingTarget, shouldTriggerShortcut } from './shortcuts';

const evt = (overrides = {}) => ({
  key: 'b',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
  target: { tagName: 'BODY' },
  ...overrides,
});

describe('isTypingTarget', () => {
  it('detects text-entry elements', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('ignores everything else', () => {
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('shouldTriggerShortcut', () => {
  it('fires for a bare letter press', () => {
    expect(shouldTriggerShortcut(evt(), 'b')).toBe(true);
    expect(shouldTriggerShortcut(evt({ key: 'B' }), 'b')).toBe(true);
  });

  it('does not fire while typing into a field', () => {
    expect(shouldTriggerShortcut(evt({ target: { tagName: 'INPUT' } }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(evt({ target: { tagName: 'TEXTAREA' } }), 'b')).toBe(false);
    expect(
      shouldTriggerShortcut(evt({ target: { tagName: 'DIV', isContentEditable: true } }), 'b')
    ).toBe(false);
  });

  it('leaves modifier combinations to the browser', () => {
    expect(shouldTriggerShortcut(evt({ ctrlKey: true }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(evt({ metaKey: true }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(evt({ altKey: true }), 'b')).toBe(false);
  });

  it('ignores key repeat and IME composition', () => {
    expect(shouldTriggerShortcut(evt({ repeat: true }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(evt({ isComposing: true }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(evt({ keyCode: 229 }), 'b')).toBe(false);
  });

  it('only matches the requested key', () => {
    expect(shouldTriggerShortcut(evt({ key: 'a' }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(evt({ key: 'Escape' }), 'b')).toBe(false);
    expect(shouldTriggerShortcut(null, 'b')).toBe(false);
  });
});
