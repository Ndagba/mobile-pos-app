/**
 * Purchase-order wire shapes + pure helpers (mobile mirror of the desktop
 * `usePurchaseOrders` hooks). PO totals are SERVER-computed — nothing here is
 * sent back as an authoritative amount; the client-side sums below are previews
 * only. The backend serialises Decimal columns as JSON strings, so every money /
 * quantity field is coerced to a number at the edge.
 */
export type POStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface POListItem {
  id: string;
  branch_id: string;
  supplier_id: string;
  po_number: string;
  status: POStatus;
  order_date?: string | null;
  expected_date?: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string | null;
  created_at?: string;
  supplier?: { id: string; name: string } | null;
  items: Array<{ id: string; quantity_ordered: number; quantity_received: number }>;
}

export interface POItem {
  id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_received: number;
  /** Server-derived: max(0, ordered − received). */
  quantity_outstanding: number;
  unit_cost: number;
  line_total: number;
  notes?: string | null;
  product?: { id: string; name: string; sku?: string | null; unit?: string | null } | null;
}

export interface GoodsReceiptLine {
  id: string;
  purchase_order_item_id: string;
  product_id: string;
  quantity_received: number;
  unit_cost: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface GoodsReceipt {
  id: string;
  purchase_order_id: string;
  received_date: string;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
  items: GoodsReceiptLine[];
}

export interface PurchaseOrderDetail extends Omit<POListItem, 'items' | 'supplier'> {
  supplier?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  items: POItem[];
  receipts: GoodsReceipt[];
}

export interface POWriteLine {
  product_id: string;
  quantity_ordered: number;
  unit_cost: number;
}

export interface ReceiveLineInput {
  purchase_order_item_id: string;
  quantity_received: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Part received',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** Coerce a Decimal-as-string (or anything) to a finite number, else 0. */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeListItem(raw: any): POListItem {
  return {
    ...raw,
    status: (raw?.status ?? 'draft') as POStatus,
    subtotal: num(raw?.subtotal),
    tax_amount: num(raw?.tax_amount),
    total_amount: num(raw?.total_amount),
    items: (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
      id: String(it.id),
      quantity_ordered: num(it.quantity_ordered),
      quantity_received: num(it.quantity_received),
    })),
  };
}

export function normalizeReceipt(raw: any): GoodsReceipt {
  return {
    ...raw,
    items: (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
      ...it,
      quantity_received: num(it.quantity_received),
      unit_cost: num(it.unit_cost),
    })),
  };
}

export function normalizePurchaseOrder(raw: any): PurchaseOrderDetail {
  return {
    ...raw,
    status: (raw?.status ?? 'draft') as POStatus,
    subtotal: num(raw?.subtotal),
    tax_amount: num(raw?.tax_amount),
    total_amount: num(raw?.total_amount),
    items: (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => {
      const ordered = num(it.quantity_ordered);
      const received = num(it.quantity_received);
      return {
        ...it,
        quantity_ordered: ordered,
        quantity_received: received,
        quantity_outstanding:
          it.quantity_outstanding !== undefined && it.quantity_outstanding !== null
            ? num(it.quantity_outstanding)
            : Math.max(0, ordered - received),
        unit_cost: num(it.unit_cost),
        line_total: num(it.line_total),
      };
    }),
    receipts: (Array.isArray(raw?.receipts) ? raw.receipts : []).map(normalizeReceipt),
  };
}

/** Received / ordered roll-up across a PO's lines, as a 0–1 fraction (capped). */
export function receivedFraction(
  items: Array<{ quantity_ordered: number; quantity_received: number }>
): number {
  const ordered = items.reduce((s, i) => s + i.quantity_ordered, 0);
  if (ordered <= 0) return 0;
  const received = items.reduce((s, i) => s + Math.min(i.quantity_received, i.quantity_ordered), 0);
  return Math.min(1, received / ordered);
}

/** Strict YYYY-MM-DD check that also rejects impossible dates (2026-02-31). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface ReceiveDraftLine {
  qty: string;
  batch: string;
  expiry: string;
}

export type ReceiveBuildResult =
  | { ok: true; items: ReceiveLineInput[]; total: number; overReceipt: boolean }
  | { ok: false; error: string };

/**
 * Validate the "receiving now" sheet and build the request lines. Blank / zero
 * lines are skipped (partial receipt); a quantity above the outstanding amount is
 * ALLOWED and flagged via `overReceipt`. Same rules as the desktop modal.
 */
