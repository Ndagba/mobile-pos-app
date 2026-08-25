'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * A stock adjustment against `PATCH /v1/inventory/:productId`.
 *
 * `quantity` is a **signed delta** (may be negative) and requires a `reason`;
 * `low_stock_threshold` changes the per-product alert threshold. At least one of
 * the two must be present — both may be sent together. The backend rejects
 * SERVICE items (400) and any adjustment that would drive on-hand below zero
 * (400 "Insufficient stock for this operation"). Note it does **not** write the
 * movement ledger — only sales and stock-count reconciliation do.
 */
export interface AdjustStockInput {
  productId: string;
  /** Signed delta. Omit to change only the threshold. */
  quantity?: number;
  /** Required by the backend whenever `quantity` is sent. */
  reason?: string;
  low_stock_threshold?: number;
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, quantity, reason, low_stock_threshold }: AdjustStockInput) => {
      const body: Record<string, unknown> = {};
      if (quantity !== undefined) {
        body.quantity = quantity;
        body.reason = reason;
      }
      if (low_stock_threshold !== undefined) body.low_stock_threshold = low_stock_threshold;
      return apiClient.patch(`/inventory/${productId}`, body);
    },
    onSuccess: (_data, { productId }) => {
      // Prefix-match invalidation: refresh every products/low-stock query (any
      // branch/category/search variant) and this product's movement ledger.
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['movements', productId] });
    },
  });
}
