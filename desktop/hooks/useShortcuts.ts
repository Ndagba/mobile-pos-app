'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore } from '@/store/uiStore';
import { emitShortcut, onShortcut, isTypingTarget, type ShortcutAction } from '@/lib/shortcuts';

/**
 * Global shortcut handler, mounted once in the AppShell (handoff §6):
 *   Ctrl/⌘K command menu · F2 new sale · F3 history · F4 hold · F9 pay · / focus search.
 * F-keys and Ctrl/⌘K work even while typing; `/` and plain keys are ignored in inputs.
 * Esc is left to the top-most drawer/modal to handle.
 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const toggleCommand = useUiStore((s) => s.toggleCommand);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);

      // Command palette — always available.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        toggleCommand();
        return;
      }

      // F-keys — always available (even while typing).
      switch (e.key) {
        case 'F2':
          e.preventDefault();
          router.push('/sales');
          return;
        case 'F3':
          e.preventDefault();
          router.push('/sales/history');
          return;
        case 'F4':
          e.preventDefault();
          emitShortcut('hold');
          return;
        case 'F9':
          e.preventDefault();
          emitShortcut('pay');
          return;
      }

      if (typing) return;

      // Plain-key shortcuts — ignored while typing.
      if (e.key === '/') {
        e.preventDefault();
        emitShortcut('focus-search');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, toggleCommand]);
}

/** Subscribe a page-local handler to a broadcast shortcut (POS hold/pay/focus). */
export function useShortcut(action: ShortcutAction, handler: () => void) {
  useEffect(() => onShortcut(action, handler), [action, handler]);
}
