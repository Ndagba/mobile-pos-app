'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { numify, numOr0 } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';

/**
 * Cash shifts on the existing `/v1/shifts*` backend (the same routes the mobile
 * Cash Shifts screen uses): a user opens one shift with an opening float, sells,
 * then closes it with the counted cash; the server computes the expected closing
 * (opening + that user's completed CASH sales in the shift's branch since it
 * opened) and the over/short. Online-only — `online` is in every key so the
 * queries refetch on reconnect. Wire types are declared locally (not in
 * `@jaypos/shared`), like the other admin surfaces.
 */
export interface CashShift {
  id: string;
  branch_id: string;
  user_id: string;
  status: 'open' | 'closed' | string;
  opening_balance: number;
  expected_closing: number | null;
  actual_closing: number | null;
  overage_shortage: number | null;
  opened_at: string;
  closed_at?: string | null;
  notes?: string | null;
  user?: { first_name?: string | null; last_name?: string | null } | null;
}

function normalize(raw: Record<string, unknown>): CashShift {
  return {
    ...(raw as unknown as CashShift),
    opening_balance: numOr0(raw.opening_balance),
    expected_closing: raw.expected_closing == null ? null : (numify(raw.expected_closing) ?? null),
    actual_closing: raw.actual_closing == null ? null : (numify(raw.actual_closing) ?? null),
    overage_shortage: raw.overage_shortage == null ? null : (numify(raw.overage_shortage) ?? null),
  };
}

/** The signed-in user's open shift (with a live `expected_closing`), or null. */
export function useCurrentShift() {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['shift-current', online],
    queryFn: async () => {
      const raw = await apiClient.get<Record<string, unknown> | null>('/shifts/current');
      return raw ? normalize(raw) : null;
    },
  });
}

/** Past and open shifts for the caller's authorized branches (optionally one branch). */
export function useShifts(branchId?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['shifts', branchId ?? '', online],
    queryFn: async () => {
      const qs = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      const rows = await apiClient.get<Record<string, unknown>[]>(`/shifts${qs}`);
      return (rows ?? []).map(normalize);
    },
  });
}

export function useShiftMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['shift-current'] });
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
  };

  const start = useMutation({
    mutationFn: (input: { branch_id: string; opening_balance: number; notes?: string }) =>
      apiClient.post<Record<string, unknown>>('/shifts', input).then(normalize),
    onSuccess: invalidate,
  });

  const close = useMutation({
    mutationFn: ({ id, actual_closing, notes }: { id: string; actual_closing: number; notes?: string }) =>
      apiClient
        .post<Record<string, unknown>>(`/shifts/${id}/close`, { actual_closing, notes })
        .then(normalize),
    onSuccess: invalidate,
  });

  return { start, close };
}
