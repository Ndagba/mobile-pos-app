/**
 * Bar / Lounge order wire types + pure helpers (planning Phase 2).
 *
 * The server is the authority on prices and totals; `previewOrderTotals` mirrors
 * the server's `priceLines` (backend/src/services/BarOrderService.ts) so the
 * Attendant sees the same number before submitting. Both follow the house rule from
 * buildTransactionInput: line_total = price × qty (excl. tax), tax per line,
 * subtotal/tax rounded once on the sums, total = subtotal + tax.
 */

export type BarOrderStatus =
  | 'submitted'
  | 'accepted'
  | 'fulfilled'
  | 'reversal_requested'
  | 'cancelled'
  | 'rejected'
  | 'reversed';
export type BarPaymentMethod = 'cash' | 'transfer' | 'card' | 'split';

export const BAR_ORDER_STATUS_LABELS: Record<BarOrderStatus, string> = {
  submitted: 'Waiting',
  accepted: 'Being prepared',
  fulfilled: 'Released',
  reversal_requested: 'Reversal requested',
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
  reversal_request: { by: string | null; at: string; reason: string | null } | null;
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

// ─── Attendant ledger (Phase 3) ───────────────────────────────

export type LedgerEntryType = 'SALE' | 'SALE_REVERSAL' | 'REMITTANCE' | 'REMITTANCE_REVERSAL' | 'WRITE_OFF' | 'ADJUSTMENT';

export const LEDGER_ENTRY_LABELS: Record<LedgerEntryType, string> = {
  SALE: 'Drinks released',
  SALE_REVERSAL: 'Sale reversed',
  REMITTANCE: 'Handed over',
  REMITTANCE_REVERSAL: 'Hand-over corrected',
  WRITE_OFF: 'Written off',
  ADJUSTMENT: 'Adjustment',
};

export type RemittanceMethod = 'cash' | 'transfer' | 'card' | 'other';

export const REMITTANCE_METHOD_LABELS: Record<RemittanceMethod, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
  card: 'POS',
  other: 'Other',
};

export interface LedgerEntry {
  id: string;
  entry_type: LedgerEntryType;
  /** + increases what the Attendant owes. */
  amount: number;
  business_date: string;
  source_type: string;
  source_id: string;
  reverses_entry_id: string | null;
  reason: string | null;
  recorded_by_user_id: string;
  created_at: string;
}

export interface CashierRemittance {
  id: string;
  cashier: BarOrderPerson;
  received_by: BarOrderPerson;
  amount: number;
  method: RemittanceMethod;
  reference: string | null;
  narration: string | null;
  business_date: string;
  status: 'recorded' | 'reversed';
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
  outstanding_after?: number;
  replayed?: boolean;
}

/** One Attendant's reconciliation for a business date. */
export interface CashierSummary {
  business_date: string;
  today: string;
  cashier: { id: string; name: string | null; is_active: boolean; operational_profile: string | null };
  brought_forward: number;
  sales: number;
  remitted: number;
  written_off: number;
  adjustments: number;
  closing_balance: number;
  outstanding_now: number;
  pending_orders: number;
  completed_orders: number;
  /** How customers paid this Attendant (declared on orders). */
  payment_mix: Partial<Record<'cash' | 'transfer' | 'card', number>>;
  /** What the Bar Controller actually received from them. */
  remittance_mix: Partial<Record<RemittanceMethod, number>>;
}

export interface BarDashboardRow {
  cashier_id: string;
  name: string | null;
  is_active: boolean;
  operational_profile: string | null;
  brought_forward: number;
  sales: number;
  remitted: number;
  written_off: number;
  adjustments: number;
  closing_balance: number;
  outstanding_now: number;
  pending_orders: number;
  completed_orders: number;
  reversal_requests: number;
}

export interface BarDashboard {
  business_date: string;
  today: string;
  totals: Omit<BarDashboardRow, 'cashier_id' | 'name' | 'is_active' | 'operational_profile' | 'adjustments'> & {
    inactive_with_balance: number;
  };
  attendants: BarDashboardRow[];
  payment_mix: Partial<Record<'cash' | 'transfer' | 'card', number>>;
  remittance_mix: Partial<Record<RemittanceMethod, number>>;
}

/** Positive balance = the Attendant owes; negative = the house owes them (credit). */
export function describeBalance(amount: number): 'owes' | 'settled' | 'credit' {
  if (amount > 0.009) return 'owes';
  if (amount < -0.009) return 'credit';
  return 'settled';
}
