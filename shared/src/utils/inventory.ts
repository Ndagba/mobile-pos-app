/**
 * Inventory / stock-tracking capability helpers.
 *
 * Ported verbatim from mobile/src/utils/inventory.ts. Single source of truth for
 * whether an item participates in inventory: `item_type`. A PRODUCT tracks
 * physical stock; a SERVICE does not. Legacy items cached before the split have
 * no `item_type` and are treated as physical products.
 */

export type ItemType = 'PRODUCT' | 'SERVICE';

/** Minimal structural shape shared by the various local Product/CartItem types. */
export interface StockTrackable {
  item_type?: ItemType | string | null;
  inventory?: { quantity_on_hand?: number | string | null } | null;
}

/**
 * Whether an item tracks physical stock. Services never do; anything else
 * (PRODUCT, or a legacy item with no item_type) does.
 */
export function tracksInventory(item?: StockTrackable | null): boolean {
  return item?.item_type !== 'SERVICE';
}

/**
 * Raw on-hand quantity as a number (0 when there is no inventory row). This is a
 * pure accessor — callers should gate on `tracksInventory` before treating a low
 * value as "out of stock", since a service legitimately has no inventory row.
 */
export function getAvailableStock(item?: StockTrackable | null): number {
  return Number(item?.inventory?.quantity_on_hand ?? 0);
}

/**
 * True only for a stock-tracked item with no units left. A service is never
 * "out of stock" — it simply does not track stock.
 */
export function isOutOfStock(item?: StockTrackable | null): boolean {
  return tracksInventory(item) && getAvailableStock(item) <= 0;
}

/**
 * Whether `item` can be added to the cart given how many are already in it.
 * Services are always addable; products require available stock not yet claimed.
 */
export function canAddToCart(item?: StockTrackable | null, quantityInCart = 0): boolean {
  if (!tracksInventory(item)) return true;
  return getAvailableStock(item) - quantityInCart > 0;
}

/**
 * Whether the cart quantity for `item` can be incremented by one. Services have
 * no stock ceiling; products are capped at their available stock.
 */
export function canIncrementQuantity(item?: StockTrackable | null, currentQuantity = 0): boolean {
  if (!tracksInventory(item)) return true;
  return currentQuantity < getAvailableStock(item);
}

/** Coarse stock health for a stock-tracked item. */
export type StockStatus = 'OUT_OF_STOCK' | 'LOW' | 'IN_STOCK';

/**
 * Classify a stock-tracked item's on-hand level, mirroring mobile's product-card
 * badge logic (InventoryScreen.renderProductCard): `≤ 0` → out of stock,
 * `> 0 && ≤ threshold` → low, otherwise in stock. `threshold` defaults to 10 to
 * match mobile's `low_stock_threshold ?? 10`.
 *
 * Callers should gate on `tracksInventory` first — a SERVICE has no stock and
 * should be shown as a service, not given a status.
 */
export function stockStatus(item?: StockTrackable | null, threshold = 10): StockStatus {
  const qty = getAvailableStock(item);
  if (qty <= 0) return 'OUT_OF_STOCK';
  if (qty <= threshold) return 'LOW';
  return 'IN_STOCK';
}
