import type { CartItem, PaymentMethod, TransactionInput, TransactionItem } from '../../types';
import { calculateCartTotals } from '../../utils/cart';

/**
 * A transaction ready to be finalized — everything the backend persists EXCEPT
 * the idempotency hash, which `createTransaction` derives from
 * (deviceId, transactionId, timestamp).
 */
export type TransactionDraft = Omit<TransactionInput, 'offline_session_hash'>;

/** The non-cart context needed to turn cart lines into a transaction draft. */
export interface BuildTransactionContext {
  store_id: string;
  branch_id: string;
  customer_id?: string;
  /** Flat store-level discount applied after tax. Defaults to 0. */
  discount_amount?: number;
  payment_method: PaymentMethod | string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Turn cart items into a transaction draft, computing every monetary field the
 * backend will store verbatim (it does not recompute or cross-check them).
 *
 * Mirrors mobile's `CheckoutScreen.handleCharge` byte-for-byte:
 *   - per line:  tax_amount = round2(unit_price · qty · tax_rate / 100)
 *                line_total = unit_price · qty
 *   - totals:    round2 of calculateCartTotals(items, discount)
 *
 * Rounding happens ONLY here — cart totals stay unrounded (see utils/cart.ts) —
 * so desktop and mobile produce identical numbers for the same cart.
 */
export function buildTransactionInput(
  items: CartItem[],
  ctx: BuildTransactionContext
): TransactionDraft {
  const discount_amount = ctx.discount_amount ?? 0;
  const totals = calculateCartTotals(items, discount_amount);

  const txItems: TransactionItem[] = items.map((it) => {
    const rate = it.tax_rate ?? 0;
    return {
      product_id: it.product_id,
      product_name: it.product_name,
      quantity: it.quantity,
      unit_price: Number(it.unit_price) || 0,
      tax_amount: round2((it.unit_price * it.quantity * rate) / 100),
      line_total: Number(it.unit_price) * it.quantity || 0,
    };
  });

  return {
    store_id: ctx.store_id,
    branch_id: ctx.branch_id,
    customer_id: ctx.customer_id || undefined,
    subtotal: round2(totals.subtotal),
    tax_amount: round2(totals.tax_amount),
    discount_amount: round2(totals.discount_amount),
    total_amount: round2(totals.total),
    payment_method: ctx.payment_method,
    items: txItems,
  };
}
