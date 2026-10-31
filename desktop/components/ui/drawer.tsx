'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Right-side drawer (handoff §6): slides in over a scrim, closable via the scrim,
 * the ✕, or Escape. Used for product/stock/ledger/history/supplier forms. Header
 * is sticky; an optional sticky footer holds the action buttons.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Panel width in px (handoff: product drawer 520, cart-ish 400). */
  width?: number;
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="jp-scrim-in absolute inset-0 bg-[rgba(14,14,16,0.32)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className={cn(
          'jp-drawer-in relative z-10 flex h-full max-w-full flex-col bg-card shadow-drawer',
          className
        )}
      >
        {(title !== undefined || description !== undefined) && (
          <div className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
            <div className="min-w-0">
              {title !== undefined && (
                <h2 className="text-lg font-bold tracking-[-0.01em] text-ink">{title}</h2>
              )}
              {description !== undefined && (
                <p className="mt-0.5 text-xs text-text-muted">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer !== undefined && (
          <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
