export { generateId } from './id';
export { naira, alpha } from './format';
export { calculateCartTotals } from './cart';
export { cashierDiscountRule, clampDiscount } from './discount';
export type { DiscountRule, DiscountRuleSettings, DiscountRuleUser } from './discount';
export {
  tracksInventory,
  getAvailableStock,
  isOutOfStock,
  canAddToCart,
  canIncrementQuantity,
  stockStatus
} from './inventory';
export type { StockTrackable, StockStatus } from './inventory';
export {
  safeDiv,
  pctChange,
  derivePL,
  buildInsights,
  ymd,
  plPresetRange,
  plRangeDays,
  plPreviousRange,
  dayBoundsIso
} from './pl';
export type { PLData, PLDerived, Insight, InsightTag, InsightInputs, PLPreset } from './pl';
