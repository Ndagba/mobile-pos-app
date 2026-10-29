'use client';

import type { Product } from '@jaypos/shared';
import { getAvailableStock, isOutOfStock, naira } from '@jaypos/shared';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/apiClient';

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

  // Resolve image URL: Remove '/v1' from API_BASE_URL to get the root server URL,
  // since static uploads are served from '/uploads' not '/v1/uploads'.
  const rootUrl = API_BASE_URL.replace(/\/v1\/?$/, '');
  const fullImageUrl = product.image_url ? `${rootUrl}${product.image_url}` : null;

  return (
    <button
      type="button"
      disabled={out}
      onClick={() => onSelect(product)}
      className={cn(
        'flex min-h-[92px] items-start gap-2 rounded-lg border bg-card p-3 text-left transition-colors',
        out ? 'cursor-not-allowed opacity-50' : 'hover:border-primary hover:bg-accent'
      )}
    >
      <div className="flex flex-col justify-between gap-1">
        <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
        <div className="mt-auto">
          <span className="block text-base font-semibold text-primary">{naira(price)}</span>
          <span className="text-xs text-muted-foreground">
            {isService ? 'Service' : out ? 'Out of stock' : `${getAvailableStock(product)} in stock`}
          </span>
          {product.location?.name && (
            <span className="block text-xs text-muted-foreground">
              Location: {product.location.name}
            </span>
          )}
        </div>
      </div>
      {fullImageUrl && (
        <img
          src={fullImageUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-md object-cover bg-muted"
        />
      )}
    </button>
  );


}
