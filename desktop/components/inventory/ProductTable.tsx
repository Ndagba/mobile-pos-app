'use client';

import type { ReactNode } from 'react';
import type { Product } from '@jaypos/shared';
import { naira } from '@jaypos/shared';
import { cn } from '@/lib/utils';
import { numify } from '@/lib/normalize';
import { stockBadgeInfo } from '@/lib/inventory';
import { Spinner } from '@/components/ui/spinner';

/** The catalog price shown per row: discounted price if set, else the tag/base. */
function displayPrice(p: Product): number {
  return p.effective_price ?? p.unit_price ?? p.marked_price ?? 0;
}

/** Gross margin as a whole percentage, or null when it can't be computed. */
function marginPct(price: number, cost: number): number | null {
  if (!price || cost <= 0) return null;
  return Math.round(((price - cost) / price) * 100);
}

/** Status pill styles, matching mobile's red/amber/green scheme. */
const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  OUT_OF_STOCK: { label: 'Out of stock', cls: 'bg-red-100 text-red-700' },
  LOW: { label: 'Low', cls: 'bg-amber-100 text-amber-700' },
  IN_STOCK: { label: 'In stock', cls: 'bg-emerald-100 text-emerald-700' },
};

/**
 * The product catalog as a table, laid out to match the design handoff:
 * ITEM (name + SKU), CATEGORY, LOCATION, ON HAND, PRICE, COST, MARGIN, STATUS,
 * then row actions. The branch column only appears for multi-branch admins
 * (`showBranch`). Row actions (adjust / ledger / edit / delete) are injected by
 * the page via `renderRowActions` so this component stays presentational.
 */
export function ProductTable({
  products,
  loading,
  showBranch,
  branchName,
  renderRowActions,
}: {
  products: Product[];
  loading?: boolean;
  showBranch?: boolean;
  branchName?: (branchId?: string | null) => string | undefined;
  renderRowActions?: (product: Product) => ReactNode;
}) {
  if (loading && products.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (products.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No products found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-subtle text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
          <tr>
            <th className="px-4 py-2.5">Item</th>
            <th className="px-4 py-2.5">Category</th>
            <th className="px-4 py-2.5">Location</th>
            {showBranch && <th className="px-4 py-2.5">Branch</th>}
            <th className="px-4 py-2.5 text-right">On hand</th>
            <th className="px-4 py-2.5 text-right">Price</th>
            <th className="px-4 py-2.5 text-right">Cost</th>
            <th className="px-4 py-2.5 text-right">Margin</th>
            <th className="px-4 py-2.5">Status</th>
            {renderRowActions && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const info = stockBadgeInfo(p);
            const price = displayPrice(p);
            const cost = numify(p.cost_price) ?? 0;
            const margin = marginPct(price, cost);
            const status = STATUS_STYLES[info.status];
            const qtyColor =
              info.status === 'OUT_OF_STOCK'
                ? 'text-red-600'
                : info.status === 'LOW'
                  ? 'text-amber-600'
                  : 'text-ink';

            return (
              <tr key={p.id} className="border-t border-divider hover:bg-surface-subtle/60">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink">{p.name}</p>
                  {p.sku && <p className="text-xs text-text-muted">{p.sku}</p>}
                </td>
                <td className="px-4 py-2.5 text-text-muted">{p.category?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-text-muted">{p.location?.name ?? '—'}</td>
                {showBranch && (
                  <td className="px-4 py-2.5 text-text-muted">{branchName?.(p.branch_id) ?? '—'}</td>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {info.isService ? (
                    <span className="text-text-muted">—</span>
                  ) : (
                    <span className={cn('font-semibold', qtyColor)}>{info.quantity}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{naira(price)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                  {info.isService || cost <= 0 ? '—' : naira(cost)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
                  {margin == null ? '—' : `${margin}%`}
                </td>
                <td className="px-4 py-2.5">
                  {info.isService ? (
                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Service
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        status.cls
                      )}
                    >
                      {status.label}
                    </span>
                  )}
                </td>
                {renderRowActions && (
                  <td className="px-4 py-2.5 text-right">{renderRowActions(p)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
