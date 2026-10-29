'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { Customer } from '@jaypos/shared';

export interface CustomerFilters {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CustomerSummary {
  total: number;
  vips: number;
  active30d: number;
  lifetimeSpend: number;
  outstanding: number;
}

export function useCustomerSummary() {
  return useQuery({
    queryKey: ['customers-summary'],
    queryFn: async () => {
      return await apiClient.get<CustomerSummary>('/customers/summary');
    },
  });
}

export function useCustomers(options: { filters?: CustomerFilters; enabled?: boolean } = {}) {
  const { filters = {}, enabled = true } = options;
  return useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set('search', filters.search);
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.offset) params.set('offset', String(filters.offset));

      const data = await apiClient.get<Customer[]>(`/customers?${params.toString()}`);
      return data;
    },
    enabled,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Customer>) => {
      return await apiClient.post<Customer>('/customers', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Customer> }) => {
      return await apiClient.patch<Customer>(`/customers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await apiClient.delete(`/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useCustomerLedger(customerId: string) {
  return useQuery({
    queryKey: ['customer-ledger', customerId],
    queryFn: async () => {
      const [customer, history, payments] = await Promise.all([
        apiClient.get<Customer>(`/customers/${customerId}`),
        apiClient.get<any[]>(`/customers/${customerId}/history`),
        apiClient.get<any[]>(`/customers/${customerId}/payments`).catch(() => []),
      ]);
      return { customer, history, payments };
    },
    enabled: !!customerId,
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, data }: { customerId: string; data: any }) => {
      return await apiClient.post(`/customers/${customerId}/payments`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', variables.customerId] });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, paymentId }: { customerId: string; paymentId: string }) => {
      return await apiClient.delete(`/customers/${customerId}/payments/${paymentId}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customer-ledger', variables.customerId] });
    },
  });
}
