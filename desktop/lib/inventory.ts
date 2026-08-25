import type { Product } from '@jaypos/shared';
import { tracksInventory, getAvailableStock, stockStatus, type StockStatus } from '@jaypos/shared';
import { numify } from '@/lib/normalize';

/**
 * Catalog stock-badge logic, kept out of the presentation layer.
 *
 * This is the single place the inventory UI derives a product's stock state from,
 * reusing the shared helpers so desktop and mobile classify stock identically
 * (see `stockStatus`). The colour/label mapping lives in the `StockBadge`
 * component — this file only computes the facts.
 */

/** Mobile parity: `low_stock_threshold ?? 10`. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/** The effective low-stock threshold for a product, defaulting to 10. */
export function lowStockThreshold(product: Product): number {
  return numify(product.inventory?.low_stock_threshold) ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

export interface StockBadgeInfo {
  /** True for a SERVICE — render a neutral "Service" pill, not a stock badge. */
  isService: boolean;
  status: StockStatus;
  quantity: number;
  threshold: number;
}

/** Everything the `StockBadge` needs to render a product's stock state. */
export function stockBadgeInfo(product: Product): StockBadgeInfo {
  const threshold = lowStockThreshold(product);
  return {
    isService: !tracksInventory(product),
    status: stockStatus(product, threshold),
    quantity: getAvailableStock(product),
    threshold,
  };
}
