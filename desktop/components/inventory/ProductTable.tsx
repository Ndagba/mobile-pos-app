'use client';

import type { ReactNode } from 'react';
import type { Product } from '@jaypos/shared';
import { naira } from '@jaypos/shared';
import { StockBadge } from './StockBadge';
import { Spinner } from '@/components/ui/spinner';

/** The catalog price shown per row: discounted price if set, else the tag/base. */
function displayPrice(p: Product): number {
  return p.effective_price ?? p.unit_price ?? p.marked_price ?? 0;
}

/**
 * The product catalog as a table: name, SKU, price, and stock badge. The branch
 * column only appears for multi-branch admins (`showBranch`). Row actions
 * (adjust / edit / delete / ledger) are injected by the page via `renderRowActions`
 * so this component stays presentational — later sub-steps wire the modals in.
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
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">SKU</th>
            {showBranch && <th className="px-4 py-2.5 font-medium">Branch</th>}
            <th className="px-4 py-2.5 text-right font-medium">Price</th>
            <th className="px-4 py-2.5 font-medium">Stock</th>
            {renderRowActions && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5">
                <span className="font-medium">{p.name}</span>
                {p.category?.name && (
                  <span className="ml-2 text-xs text-muted-foreground">{p.category.name}</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{p.sku || '—'}</td>
              {showBranch && (
                <td className="px-4 py-2.5 text-muted-foreground">
                  {branchName?.(p.branch_id) ?? '—'}
                </td>
              )}
              <td className="px-4 py-2.5 text-right tabular-nums">{naira(displayPrice(p))}</td>
              <td className="px-4 py-2.5">
                <StockBadge product={p} />
              </td>
              {renderRowActions && (
                <td className="px-4 py-2.5 text-right">{renderRowActions(p)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
