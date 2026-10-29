'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import {
  normalizePurchaseOrder,
  normalizeReceipt,
  type PurchaseOrderDetail,
  type GoodsReceipt,
} from './usePurchaseOrders';

/** A line on a draft PO (create or replace-during-draft-edit). */
export interface POWriteLine {
  product_id: string;
  quantity_ordered: number;
  unit_cost: number;
  notes?: string | null;
}

export interface POCreateInput {
  branch_id: string;
  supplier_id: string;
  po_number?: string | null;
  expected_date?: string | null;
  notes?: string | null;
  items: POWriteLine[];
}

/** PATCH body — either a status transition OR field/line edits (mutually exclusive server-side). */
export interface POUpdateInput {
  status?: 'ordered' | 'cancelled';
  notes?: string | null;
  expected_date?: string | null;
  items?: POWriteLine[];
}

export interface ReceiveLineInput {
  purchase_order_item_id: string;
  quantity_received: number;
  unit_cost?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface ReceiveGoodsInput {
  received_date?: string | null;
  reference?: string | null;
  /** Optional idempotency key so a double-submit returns the first receipt (no double stock). */
  receipt_hash?: string | null;
  /** Opt-in: spawn an unpaid AP invoice for this receipt, linked to the PO. */
  create_invoice?: boolean;
  notes?: string | null;
  items: ReceiveLineInput[];
}

/**
 * Purchase-order create / update / delete / receive (`/v1/purchase-orders*`,
 * admin + manager — the backend gates every write). Mirrors the Phase-4A supplier
 * mutation hooks: a write invalidates the list and (where relevant) the single-PO
 * cache.
 *
 * Receiving is special — it increments stock and writes a `purchase`
 * `InventoryMovement` per line — so it also invalidates the inventory caches
 * (`products`, `low-stock`, per-product `movements`) so the new stock and ledger
 * rows show up immediately, and `suppliers-summary` in case an AP invoice was
 * opted in.
 */
export function usePurchaseOrderMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  const invalidateOne = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    queryClient.invalidateQueries({ queryKey: ['purchase-order-receipts', id] });
  };

  const create = useMutation({
    mutationFn: (input: POCreateInput) =>
      apiClient
        .post<Record<string, unknown>>('/purchase-orders', input)
        .then(normalizePurchaseOrder),
    onSuccess: invalidateList,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: POUpdateInput }) =>
      apiClient
        .patch<Record<string, unknown>>(`/purchase-orders/${id}`, data)
        .then(normalizePurchaseOrder),
    onSuccess: (_res, { id }) => {
      invalidateList();
      invalidateOne(id);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/purchase-orders/${id}`),
    onSuccess: invalidateList,
  });

  const receive = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReceiveGoodsInput }) =>
      apiClient
        .post<Record<string, unknown>>(`/purchase-orders/${id}/receipts`, data)
        .then(normalizeReceipt),
    onSuccess: (_res, { id }) => {
      invalidateList();
      invalidateOne(id);
      // Stock moved: refresh the inventory catalog, low-stock, and every product ledger.
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      // An opt-in AP invoice shifts the store-wide payable.
      queryClient.invalidateQueries({ queryKey: ['suppliers-summary'] });
    },
  });

  return { create, update, remove, receive };
}

export type { PurchaseOrderDetail, GoodsReceipt };
