'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { numOr0 } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Expiring batches via `GET /v1/inventory/expiring?days=`.
 *
 * ⚠️ This endpoint is **NOT store- or branch-scoped in the current backend** — it
 * returns BatchTracking rows across *every* store. The Expiring view renders it per
 * the Phase-3 decision but shows a prominent warning, and a backend store-scoping
 * fix is tracked as a follow-up in TODO.md. `quantity` arrives as a Decimal string
 * and is coerced here; `urgency` is derived server-side from `days_until_expiry`.
 */
export interface ExpiringBatchRow {
  batch_id: string;
  product_name: string;
  sku?: string | null;
  batch_number?: string | null;
  manufactured_date?: string | null;
  expiry_date: string;
  quantity: number;
  days_until_expiry: number;
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | string;
}

function normalize(rows: Record<string, unknown>[]): ExpiringBatchRow[] {
  return (rows ?? []).map((r) => ({
    batch_id: String(r.batch_id),
    product_name: String(r.product_name ?? ''),
    sku: (r.sku as string) ?? null,
    batch_number: (r.batch_number as string) ?? null,
    manufactured_date: (r.manufactured_date as string) ?? null,
    expiry_date: String(r.expiry_date ?? ''),
    quantity: numOr0(r.quantity),
    days_until_expiry: numOr0(r.days_until_expiry),
    urgency: (r.urgency as string) ?? 'MEDIUM',
  }));
}

/** Batches expiring within `days` or already expired. */
export function useExpiringBatches({
  days = 30,
  status = 'expiring',
}: {
  days?: number;
  status?: 'expiring' | 'expired';
} = {}) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['expiring', days, status, online],
    queryFn: async () => {
      const rows = await apiClient.get<Record<string, unknown>[]>(
        `/inventory/expiring?days=${days}&status=${status}`
      );
      return normalize(rows ?? []);
    },
  });
}
