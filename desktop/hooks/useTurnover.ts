'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { numify, numOr0 } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Inventory turnover for a date range via `GET /v1/inventory/turnover?dateFrom=&dateTo=`
 * (store-scoped; PRODUCT items only). The raw query returns the metrics as strings
 * (`numeric`/`bigint`), so they are coerced to numbers here. `turnover_ratio` is
 * null when the product has no average on-hand to divide by.
 */
export interface TurnoverRow {
  id: string;
  name: string;
  sku?: string | null;
  total_sold: number;
  transaction_count: number;
  turnover_ratio: number | null;
}

function normalize(rows: Record<string, unknown>[]): TurnoverRow[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    sku: (r.sku as string) ?? null,
    total_sold: numOr0(r.total_sold),
    transaction_count: numOr0(r.transaction_count),
    turnover_ratio: r.turnover_ratio == null ? null : (numify(r.turnover_ratio) ?? null),
  }));
}

/** Turnover rows for the range. Disabled until both dates are set (backend 400s otherwise). */
export function useTurnover({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['turnover', dateFrom ?? '', dateTo ?? '', online],
    queryFn: async () => {
      const qs = `?dateFrom=${encodeURIComponent(dateFrom!)}&dateTo=${encodeURIComponent(dateTo!)}`;
      const rows = await apiClient.get<Record<string, unknown>[]>(`/inventory/turnover${qs}`);
      return normalize(rows ?? []);
    },
    enabled: !!dateFrom && !!dateTo,
  });
}
