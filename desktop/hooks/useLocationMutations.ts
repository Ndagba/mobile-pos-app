'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Location } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';

export interface LocationCreateInput {
  name: string;
  description?: string;
  branch_id?: string;
}

export interface LocationUpdateInput {
  id: string;
  name?: string;
  description?: string;
}

export function useLocationMutations() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (input: LocationCreateInput) => apiClient.post<Location>('/locations', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: LocationUpdateInput) =>
      apiClient.patch<Location>(`/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return { create, update, remove };
}
