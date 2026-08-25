'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { numOr0 } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Supplier + accounts-payable wire shapes. `Supplier`, `PurchaseInvoice` and
 * `SupplierPayment` are NOT in `@jaypos/shared` (Phase 4A adds no shared code),
 * so — like the Phase-3 `StockCountRow` — the view-only types live in the hooks
 * that read them.
 *
 * Suppliers/AP are an online-only admin surface (no Dexie cache): the queries
 * simply error while offline and refetch on reconnect (`online` is in the key).
 * The list loads once and the page filters/searches client-side (mirrors the
 * inventory catalog), so search and the tag chips compose without refetching.
 */
export interface Supplier {
  id: string;
  store_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  category?: string | null;
  notes?: string | null;
  /** Free-form label; the UI only styles the '' | 'Preferred' | 'Blocked' set. */
  tag?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * One row of `GET /v1/suppliers/summary`. The backend already coerces the totals
 * with `Number()` (unlike the invoice/payment endpoints, which send Decimal
 * strings), but they are re-normalised here defensively. `outstanding` is derived
 * `max(0, invoiced − paid)` to match mobile.
 */
export interface SupplierSummaryRow {
  supplier_id: string;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
}

/** All active suppliers (loaded once; the page filters/searches client-side). */
export function useSuppliers() {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['suppliers', online],
    queryFn: () => apiClient.get<Supplier[]>('/suppliers?limit=200').then((r) => r ?? []),
  });
}

/** Per-supplier invoiced/paid/outstanding totals for the directory + ledger stats. */
export function useSupplierSummary() {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['suppliers-summary', online],
    queryFn: async () => {
      const rows = await apiClient.get<
        Array<{ supplier_id: string; total_invoiced: unknown; total_paid: unknown }>
      >('/suppliers/summary');
      return (rows ?? []).map<SupplierSummaryRow>((r) => {
        const total_invoiced = numOr0(r.total_invoiced);
        const total_paid = numOr0(r.total_paid);
        return {
          supplier_id: r.supplier_id,
          total_invoiced,
          total_paid,
          outstanding: Math.max(0, total_invoiced - total_paid),
        };
      });
    },
  });
}
