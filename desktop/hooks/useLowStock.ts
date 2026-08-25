'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';

/**
 * A low-stock alert row from `GET /v1/inventory/low-stock`. The backend already
 * casts the quantities to numbers and excludes SERVICE items, so no normalisation
 * is needed. `alert_level` is derived server-side: CRITICAL (≤0), URGENT
 * (≤ half the threshold), else WARNING.
 */
export interface LowStockItem {
  product_id: string;
  product_name: string;
  sku?: string | null;
  current_quantity: number;
  low_stock_threshold: number;
  reorder_point?: number;
  alert_level: 'CRITICAL' | 'URGENT' | 'WARNING' | string;
}

export interface UseLowStockOptions {
  /** Admin/manager branch filter. Omitted → all authorized branches (server-scoped). */
  branchId?: string;
}

async function fetchLowStock(branchId?: string): Promise<LowStockItem[]> {
  const cacheKey = `low_stock_${branchId ?? 'all'}`;
  if (network.isOnline()) {
    try {
      const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      const rows = await apiClient.get<LowStockItem[]>(`/inventory/low-stock${qs}`);
      await offlineStore.setApiCache(cacheKey, rows ?? []);
      return rows ?? [];
    } catch {
      /* fall through to the offline cache */
    }
  }
  return (await offlineStore.getApiCache<LowStockItem[]>(cacheKey)) ?? [];
}

/**
 * Low-stock alerts for the current user's authorized branches (optionally narrowed
 * to one via `branchId`, honoured server-side by `getAuthorizedBranchIds`).
 * Network-first with an SWR cache fallback for offline reads.
 */
export function useLowStock(opts: UseLowStockOptions = {}) {
  return useQuery({
    queryKey: ['low-stock', opts.branchId ?? ''],
    // `always` so the SWR-cache fallback in fetchLowStock runs offline (see useProducts).
    networkMode: 'always',
    queryFn: () => fetchLowStock(opts.branchId),
  });
}
