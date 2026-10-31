'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Centered modal (handoff §6): dimmed scrim + panel that fades and scales from
 * .98, closable via the scrim, the ✕, or Escape. Built from primitives (no extra
 * deps). API is unchanged from the original so existing call sites keep working.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="jp-scrim-in absolute inset-0 bg-[rgba(14,14,16,0.32)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'jp-modal-in relative z-10 max-h-[90vh] w-full max-w-md overflow-hidden rounded-modal border bg-card shadow-modal',
          className
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
            <h2 className="text-md font-bold tracking-[-0.01em] text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
