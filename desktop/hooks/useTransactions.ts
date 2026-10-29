'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * A history row as returned by `GET /v1/transactions` (server read-model — not the
 * same shape as a sale we create). Money fields arrive as Decimal strings and are
 * coerced at display time. There is no shared `Transaction` type because nothing
 * else consumes this shape, so it lives here with the hook that produces it.
 */
export interface TransactionRow {
  id: string;
  receipt_number?: string | null;
  branch_id?: string | null;
  customer_id?: string | null;
  subtotal: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  payment_method: string;
  status: string;
  created_at: string;
  is_sync_online?: boolean;
  item_count?: number;
  user?: { first_name?: string | null } | null;
  customer?: { first_name?: string | null; phone?: string | null } | null;
}

export interface TransactionFilters {
  /** `yyyy-mm-dd` (inclusive of the whole day at each end). */
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: string;
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionHistory {
  data: TransactionRow[];
  netSum: number;
  pagination: { limit: number; offset: number; total: number; pages: number };
}

/** Widen a `yyyy-mm-dd` to the start / end of that local day so the range is inclusive. */
function dayStart(d: string): string {
  return d.includes('T') ? d : `${d}T00:00:00`;
}
function dayEnd(d: string): string {
  return d.includes('T') ? d : `${d}T23:59:59`;
}

async function fetchTransactions(f: TransactionFilters): Promise<TransactionHistory> {
  const params = new URLSearchParams();
  params.set('limit', String(f.limit ?? 50));
  params.set('offset', String(f.offset ?? 0));
  if (f.dateFrom) params.set('dateFrom', dayStart(f.dateFrom));
  if (f.dateTo) params.set('dateTo', dayEnd(f.dateTo));
  if (f.paymentMethod) params.set('paymentMethod', f.paymentMethod);
  if (f.status) params.set('status', f.status);
  if (f.userId) params.set('userId', f.userId);

  // The list endpoint is double-nested (`data.data`); apiClient unwraps exactly
  // one envelope level, so this resolves to the inner { data, netSum, pagination }.
  return apiClient.get<TransactionHistory>(`/transactions?${params.toString()}`);
}

/**
 * Transaction history from the backend. Server-backed and camelCase-parametered
 * (`dateFrom/dateTo/paymentMethod/status`). Disabled while offline — the history
 * page shows the local pending-sync banner instead of stale/empty server data.
 * Previous results are kept while paging/filtering to avoid a flash of empty table.
 */
export function useTransactions(filters: TransactionFilters = {}) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['transactions', filters, online],
    queryFn: () => fetchTransactions(filters),
    enabled: online,
    placeholderData: (prev) => prev,
  });
}
