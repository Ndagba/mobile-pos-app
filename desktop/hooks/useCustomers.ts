'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { network } from '@/lib/network';
import { normalizeCustomer, type NormalizedCustomer } from '@/lib/normalize';

export interface UseCustomersOptions {
  search?: string;
  /** Skip fetching until true (e.g. the customer picker isn't open yet). */
  enabled?: boolean;
}

/**
 * Customers for selection + the soft credit check.
 *
 * `GET /v1/customers?search=` — `search` matches first_name/last_name/phone/email.
 * Rows are normalised (Decimal strings → numbers) and gain a derived
 * `available_credit` = `credit_limit − total_spent` (null credit_limit = unlimited),
 * matching mobile's live check. Network-first with a Dexie fallback.
 */
async function fetchCustomers(search?: string): Promise<NormalizedCustomer[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('limit', '50');
  const qs = params.toString();

  if (network.isOnline()) {
    try {
      const rows = await apiClient.get<Record<string, any>[]>(`/customers?${qs}`);
      const customers = (rows ?? []).map(normalizeCustomer);
      await offlineStore.saveCustomers(customers);
      return customers;
    } catch {
      /* fall through to the offline cache */
    }
  }

  let cached = (await offlineStore.getCustomers()).map(normalizeCustomer);
  if (search) {
    const q = search.toLowerCase();
    cached = cached.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }
  return cached;
}

export function useCustomers(opts: UseCustomersOptions = {}) {
  return useQuery({
    queryKey: ['customers', opts.search ?? ''],
    // `always` so the Dexie fallback in fetchCustomers runs offline (see useProducts).
    networkMode: 'always',
    queryFn: () => fetchCustomers(opts.search),
    enabled: opts.enabled ?? true,
  });
}
