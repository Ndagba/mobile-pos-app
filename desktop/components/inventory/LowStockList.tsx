'use client';

import type { ReactNode } from 'react';
import type { LowStockItem } from '@/hooks/useLowStock';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

/** Alert-level pill colours — CRITICAL (≤0) worst, then URGENT, then WARNING. */
const ALERT_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  URGENT: 'bg-orange-100 text-orange-700',
  WARNING: 'bg-amber-100 text-amber-700',
};

/**
 * Low-stock alerts from `GET /inventory/low-stock` (SERVICE items already
 * excluded server-side). Each row shows the shortfall against its threshold and
 * an alert-level pill. The +10 quick-restock action is injected by the page via
 * `renderItemActions` (wired in 3B).
 */
export function LowStockList({
  items,
  loading,
  renderItemActions,
}: {
  items: LowStockItem[];
  loading?: boolean;
  renderItemActions?: (item: LowStockItem) => ReactNode;
}) {
  if (loading && items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No low-stock items — everything is above its threshold.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Product</th>
            <th className="px-4 py-2.5 font-medium">SKU</th>
            <th className="px-4 py-2.5 text-right font-medium">On hand</th>
            <th className="px-4 py-2.5 text-right font-medium">Threshold</th>
            <th className="px-4 py-2.5 font-medium">Alert</th>
            {renderItemActions && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.product_id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{it.product_name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{it.sku || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{it.current_quantity}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{it.low_stock_threshold}</td>
              <td className="px-4 py-2.5">
                <span
                  className={cn(
                    'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                    ALERT_STYLES[it.alert_level] ?? 'bg-muted text-muted-foreground'
                  )}
                >
                  {it.alert_level}
                </span>
              </td>
              {renderItemActions && (
                <td className="px-4 py-2.5 text-right">{renderItemActions(it)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
