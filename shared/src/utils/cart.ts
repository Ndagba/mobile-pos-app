import type { CartItem, CartTotals } from '../types';

/**
 * Pure cart-total calculation, extracted byte-for-byte from mobile's
 * `cartSlice.recalculateTotals` (mobile/src/redux/slices/cartSlice.ts).
 *
 * The backend trusts client-computed totals, so desktop MUST compute them with
 * the exact same arithmetic mobile uses or the two clients would disagree:
 *   subtotal    = Σ unit_price · quantity
 *   tax_amount  = Σ (unit_price · quantity · tax_rate) / 100   // tax_rate ?? 0
 *   total       = subtotal + tax_amount − discount_amount
 *
 * Note tax_rate is a percentage (e.g. 7.5), hence the divide-by-100 — matching
 * mobile. Discount is a flat store-level amount applied after tax.
 */
export function calculateCartTotals(items: CartItem[], discountAmount = 0): CartTotals {
  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const tax_amount = items.reduce((sum, item) => {
    const taxRate = item.tax_rate ?? 0;
    return sum + (item.unit_price * item.quantity * taxRate) / 100;
  }, 0);
  const total = subtotal + tax_amount - discountAmount;
  return { subtotal, tax_amount, discount_amount: discountAmount, total };
}
