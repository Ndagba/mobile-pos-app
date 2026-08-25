'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';

/**
 * An inventory movement (ledger) row from `GET /v1/inventory/movements`.
 *
 * `quantity` is signed (positive = stock in, negative = stock out) and already
 * cast to a number server-side. `movement_type` is a documented string:
 * `sale | purchase | adjustment | transfer`. In practice only **sales** and
 * **stock-count reconciliation** (an `adjustment`) write here — a manual
 * `PATCH /inventory/:id` adjustment does not, so a product with only manual
 * adjustments shows no ledger rows.
 */
export interface MovementRow {
  id: string;
  store_id: string;
  branch_id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reference_id?: string | null;
  notes?: string | null;
  user_id?: string | null;
  timestamp: string;
  product?: { name?: string; sku?: string | null } | null;
  user?: { first_name?: string | null; last_name?: string | null } | null;
}

export interface UseMovementsOptions {
  productId?: string;
  limit?: number;
  /** Gate the query — the ledger modal only fetches once opened for a product. */
  enabled?: boolean;
}

async function fetchMovements(productId: string, limit: number): Promise<MovementRow[]> {
  const cacheKey = `movements_${productId}`;
  if (network.isOnline()) {
    try {
      const rows = await apiClient.get<MovementRow[]>(
        `/inventory/movements?product_id=${encodeURIComponent(productId)}&limit=${limit}`
      );
      await offlineStore.setApiCache(cacheKey, rows ?? []);
      return rows ?? [];
    } catch {
      /* fall through to the offline cache */
    }
  }
  return (await offlineStore.getApiCache<MovementRow[]>(cacheKey)) ?? [];
}

/**
 * The movement ledger for one product (most recent first). Disabled until a
 * product id is supplied, so opening the ledger modal drives the fetch.
 */
export function useMovements({ productId, limit = 50, enabled = true }: UseMovementsOptions) {
  return useQuery({
    queryKey: ['movements', productId ?? '', limit],
    // `always` so the SWR-cache fallback in fetchMovements runs offline (see useProducts).
    networkMode: 'always',
    queryFn: () => fetchMovements(productId as string, limit),
    enabled: enabled && !!productId,
  });
}
