'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useNetworkStatus } from '@/lib/useNetwork';
import type { Branch } from './useBranches';

/**
 * Branch administration on the existing `/v1/branches*` routes (the same ones the
 * mobile Settings → Branch Management section uses). Every write is admin-only on
 * the server; `GET /:id/staff` also allows managers. Creating a branch is subject
 * to the subscription's branch limit (`checkBranchLimit`). There is no
 * "reactivate" route — deactivation is one-way from the apps.
 *
 * The branch LIST itself comes from the existing `useBranches` hook; these
 * mutations invalidate its `['branches']` key so every selector updates.
 */
export interface BranchStaff {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  branch_id: string | null;
  last_login_at?: string | null;
}

export interface BranchFields {
  name: string;
  address?: string | null;
  phone?: string | null;
}

/** Active users who can act in this branch: its cashiers/managers plus every admin. */
export function useBranchStaff(branchId?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['branch-staff', branchId ?? '', online],
    enabled: !!branchId,
    queryFn: async () => (await apiClient.get<BranchStaff[]>(`/branches/${branchId}/staff`)) ?? [],
  });
}

export function useBranchMutations() {
  const queryClient = useQueryClient();
  const invalidateBranches = () => queryClient.invalidateQueries({ queryKey: ['branches'] });
  const invalidateStaff = (branchId: string) => {
    queryClient.invalidateQueries({ queryKey: ['branch-staff', branchId] });
    // A cashier moved between branches changes the other branch's list and the user roster.
    queryClient.invalidateQueries({ queryKey: ['branch-staff'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const create = useMutation({
    mutationFn: (data: BranchFields) => apiClient.post<Branch>('/branches', data),
    onSuccess: invalidateBranches,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: BranchFields }) =>
      apiClient.patch<Branch>(`/branches/${id}`, data),
    onSuccess: invalidateBranches,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => apiClient.patch<Branch>(`/branches/${id}/deactivate`, {}),
    onSuccess: invalidateBranches,
  });

  const assign = useMutation({
    mutationFn: ({ branchId, userId }: { branchId: string; userId: string }) =>
      apiClient.post(`/branches/${branchId}/staff`, { user_id: userId }),
    onSuccess: (_r, { branchId }) => invalidateStaff(branchId),
  });

  const unassign = useMutation({
    mutationFn: ({ branchId, userId }: { branchId: string; userId: string }) =>
      apiClient.delete(`/branches/${branchId}/staff/${userId}`),
    onSuccess: (_r, { branchId }) => invalidateStaff(branchId),
  });

  return { create, update, deactivate, assign, unassign };
}
