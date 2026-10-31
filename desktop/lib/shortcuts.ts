'use client';

/**
 * Lightweight keyboard-shortcut bus (handoff §6). Global navigation + the command
 * palette are handled directly in the shell; page-local actions (POS hold/pay/
 * focus-search) are broadcast here so whichever POS screen is mounted can react
 * without the shell importing it.
 */
export type ShortcutAction = 'hold' | 'pay' | 'focus-search';

const target: EventTarget | null = typeof window !== 'undefined' ? new EventTarget() : null;
const EVT = 'jaypos:shortcut';

export function emitShortcut(action: ShortcutAction) {
  target?.dispatchEvent(new CustomEvent(EVT, { detail: action }));
}

export function onShortcut(action: ShortcutAction, cb: () => void): () => void {
  if (!target) return () => {};
  const handler = (e: Event) => {
    if ((e as CustomEvent<ShortcutAction>).detail === action) cb();
  };
  target.addEventListener(EVT, handler);
  return () => target.removeEventListener(EVT, handler);
}

/** True when focus is in a text-entry control (so we ignore most shortcuts). */
export function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    node.isContentEditable === true
  );
}
