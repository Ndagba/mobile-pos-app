'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';

/**
 * A branch as returned by `GET /v1/branches`. The list is already role-scoped by
 * the backend (admin → all store branches, manager → assigned + home, cashier →
 * own), so it doubles as the "branches this user may act on" set.
 */
export interface Branch {
  id: string;
  name: string;
  is_active?: boolean;
  address?: string | null;
  phone?: string | null;
}

async function fetchBranches(): Promise<Branch[]> {
  if (network.isOnline()) {
    try {
      const rows = await apiClient.get<Branch[]>('/branches');
      await offlineStore.setApiCache('branches', rows ?? []);
      return rows ?? [];
    } catch {
      /* fall through to the offline cache */
    }
  }
  return (await offlineStore.getApiCache<Branch[]>('branches')) ?? [];
}

/**
 * Branches the current user may act on. The multi-branch selector is only
 * meaningful when this returns more than one active branch (mobile parity).
 * Cached to the SWR API cache for offline reads, mirroring `useCategories`.
 */
export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    // `always` so the SWR-cache fallback in fetchBranches runs offline (see useProducts).
    networkMode: 'always',
    queryFn: fetchBranches,
  });
}
