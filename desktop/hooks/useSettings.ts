'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export interface StoreSettings {
  allow_cashier_add_customers: boolean;
  allow_cashier_edit_customers: boolean;
  customer_menu_enabled: boolean;
  supplier_menu_enabled: boolean;
  // Store profile (printed on receipts)
  business_name?: string | null;
  rc_number?: string | null;
  store_address?: string | null;
  // Tax + receipt
  tax_rate?: number | string | null;
  receipt_footer?: string | null;
  receipt_show_logo?: boolean;
  // Additional cashier permissions
  allow_cashier_refund?: boolean;
  allow_cashier_discount?: boolean;
  max_discount_percent?: number | null;
}

export function useSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['store-settings'],
    queryFn: async () => {
      return await apiClient.get<StoreSettings>('/settings');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<StoreSettings>) => {
      return await apiClient.patch('/settings', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
    },
  });

  return {
    settings: data,
    isLoading,
    error,
    updateSettings: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
