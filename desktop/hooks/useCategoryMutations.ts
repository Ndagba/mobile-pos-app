'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Category } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';

/**
 * Category create / update / delete against `/v1/categories*` (admin + manager;
 * delete is admin-only — soft delete, backend-enforced).
 *
 * Deleting deactivates the category and changes which options the catalog filter
 * offers, so it invalidates both `['categories']` and `['products']` (a product's
 * embedded `category` may now point at an inactive one).
 */
export interface CategoryCreateInput {
  name: string;
  description?: string;
  /** Admin multi-branch create — an admin's branch_id wins server-side. */
  branch_id?: string;
}

export interface CategoryUpdateInput {
  id: string;
  name?: string;
  description?: string;
}

export function useCategoryMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (input: CategoryCreateInput) => apiClient.post<Category>('/categories', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: CategoryUpdateInput) =>
      apiClient.patch<Category>(`/categories/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return { create, update, remove };
}
