'use client';

import Link from 'next/link';
import type { LowStockItem } from '@/hooks/useLowStock';
import { Spinner } from '@/components/ui/spinner';

/** The reorder baseline: the product's reorder point, else its low-stock threshold. */
function reorderBase(it: LowStockItem): number {
  return it.reorder_point && it.reorder_point > 0 ? it.reorder_point : it.low_stock_threshold;
}

/** A simple suggested order quantity: enough to reach twice the reorder baseline. */
function suggestedQty(it: LowStockItem): number {
  return Math.max(1, Math.round(reorderBase(it) * 2 - it.current_quantity));
}

/**
 * Right-rail card (design handoff): the products running low, each with a
 * one-click "Suggest N" that starts a new purchase order. Shows the top few by
 * urgency; the full list lives on the Inventory → Low stock tab.
 */
export function SuggestedReorders({
  items,
  loading,
  limit = 5,
}: {
  items: LowStockItem[];
  loading?: boolean;
  limit?: number;
}) {
  const top = items.slice(0, limit);

  return (
    <section className="rounded-card border border-border bg-card">
      <div className="border-b border-divider px-4 py-3">
        <h2 className="text-sm font-bold text-ink">Suggested reorders</h2>
      </div>
      {loading && items.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      ) : top.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-muted">Nothing is low on stock.</p>
      ) : (
        <ul>
          {top.map((it) => (
            <li
              key={it.product_id}
              className="flex items-center gap-3 border-b border-divider px-4 py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{it.product_name}</p>
                <p className="text-xs text-text-muted">
                  {it.current_quantity} left · reorder at {reorderBase(it)}
                </p>
              </div>
              <Link
                href="/purchasing/new"
                className="shrink-0 text-sm font-semibold text-primary hover:underline"
              >
                Suggest {suggestedQty(it)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
