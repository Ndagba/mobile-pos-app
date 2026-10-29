'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { numOr0, numify } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Purchase-order wire shapes (Phase 4B). Like the Phase-4A supplier types, these
 * are NOT in `@jaypos/shared` — procurement math lives server-side only, so the
 * view-only shapes live in the hooks that read them.
 *
 * Procurement is an online-only admin surface (no Dexie): the queries error while
 * offline and refetch on reconnect (`online` is in every key). The backend
 * serialises Decimal columns as JSON strings, so money/quantity fields are
 * coerced to numbers here at the edge (mirrors `normalize.ts` / mobile's
 * `parseFloat` reads).
 */
export type POStatus = 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

/** A PO line as returned by the list endpoint (roll-up quantities only). */
export interface POListLine {
  id: string;
  quantity_ordered: number;
  quantity_received: number;
}

/** One row of `GET /purchase-orders` (header + supplier stub + line roll-ups). */
export interface POListItem {
  id: string;
  store_id: string;
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
  items: POListLine[];
}

/** A fully-detailed PO line (`GET /purchase-orders/:id`), with server-derived outstanding. */
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
  goods_receipt_id: string;
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

export interface PurchaseOrderDetail {
  id: string;
  store_id: string;
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
  updated_at?: string;
  supplier?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  items: POItem[];
  receipts: GoodsReceipt[];
}

/** Human labels for the five string statuses. */
export const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled',
};

function normalizeListItem(raw: Record<string, unknown>): POListItem {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  return {
    ...(raw as unknown as POListItem),
    subtotal: numOr0(raw.subtotal),
    tax_amount: numOr0(raw.tax_amount),
    total_amount: numOr0(raw.total_amount),
    status: ((raw.status as POStatus) ?? 'draft'),
    items: items.map((it) => ({
      id: String(it.id),
      quantity_ordered: numOr0(it.quantity_ordered),
      quantity_received: numOr0(it.quantity_received),
    })),
  };
}

/** Coerce a detail PO's Decimal columns (header, lines, receipts) to numbers. */
export function normalizePurchaseOrder(raw: Record<string, unknown>): PurchaseOrderDetail {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  const receipts = Array.isArray(raw.receipts) ? (raw.receipts as Record<string, unknown>[]) : [];
  return {
    ...(raw as unknown as PurchaseOrderDetail),
    subtotal: numOr0(raw.subtotal),
    tax_amount: numOr0(raw.tax_amount),
    total_amount: numOr0(raw.total_amount),
    status: ((raw.status as POStatus) ?? 'draft'),
    items: items.map((it) => {
      const ordered = numOr0(it.quantity_ordered);
      const received = numOr0(it.quantity_received);
      return {
        ...(it as unknown as POItem),
        quantity_ordered: ordered,
        quantity_received: received,
        quantity_outstanding: numify(it.quantity_outstanding) ?? Math.max(0, ordered - received),
        unit_cost: numOr0(it.unit_cost),
        line_total: numOr0(it.line_total),
      };
    }),
    receipts: receipts.map(normalizeReceipt),
  };
}

export function normalizeReceipt(raw: Record<string, unknown>): GoodsReceipt {
  const items = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
  return {
    ...(raw as unknown as GoodsReceipt),
    items: items.map((it) => ({
      ...(it as unknown as GoodsReceiptLine),
      quantity_received: numOr0(it.quantity_received),
      unit_cost: numOr0(it.unit_cost),
    })),
  };
}

export interface UsePurchaseOrdersOptions {
  status?: POStatus | 'all';
  supplierId?: string;
  branchId?: string;
}

/**
 * Purchase orders for the authorized branches. Server-scoped by JWT branch set;
 * an admin may narrow to one `branch_id`. `status`/`supplier_id` are pushed to
 * the server; the list page searches PO numbers client-side over the result.
 */
export function usePurchaseOrders(opts: UsePurchaseOrdersOptions = {}) {
  const online = useNetworkStatus();
  const status = opts.status && opts.status !== 'all' ? opts.status : undefined;
  return useQuery({
    queryKey: ['purchase-orders', status ?? '', opts.supplierId ?? '', opts.branchId ?? '', online],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (opts.supplierId) params.set('supplier_id', opts.supplierId);
      if (opts.branchId) params.set('branch_id', opts.branchId);
      params.set('limit', '200');
      return apiClient
        .get<Record<string, unknown>[]>(`/purchase-orders?${params.toString()}`)
        .then((rows) => (rows ?? []).map(normalizeListItem));
    },
  });
}