export function buildReceiveLines(
  poItems: POItem[],
  drafts: Record<string, ReceiveDraftLine | undefined>
): ReceiveBuildResult {
  const items: ReceiveLineInput[] = [];
  let total = 0;
  let overReceipt = false;
  for (const it of poItems) {
    const d = drafts[it.id];
    if (!d) continue;
    const name = it.product?.name ?? 'line';
    const raw = d.qty.trim();
    if (raw === '') continue;
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < 0) {
      return { ok: false, error: `Enter a valid quantity for "${name}".` };
    }
    if (qty === 0) continue;
    const batch = d.batch.trim();
    const expiry = d.expiry.trim();
    if (expiry && !isIsoDate(expiry)) {
      return { ok: false, error: `Expiry for "${name}" must be a date like 2027-01-31.` };
    }
    if (batch && !expiry) {
      return { ok: false, error: `Set an expiry date for batch "${batch}" on "${name}".` };
    }
    if (qty > it.quantity_outstanding) overReceipt = true;
    total += qty * it.unit_cost;
    items.push({
      purchase_order_item_id: it.id,
      quantity_received: qty,
      batch_number: batch || null,
      expiry_date: expiry || null,
    });
  }
  if (items.length === 0) {
    return { ok: false, error: 'Enter a received quantity on at least one line.' };
  }
  return { ok: true, items, total, overReceipt };
}

/* ───────────────────────── Suggested reorders ───────────────────────── */

/** A low-stock alert row from `GET /inventory/low-stock`. */
export interface LowStockItem {
  product_id: string;
  product_name: string;
  sku?: string | null;
  current_quantity: number;
  low_stock_threshold: number;
  reorder_point?: number | null;
}

export function normalizeLowStock(raw: any): LowStockItem {
  return {
    product_id: String(raw?.product_id),
    product_name: String(raw?.product_name ?? ''),
    sku: raw?.sku ?? null,
    current_quantity: num(raw?.current_quantity),
    low_stock_threshold: num(raw?.low_stock_threshold),
    reorder_point: raw?.reorder_point === null || raw?.reorder_point === undefined ? null : num(raw.reorder_point),
  };
}

/** The reorder baseline: the product's reorder point, else its low-stock threshold (same as desktop). */
export function reorderBase(it: LowStockItem): number {
  return it.reorder_point && it.reorder_point > 0 ? it.reorder_point : it.low_stock_threshold;
}

/** Suggested order quantity: enough to reach twice the reorder baseline, at least 1 (same as desktop). */
export function suggestedQty(it: LowStockItem): number {
  return Math.max(1, Math.round(reorderBase(it) * 2 - it.current_quantity));
}

/* ───────────────────────── Share a PO as text ───────────────────────── */

const shareMoney = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const shareQty = (n: number) => String(Math.round(n * 10000) / 10000);
const shareDate = (s?: string | null) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
};

/**
 * Plain-text purchase order for RN `Share` (the mobile stand-in for the desktop
 * "Print purchase order"). Totals are the server-computed ones on the PO.
 */
export function purchaseOrderShareText(po: PurchaseOrderDetail, headerLines: string[] = []): string {
  const lines = [
    ...headerLines,
    '===== PURCHASE ORDER =====',
    `PO number: ${po.po_number}`,
    `Status:    ${PO_STATUS_LABEL[po.status] ?? po.status}`,
    `Supplier:  ${po.supplier?.name ?? '—'}`,
    po.supplier?.phone ? `Phone:     ${po.supplier.phone}` : '',
    `Ordered:   ${shareDate(po.order_date)}`,
    `Expected:  ${shareDate(po.expected_date)}`,
    '--------------------------------',
    ...po.items.map(it => {
      const sku = it.product?.sku ? ` (${it.product.sku})` : '';
      const unit = it.product?.unit ? ` ${it.product.unit}` : '';
      return `${it.product?.name ?? 'Product'}${sku}\n  ${shareQty(it.quantity_ordered)}${unit} x ${shareMoney(it.unit_cost)} = ${shareMoney(it.line_total)}`;
    }),
    '--------------------------------',
    `Subtotal:  ${shareMoney(po.subtotal)}`,
    `Tax:       ${shareMoney(po.tax_amount)}`,
    `TOTAL:     ${shareMoney(po.total_amount)}`,
    po.notes ? `Notes: ${po.notes}` : '',
    '================================',
  ];
  return lines.filter(Boolean).join('\n');
}
