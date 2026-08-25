export { generateId } from './id';
export { naira, alpha } from './format';
export { calculateCartTotals } from './cart';
export {
  tracksInventory,
  getAvailableStock,
  isOutOfStock,
  canAddToCart,
  canIncrementQuantity,
  stockStatus
} from './inventory';
export type { StockTrackable, StockStatus } from './inventory';
