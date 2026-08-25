'use client';

import type { Product } from '@jaypos/shared';
import { cn } from '@/lib/utils';
import { stockBadgeInfo } from '@/lib/inventory';

/** Tailwind classes per stock status, matching mobile's red/amber/green scheme. */
const STATUS_STYLES: Record<string, string> = {
  OUT_OF_STOCK: 'bg-red-100 text-red-700',
  LOW: 'bg-amber-100 text-amber-700',
  IN_STOCK: 'bg-emerald-100 text-emerald-700',
};

/**
 * A product's stock state as a pill. Services get a neutral "Service" pill (they
 * carry no stock); products show their on-hand quantity coloured green/amber/red
 * by `stockStatus` (out ≤ 0, low ≤ threshold, else in-stock).
 */
export function StockBadge({ product, className }: { product: Product; className?: string }) {
  const info = stockBadgeInfo(product);

  if (info.isService) {
    return (
      <span
        className={cn(
          'inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
          className
        )}
      >
        Service
      </span>
    );
  }

  const unit = product.unit || (info.quantity === 1 ? 'unit' : 'units');
  const label = info.status === 'OUT_OF_STOCK' ? 'Out of stock' : `${info.quantity} ${unit}`;

  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        STATUS_STYLES[info.status],
        className
      )}
    >
      {label}
    </span>
  );
}
