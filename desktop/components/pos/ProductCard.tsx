'use client';

import type { Product } from '@jaypos/shared';
import { getAvailableStock, isOutOfStock, naira } from '@jaypos/shared';
import { cn } from '@/lib/utils';

/**
 * A single tappable product tile. Out-of-stock physical products are disabled
 * (mirrors mobile); services show no stock line and are always sellable.
 */
export function ProductCard({
  product,
  onSelect,
}: {
  product: Product;
  onSelect: (p: Product) => void;
}) {
  const out = isOutOfStock(product);
  const price = product.effective_price ?? product.unit_price ?? 0;
  const isService = product.item_type === 'SERVICE';

  return (
    <button
      type="button"
      disabled={out}
      onClick={() => onSelect(product)}
      className={cn(
        'flex min-h-[92px] flex-col items-start justify-between gap-1 rounded-lg border bg-card p-3 text-left transition-colors',
        out ? 'cursor-not-allowed opacity-50' : 'hover:border-primary hover:bg-accent'
      )}
    >
      <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
      <div>
        <span className="block text-base font-semibold text-primary">{naira(price)}</span>
        <span className="text-xs text-muted-foreground">
          {isService ? 'Service' : out ? 'Out of stock' : `${getAvailableStock(product)} in stock`}
        </span>
      </div>
    </button>
  );
}
