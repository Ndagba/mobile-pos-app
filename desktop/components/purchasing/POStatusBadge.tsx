'use client';

import { cn } from '@/lib/utils';
import { PO_STATUS_LABEL, type POStatus } from '@/hooks/usePurchaseOrders';

/** Coloured status pill for a purchase order (five string states). */
const STYLES: Record<POStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  ordered: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-amber-100 text-amber-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function POStatusBadge({ status, className }: { status: POStatus; className?: string }) {
  return (
    <span
      className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', STYLES[status], className)}
    >
      {PO_STATUS_LABEL[status]}
    </span>
  );
}
