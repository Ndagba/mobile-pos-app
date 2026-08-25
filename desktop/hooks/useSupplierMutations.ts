'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { Supplier } from './useSuppliers';

export interface SupplierWriteFields {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  category?: string | null;
  notes?: string | null;
  tag?: string | null;
}

/**
 * Supplier create / update / delete against `/v1/suppliers*` (admin + manager;
 * the backend enforces the role on every write, including delete). A write can
 * shift both the directory list and the financial summary, so both are
 * invalidated — note `['suppliers']` does NOT prefix-match `['suppliers-summary']`
 * (distinct first element), so the summary is invalidated explicitly. An update
 * also refreshes the single-supplier cache.
 */
export function useSupplierMutations() {
  const queryClient = useQueryClient();

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers-summary'] });
  };

  const create = useMutation({
    mutationFn: (data: SupplierWriteFields) => apiClient.post<Supplier>('/suppliers', data),
    onSuccess: invalidateList,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<SupplierWriteFields> & { is_active?: boolean };
    }) => apiClient.patch<Supplier>(`/suppliers/${id}`, data),
    onSuccess: (_res, { id }) => {
      invalidateList();
      queryClient.invalidateQueries({ queryKey: ['supplier', id] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/suppliers/${id}`),
    onSuccess: invalidateList,
  });

  return { create, update, remove };
}
