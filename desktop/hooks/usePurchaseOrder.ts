'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useNetworkStatus } from '@/lib/useNetwork';
import {
  normalizePurchaseOrder,
  normalizeReceipt,
  type PurchaseOrderDetail,
  type GoodsReceipt,
} from './usePurchaseOrders';

/**
 * One purchase order: header + lines (with server-derived `quantity_outstanding`)
 * + embedded receipts. Decimal columns are normalised to numbers. Online-only,
 * disabled until an id is supplied — mirrors `useSupplier`.
 */
export function usePurchaseOrder(id?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['purchase-order', id ?? '', online],
    queryFn: () =>
      apiClient
        .get<Record<string, unknown>>(`/purchase-orders/${id}`)
        .then((raw) => normalizePurchaseOrder(raw)),
    enabled: !!id,
  });
}

/**
 * Standalone receipt history for a PO. The detail endpoint already embeds
 * `receipts`, so this is only needed where the history is fetched independently;
 * kept for parity with the design's `GET /:id/receipts`.
 */
export function usePurchaseOrderReceipts(id?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['purchase-order-receipts', id ?? '', online],
    queryFn: () =>
      apiClient
        .get<Record<string, unknown>[]>(`/purchase-orders/${id}/receipts`)
        .then((rows) => (rows ?? []).map(normalizeReceipt)),
    enabled: !!id,
  });
}

export type { PurchaseOrderDetail, GoodsReceipt };
