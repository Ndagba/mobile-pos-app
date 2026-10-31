'use client';

import type { Product } from '@jaypos/shared';
import { getAvailableStock, isOutOfStock, stockStatus, naira } from '@jaypos/shared';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/apiClient';

/**
 * Product tile for the POS grid (handoff §4.3): 1:1 image (or an initial tile),
 * 2-line name, mono price, a shelf-location line and a stock pill. Out-of-stock
 * physical products are disabled (mirrors mobile); services are always sellable.
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

  const threshold = Number(product.inventory?.low_stock_threshold ?? 10) || 10;
  const status = isService ? 'IN_STOCK' : stockStatus(product, threshold);
  const available = getAvailableStock(product);

  // Static uploads live at the server root, not under /v1.
  const rootUrl = API_BASE_URL.replace(/\/v1\/?$/, '');
  const fullImageUrl = product.image_url ? `${rootUrl}${product.image_url}` : null;

  return (
    <button
      type="button"
      disabled={out}
      onClick={() => onSelect(product)}
      className={cn(
        'group flex flex-col overflow-hidden rounded-card border border-border bg-card text-left transition-all',
        out
          ? 'cursor-not-allowed opacity-55'
          : 'hover:border-primary-border hover:shadow-card-hover'
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {fullImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fullImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-mono text-3xl font-semibold text-text-faint">
            {product.name?.charAt(0).toUpperCase() ?? '?'}
          </span>
        )}
        {status !== 'IN_STOCK' && (
          <span
            className={cn(
              'absolute right-2 top-2 rounded-pill px-1.5 py-0.5 text-2xs font-semibold',
              status === 'OUT_OF_STOCK' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
            )}
          >
            {status === 'OUT_OF_STOCK' ? 'Out' : `${available} left`}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-sm font-semibold leading-tight text-ink-2">
          {product.name}
        </span>
        {product.location?.name && !isService && (
          <span className="flex items-center gap-1 text-[11.5px] text-text-muted">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{product.location.name}</span>
          </span>
        )}
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="font-mono text-md font-semibold text-ink">{naira(price)}</span>
          <span className="text-2xs text-text-faint">
            {isService ? 'Service' : out ? '' : `${available} in stock`}
          </span>
        </div>
      </div>
    </button>
  );
}
