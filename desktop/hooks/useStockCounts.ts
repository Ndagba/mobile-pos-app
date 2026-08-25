'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Stock-count wire shapes from `GET /v1/stock-counts` (list) and
 * `GET /v1/stock-counts/:id` (detail). View-only, so — like the Phase-2
 * `TransactionRow` — they live here rather than in `@jaypos/shared`.
 *
 * The backend already casts item quantities to numbers (`system_quantity`,
 * `physical_quantity`, `variance`); the header carries no counts. Stock counts are
 * an online-only admin surface (no Dexie cache): the queries simply error while
 * offline and refetch on reconnect (`online` is in the key).
 */
export interface StockCountRow {
  id: string;
  store_id: string;
  branch_id: string;
  status: string; // 'in_progress' | 'completed'
  notes?: string | null;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
  started_by?: { first_name?: string; last_name?: string } | null;
  completed_by?: { first_name?: string; last_name?: string } | null;
  branch?: { name?: string } | null;
}

export interface StockCountItemRow {
  id: string;
  product_id: string;
  system_quantity: number;
  physical_quantity: number | null;
  variance: number | null;
  notes?: string | null;
  product?: {
    name?: string;
    sku?: string | null;
    barcode?: string | null;
    category?: { name?: string } | null;
  } | null;
}

export interface StockCountDetail extends StockCountRow {
  items: StockCountItemRow[];
}

export interface UseStockCountsOptions {
  /** Admin/manager branch filter, honoured server-side by getAuthorizedBranchIds. */
  branchId?: string;
}

/** List of stock counts for the authorized branches (optionally narrowed). */
export function useStockCounts(opts: UseStockCountsOptions = {}) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['stock-counts', opts.branchId ?? '', online],
    queryFn: () => {
      const qs = opts.branchId ? `?branch_id=${encodeURIComponent(opts.branchId)}` : '';
      return apiClient.get<StockCountRow[]>(`/stock-counts${qs}`).then((r) => r ?? []);
    },
  });
}

/** One stock count with its line items. Disabled until an id is supplied. */
export function useStockCount(id?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['stock-count', id ?? '', online],
    queryFn: () => apiClient.get<StockCountDetail>(`/stock-counts/${id}`),
    enabled: !!id,
  });
}
