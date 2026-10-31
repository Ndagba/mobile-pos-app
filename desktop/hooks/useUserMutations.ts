'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';

export interface CreateUserFields {
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: 'admin' | 'manager' | 'cashier';
  branch_id?: string;
}

/**
 * User management against the existing `/v1/auth/*` routes (handoff §5):
 *  - create  → POST /auth/register        (admin/manager; store_id from session)
 *  - role    → PATCH /auth/users/:id       (admin only)
 *  - disable → PATCH /auth/users/:id/deactivate (admin only)
 *  - resetPw → PATCH /auth/users/:id/reset-password (admin/manager)
 * All invalidate the ['users'] list on success.
 */
export function useUserMutations() {
  const queryClient = useQueryClient();
  const storeId = useAuthStore.getState().user?.store_id;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: (data: CreateUserFields) =>
      apiClient.post('/auth/register', { ...data, store_id: storeId }),
    onSuccess: invalidate,
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiClient.patch(`/auth/users/${id}`, { role }),
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/auth/users/${id}/deactivate`, {}),
    onSuccess: invalidate,
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiClient.patch(`/auth/users/${id}/reset-password`, { password }),
  });

  return { create, updateRole, deactivate, resetPassword };
}
