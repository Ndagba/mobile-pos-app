'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

export function useUsers(branchId?: string) {
  return useQuery({
    queryKey: ['users', branchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (branchId) params.set('branch_id', branchId);

      const data = await apiClient.get<User[]>(`/auth/users?${params.toString()}`);
      return data;
    },
  });
}
