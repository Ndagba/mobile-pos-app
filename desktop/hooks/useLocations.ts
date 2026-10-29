'use client';

import { useQuery } from '@tanstack/react-query';
import type { Location } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';

/**
 * Physical product locations (e.g. Shelf A1, Rack 1, Refrigerator).
 *
 * `GET /v1/locations?branch_id=` → `Location[]`, each with `_count.products`.
 * Scoped to authorized branches.
 */
async function fetchLocations(branchId?: string): Promise<Location[]> {
  const cacheKey = `locations_${branchId ?? 'all'}`;
  if (network.isOnline()) {
    try {
      const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      const rows = await apiClient.get<Location[]>(`/locations${qs}`);
      await offlineStore.setApiCache(cacheKey, rows ?? []);
      return rows ?? [];
    } catch {
      /* fall through to the offline cache */
    }
  }
  return (await offlineStore.getApiCache<Location[]>(cacheKey)) ?? [];
}

export interface UseLocationsOptions {
  branchId?: string;
}

export function useLocations(opts: UseLocationsOptions = {}) {
  return useQuery({
    queryKey: ['locations', opts.branchId ?? ''],
    networkMode: 'always',
    queryFn: () => fetchLocations(opts.branchId),
  });
}
