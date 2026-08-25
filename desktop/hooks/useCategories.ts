'use client';

import { useQuery } from '@tanstack/react-query';
import type { Category } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';

/**
 * Product categories for the POS tabs and the inventory catalog.
 *
 * `GET /v1/categories?branch_id=` → `Category[]` (no pagination), each with
 * `_count.products`. Branch scoping is honoured server-side; an admin may narrow
 * to one branch. There is no dedicated Dexie table for categories, so the
 * snapshot is kept in the generic stale-while-revalidate API cache (keyed by
 * branch) and served when offline.
 */
async function fetchCategories(branchId?: string): Promise<Category[]> {
  const cacheKey = `categories_${branchId ?? 'all'}`;
  if (network.isOnline()) {
    try {
      const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      const rows = await apiClient.get<Category[]>(`/categories${qs}`);
      await offlineStore.setApiCache(cacheKey, rows ?? []);
      return rows ?? [];
    } catch {
      /* fall through to the offline cache */
    }
  }
  return (await offlineStore.getApiCache<Category[]>(cacheKey)) ?? [];
}

export interface UseCategoriesOptions {
  /** Admin/manager branch filter. Omitted → all authorized branches (server-scoped). */
  branchId?: string;
}

export function useCategories(opts: UseCategoriesOptions = {}) {
  return useQuery({
    queryKey: ['categories', opts.branchId ?? ''],
    // `always` so the SWR-cache fallback in fetchCategories runs offline (see useProducts).
    networkMode: 'always',
    queryFn: () => fetchCategories(opts.branchId),
  });
}
