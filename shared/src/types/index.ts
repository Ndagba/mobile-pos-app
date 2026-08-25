/**
 * Shared snake_case domain types.
 *
 * These mirror the backend's wire contract (Prisma models / API envelope) and
 * the mobile app's local shapes exactly — snake_case, not camelCase — so the
 * same objects flow through mobile, desktop, and the sync payload unchanged.
 * Do not "clean these up" to camelCase; the byte-for-byte shape is the contract.
 */

/** A stock item is either a physical PRODUCT or a non-inventory SERVICE. */
export type ItemType = 'PRODUCT' | 'SERVICE';

/** Payment methods accepted by the backend transaction routes. */
export type PaymentMethod = 'cash' | 'card' | 'mobile_wallet';

/** Standard backend success envelope: `{ status: 'success', data: T }`. */
export interface ApiEnvelope<T> {
  status: 'success';
  data: T;
}

/** A single line in the cart. Matches mobile's `CartItem` field-for-field. */
export interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount?: number;
  discount_amount?: number;
  item_type?: ItemType;
}

/** Derived monetary totals for a cart. */
export interface CartTotals {
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
}

/** Line item as sent in the transaction batch payload. */
export interface TransactionItem {
  product_id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  /** Per-line tax = round2(unit_price · quantity · tax_rate / 100). */
  tax_amount?: number;
  discount_amount?: number;
  /** Per-line total the backend persists verbatim = unit_price · quantity. */
  line_total?: number;
}

/**
 * Transaction payload for `POST /v1/transactions` and `/transactions/batch`.
 * `offline_session_hash` is the idempotency key the backend enforces `@unique`.
 */
export interface TransactionInput {
  store_id: string;
  branch_id: string;
  customer_id?: string;
  offline_session_hash: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod | string;
  items: TransactionItem[];
}

/** A transaction persisted locally while offline, awaiting sync. */
export interface OfflineTransaction extends TransactionInput {
  id: string;
  is_sync_online: boolean;
  created_at: string | Date;
}

/** One successful row in a `POST /v1/transactions/batch` response. */
export interface BatchSyncResultRow {
  offline_session_hash: string;
  transaction_id: string;
  status: string; // 'synced'
}

/** One failed row in a batch-sync response (note: field is `error`, not `message`). */
export interface BatchSyncErrorRow {
  offline_session_hash: string;
  error: string;
  status: string; // 'failed'
}

/** Batch-sync body after the `{ status, data }` envelope is unwrapped by the client. */
export interface BatchSyncResponse {
  results: BatchSyncResultRow[];
  errors: BatchSyncErrorRow[];
}

/**
 * Outcome of the client-side createTransaction orchestration.
 * - `completed`        — posted online and confirmed by the server (has receipt_number)
 * - `queued_for_sync`  — attempted online but not confirmed (network/optimistic), persisted unsynced
 * - `offline`          — created while offline, persisted unsynced
 */
export interface CreateTransactionResult {
  status: 'completed' | 'queued_for_sync' | 'offline';
  transaction_id: string;
  offline_session_hash: string;
  receipt_number?: string | null;
}

/** Product category (branch-scoped). `_count.products` = active products in it. */
export interface Category {
  id: string;
  name: string;
  description?: string | null;
  display_order?: number;
  is_active?: boolean;
  branch_id?: string | null;
  _count?: { products: number };
}

/**
 * Product shape shared across screens and the offline cache.
 *
 * The backend serialises money as Decimal *strings* — desktop normalises them to
 * numbers before constructing this. Use `effective_price` as the sell price
 * (mobile does); `unit_price` is a legacy alias kept for back-compat. `tax_rate`
 * is a percentage (e.g. 7.5). `cost_price` is the purchase cost (drives margin /
 * stock valuation). The `inventory` block only exists for PRODUCT items.
 */
export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  unit_price?: number;
  effective_price?: number;
  marked_price?: number;
  cost_price?: number;
  tax_rate?: number;
  item_type?: ItemType;
  category_id?: string | null;
  category?: Category | null;
  unit?: string | null;
  description?: string | null;
  image_url?: string | null;
  is_active?: boolean;
  branch_id?: string | null;
  inventory?: {
    quantity_on_hand?: number | string | null;
    quantity_reserved?: number | string | null;
    low_stock_threshold?: number | string | null;
    reorder_point?: number | string | null;
  } | null;
}

/**
 * Customer shape. Backend rows use `first_name`/`last_name`; `name` is an optional
 * convenience alias. `credit_limit === null` means unlimited credit. Outstanding
 * balance is derived: `total_spent − Σ payments.amount`.
 */
export interface Customer {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string | null;
  credit_limit?: number | null;
  total_spent?: number;
  transaction_count?: number;
  payments?: Array<{ amount: number | string }>;
}

/**
 * Authenticated user as returned by `POST /auth/login` (the `data.user` object).
 * Matches AuthService.login exactly — note `first_name` (not full_name) and that
 * `username` is a login credential, not part of the returned user.
 */
export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  role: 'admin' | 'manager' | 'cashier' | string;
  store_id: string;
  branch_id?: string | null;
  branch_name?: string | null;
  is_super_admin?: boolean;
}

/** Token pair returned by `/auth/login` and `/auth/refresh-token`. */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}
