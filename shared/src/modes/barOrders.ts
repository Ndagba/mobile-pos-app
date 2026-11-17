/**
 * Bar / Lounge order wire types + pure helpers (planning Phase 2).
 *
 * The server is the authority on prices and totals; `previewOrderTotals` mirrors
 * the server's `priceLines` (backend/src/services/BarOrderService.ts) so the
 * Attendant sees the same number before submitting. Both follow the house rule from
 * buildTransactionInput: line_total = price × qty (excl. tax), tax per line,
 * subtotal/tax rounded once on the sums, total = subtotal + tax.
 */

export type BarOrderStatus = 'submitted' | 'accepted' | 'fulfilled' | 'cancelled' | 'rejected' | 'reversed';
export type BarPaymentMethod = 'cash' | 'transfer' | 'card' | 'split';

export const BAR_ORDER_STATUS_LABELS: Record<BarOrderStatus, string> = {
  submitted: 'Waiting',
  accepted: 'Being prepared',
  fulfilled: 'Released',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  reversed: 'Reversed',
};

/** Customer-facing wording: "POS" is how Nigerian bars say card terminal. */
export const BAR_PAYMENT_METHOD_LABELS: Record<BarPaymentMethod, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
  card: 'POS',
  split: 'Split',
};

export const BAR_OPEN_STATUSES: readonly BarOrderStatus[] = ['submitted', 'accepted'];

export interface BarOrderLine {
  id: string;
  product_id: string;
  product_name: string | null;
  quantity_requested: number;
  quantity_fulfilled: number | null;
  unit_price: number;
  tax_rate: number;
  line_total: number;
}

export interface BarOrderPerson {
  id: string;
  name: string | null;
}

export interface BarOrder {
  id: string;
  order_number: string;
  status: BarOrderStatus;
  store_id: string;
  branch_id: string;
  table_label: string | null;
  notes: string | null;
  initiated_by: BarOrderPerson;
  accepted_by: BarOrderPerson | null;
  fulfilled_by: BarOrderPerson | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  fulfilled_total: number | null;
  customer_payment_method: BarPaymentMethod | null;
  customer_payment_splits: { cash: number; card: number; transfer: number } | null;
  customer_payment_ref: string | null;
  business_date: string | null;
  submitted_at: string;
  accepted_at: string | null;
  fulfilled_at: string | null;
  closed_reason: string | null;
  closed_at: string | null;
  transaction: { id: string; receipt_number: string | null; status: string } | null;
  items: BarOrderLine[];
  /** Present on submit responses only. */
  stock_warnings?: { product_id: string; product_name: string; requested: number; available: number }[];
  replayed?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function previewOrderTotals(lines: { unit_price: number; tax_rate?: number | null; quantity: number }[]) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const gross = l.unit_price * l.quantity;
    subtotal += gross;
    tax += (gross * (l.tax_rate ?? 0)) / 100;
  }
  const sub = round2(subtotal);
  const t = round2(tax);
  return { subtotal: sub, tax_amount: t, total_amount: round2(sub + t) };
}

/** The amount the sale was actually booked at (released total once fulfilled). */
export function barOrderAmount(order: Pick<BarOrder, 'fulfilled_total' | 'total_amount'>): number {
  return order.fulfilled_total ?? order.total_amount;
}

/** A device-unique idempotency key for submitting an order. */
export function newBarOrderClientRef(deviceId: string, now: number = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${(deviceId || 'device').slice(0, 40)}-${now}-${rand}`;
}
