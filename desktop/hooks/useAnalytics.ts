'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface AnalyticsDashboardData {
  total_revenue: number;
  total_profit: number;
  profit_margin: number;
  transaction_count: number;
  avg_transaction: number;
  total_items_sold: number;
  low_stock_count: number;
  payment_breakdown: Array<{ method: string; total: number }>;
  top_products: Array<{ id: string; name: string; total_revenue: number }>;
  recent_transactions: Array<{
    id: string;
    total_amount: number;
    payment_method: string;
    status: string;
    item_count: number;
    cashier: string;
  }>;
}

export interface SalesReportData {
  data: Array<{
    date: string;
    revenue: number;
    transactions: number;
    items_sold: number;
    total_cost: number;
    profit: number;
  }>;
}

export interface ProductPerformanceData {
  data: Array<{
    id: string;
    name: string;
    total_sold: number;
    total_revenue: number;
    transaction_count: number;
    total_cost: number;
    total_profit: number;
  }>;
}

export interface EmployeePerformanceData {
  data: Array<{
    userId: string;
    first_name: string;
    last_name: string;
    transaction_count: number;
    total_revenue: number;
    avg_transaction: number;
  }>;
}

export interface DebtData {
  total_outstanding: number;
  customers: Array<{
    id: string;
    first_name: string;
    last_name: string;
    balance: number;
  }>;
}

export interface DiscountData {
  data: Array<{
    cashier: string;
    discount_count: number;
    total_discount: number;
    associated_revenue: number;
  }>;
}

export function useAnalytics() {
  return {
    useDashboard: (branchId: string, range: 'today' | 'week') =>
      useQuery({
        queryKey: ['analytics-dashboard', branchId, range],
        queryFn: async () => {
          const params = branchId ? `?branch_id=${branchId}` : '';
          return await apiClient.get<AnalyticsDashboardData>(`/analytics/dashboard${params}`);
        },
      }),

    useSales: (branchId: string, dateFrom: string, dateTo: string) =>
      useQuery({
        queryKey: ['analytics-sales', branchId, dateFrom, dateTo],
        queryFn: async () => {
          const params = new URLSearchParams({ branchId, dateFrom, dateTo });
          return await apiClient.get<SalesReportData>(`/analytics/sales?${params.toString()}`);
        },
      }),

    useTopProducts: (branchId: string, period: 'daily' | 'weekly' | 'monthly') =>
      useQuery({
        queryKey: ['analytics-top-products', branchId, period],
        queryFn: async () => {
          const params = new URLSearchParams({ branchId, period });
          return await apiClient.get<ProductPerformanceData>(`/analytics/top-products?${params.toString()}`);
        },
      }),

    useEmployeePerformance: (branchId: string) =>
      useQuery({
        queryKey: ['analytics-employees', branchId],
        queryFn: async () => {
          const params = branchId ? `?branch_id=${branchId}` : '';
          return await apiClient.get<EmployeePerformanceData>(`/analytics/employee-performance${params}`);
        },
      }),

    useDebt: (branchId: string) =>
      useQuery({
        queryKey: ['analytics-debt', branchId],
        queryFn: async () => {
          const params = branchId ? `?branch_id=${branchId}` : '';
          return await apiClient.get<DebtData>(`/analytics/outstanding${params}`);
        },
      }),

    useDiscounts: (branchId: string) =>
      useQuery({
        queryKey: ['analytics-discounts', branchId],
        queryFn: async () => {
          const params = branchId ? `?branch_id=${branchId}` : '';
          return await apiClient.get<DiscountData>(`/analytics/discounts${params}`);
        },
      }),
  };
}
