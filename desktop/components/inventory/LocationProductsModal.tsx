'use client';

import { useMemo } from 'react';
import type { Location, Product } from '@jaypos/shared';
import { naira } from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { StockBadge } from './StockBadge';

/** The catalog price shown per row: discounted price if set, else the tag/base. */
function displayPrice(p: Product): number {
  return p.effective_price ?? p.unit_price ?? p.marked_price ?? 0;
}

/**
 * Read-only view of the products assigned to a single physical location.
 * Filters the already-loaded catalogue by `location_id` (no extra request) so it
 * stays consistent with the inventory page's branch/category scoping.
 */
export function LocationProductsModal({
  open,
  onClose,
  location,
  products,
}: {
  open: boolean;
  onClose: () => void;
  location?: Location | null;
  products: Product[];
}) {
  const assigned = useMemo(
    () => (location ? products.filter((p) => p.location_id === location.id) : []),
    [products, location]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={location ? `Products at ${location.name}` : 'Products'}
      className="max-w-2xl"
    >
      <div className="px-4 py-4">
        {assigned.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No products are assigned to this location yet.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {assigned.length} product{assigned.length === 1 ? '' : 's'} assigned.
            </p>
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">SKU</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5 font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{p.name}</span>
                        {p.category?.name && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.category.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.sku || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {naira(displayPrice(p))}
                      </td>
                      <td className="px-4 py-2.5">
                        <StockBadge product={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
