'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StockCountRow } from '@/hooks/useStockCounts';

/**
 * Stock-count writes against `/v1/stock-counts*`.
 *
 * - **create** `POST /stock-counts {notes?, branch_id?}` — the backend pre-populates
 *   one line per active PRODUCT in the branch. An admin MUST supply `branch_id`
 *   (getAuthorizedBranchId returns null otherwise → 400); a manager defaults to home.
 * - **saveItems** `PATCH /stock-counts/:id/items {items:[{product_id, physical_quantity, notes?}]}`
 *   — upsert; the server recomputes each variance. SERVICE lines → 400.
 * - **accept** `POST /stock-counts/:id/accept` — sets on-hand = physical for every
 *   non-zero variance and writes an `adjustment` InventoryMovement per line (the only
 *   non-sale ledger writer), then marks the count completed. Already-completed → 400.
 *
 * Accepting mutates stock, low-stock and the movement ledger, so it invalidates all
 * of those alongside the count queries.
 */
export interface SaveItemInput {
  product_id: string;
  physical_quantity: number | null;
  notes?: string;
}

export function useStockCountMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (input: { notes?: string; branch_id?: string }) =>
      apiClient.post<StockCountRow>('/stock-counts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-counts'] }),
  });

  const saveItems = useMutation({
    mutationFn: ({ id, items }: { id: string; items: SaveItemInput[] }) =>
      apiClient.patch(`/stock-counts/${id}/items`, { items }),
    onSuccess: (_data, { id }) =>
      queryClient.invalidateQueries({ queryKey: ['stock-count', id] }),
  });

  const accept = useMutation({
    mutationFn: (id: string) => apiClient.post<StockCountRow>(`/stock-counts/${id}/accept`, {}),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['stock-count', id] });
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
    },
  });

  return { create, saveItems, accept };
}
