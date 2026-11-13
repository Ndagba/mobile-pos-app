'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { dayBoundsIso } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { numOr0 } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Operational reports that mobile already had and desktop did not: the
 * end-of-day tender summary, the void/refund list and the audit log. All three
 * sit on existing backend routes (`/v1/reports/eod`, `/v1/reports/voids`,
 * `/v1/audit`), are scoped server-side to the caller's authorized branches and
 * are online-only (`online` is in every key).
 */

/* ───────────────────────────── End of day ───────────────────────────── */

export interface EodPayment {
  method: string;
  count: number;
  total: number;
}
export interface EodReport {
  payments: EodPayment[];
  voids: { count: number; total: number };
}

/**
 * Tender totals for COMPLETED sales plus the voided count/total over an inclusive
 * `YYYY-MM-DD` range. The backend widens the range to whole days itself, so the
 * plain dates from the report filter bar are passed through as they are.
 */
export function useEodReport({ dateFrom, dateTo, branchId }: { dateFrom?: string; dateTo?: string; branchId?: string }) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['report-eod', dateFrom ?? '', dateTo ?? '', branchId ?? '', online],
    enabled: !!dateFrom && !!dateTo,
    queryFn: async (): Promise<EodReport> => {
      const p = new URLSearchParams({ dateFrom: dateFrom!, dateTo: dateTo! });
      if (branchId) p.set('branch_id', branchId);
      const raw = await apiClient.get<{ payments?: Record<string, unknown>[]; voids?: Record<string, unknown> }>(
        `/reports/eod?${p.toString()}`
      );
      return {
        payments: (raw?.payments ?? []).map((x) => ({
          method: String(x.method ?? ''),
          count: numOr0(x.count),
          total: numOr0(x.total),
        })),
        voids: { count: numOr0(raw?.voids?.count), total: numOr0(raw?.voids?.total) },
      };
    },
  });
}

/* ─────────────────────────── Voids & refunds ─────────────────────────── */

export interface VoidRow {
  id: string;
  receipt_number: string | null;
  created_at: string;
  status: 'voided' | 'refunded' | string;
  total_amount: number;
  payment_method: string;
  void_reason: string | null;
  voided_at: string | null;
  cashier: string;
  voided_by: string;
}

const fullName = (u: unknown): string => {
  const x = u as { first_name?: string | null; last_name?: string | null } | null | undefined;
  return [x?.first_name, x?.last_name].filter(Boolean).join(' ');
};

/**
 * Voided and refunded transactions in the range. Unlike `/reports/eod`, this
 * route compares `created_at` against the raw values it is given, so whole
 * local-day bounds are sent (a bare end date would drop that day's rows).
 */
export function useVoidsReport({ dateFrom, dateTo, branchId }: { dateFrom?: string; dateTo?: string; branchId?: string }) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['report-voids', dateFrom ?? '', dateTo ?? '', branchId ?? '', online],
    enabled: !!dateFrom && !!dateTo,
    queryFn: async (): Promise<VoidRow[]> => {
      const bounds = dayBoundsIso(dateFrom!, dateTo!);
      const p = new URLSearchParams({ dateFrom: bounds.startDate, dateTo: bounds.endDate });
      if (branchId) p.set('branch_id', branchId);
      const rows = await apiClient.get<Record<string, unknown>[]>(`/reports/voids?${p.toString()}`);
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        receipt_number: (r.receipt_number as string) ?? null,
        created_at: String(r.created_at ?? ''),
        status: String(r.status ?? ''),
        total_amount: numOr0(r.total_amount),
        payment_method: String(r.payment_method ?? ''),
        void_reason: (r.void_reason as string) ?? null,
        voided_at: (r.voided_at as string) ?? null,
        cashier: fullName(r.user),
        voided_by: fullName(r.voided_by_user),
      }));
    },
  });
}

/* ───────────────────────────── Audit log ───────────────────────────── */

export interface AuditLogRow {
  id: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  changes?: unknown;
  ip_address?: string | null;
  device_id?: string | null;
  created_at: string;
  user?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null;
}

interface AuditPage {
  items: AuditLogRow[];
  nextCursor: string | null;
}

/** Cursor-paged audit log, newest first (`GET /audit?limit=&cursor=`). */
export function useAuditLogs(branchId?: string, pageSize = 50) {
  const online = useNetworkStatus();
  return useInfiniteQuery({
    queryKey: ['audit-logs', branchId ?? '', pageSize, online],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<AuditPage> => {
      const p = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) p.set('cursor', pageParam);
      if (branchId) p.set('branch_id', branchId);
      const raw = await apiClient.get<Partial<AuditPage>>(`/audit?${p.toString()}`);
      return { items: raw?.items ?? [], nextCursor: raw?.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
