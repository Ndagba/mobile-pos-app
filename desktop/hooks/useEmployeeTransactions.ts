'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface TxItem {
  id: string;
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  line_total: number | string;
  product?: { name: string; sku: string | null } | null;
}

export interface EmployeeTransaction {
  id: string;
  receipt_number: string | null;
  created_at: string;
  subtotal: number | string;
  tax_amount: number | string;
  discount_amount: number | string;
  total_amount: number | string;
  payment_method: string;
  status: string;
  user?: { first_name: string | null; last_name: string | null } | null;
  customer?: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  transaction_items?: TxItem[];
}

export interface EmployeeTransactionsResponse {
  data: EmployeeTransaction[];
  netSum: number;
  pagination: { limit: number; offset: number; total: number; pages: number };
}

export interface EmployeeTxFilters {
  dateFrom: string;
  dateTo: string;
  status?: string;
  paymentMethod?: string;
}

/**
 * All transactions posted by one employee within a period, with line items.
 * Calls `GET /v1/transactions?userId=&dateFrom=&dateTo=&includeItems=true` (the
 * `includeItems` flag is an additive backend option that nests transaction_items
 * + product name/sku). Scoped to the store by the backend; reports are gated to
 * admin/manager at the route level.
 */
export function useEmployeeTransactions(userId: string, filters: EmployeeTxFilters) {
  return useQuery({
    queryKey: ['employee-transactions', userId, filters],
    enabled: !!userId && !!filters.dateFrom && !!filters.dateTo,
    queryFn: async () => {
      const params = new URLSearchParams({
        userId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        includeItems: 'true',
        limit: '1000',
      });
      if (filters.status) params.set('status', filters.status);
      if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
      return await apiClient.get<EmployeeTransactionsResponse>(`/transactions?${params.toString()}`);
    },
  });
}

export interface AnalyticsUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

/** Store user roster (admin/manager only) — used to resolve an employee's name/role. */
export function useUsers() {
  return useQuery({
    queryKey: ['analytics-users'],
    queryFn: async () => await apiClient.get<AnalyticsUser[]>('/analytics/users'),
  });
}
