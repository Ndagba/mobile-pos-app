'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SupplierPayment } from './useSupplier';

export interface PaymentCreateInput {
  amount: number;
  date: string;
  notes?: string | null;
  invoice_id?: string | null;
}

/**
 * Supplier-payment create / delete for one supplier
 * (`/v1/suppliers/:id/payments*`, admin + manager). Recording or removing a
 * payment rolls the linked invoice's status server-side and shifts the
 * outstanding balance, so payments, invoices, the supplier and the summary are
 * all invalidated.
 */
export function usePaymentMutations(supplierId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier-payments', supplierId] });
    queryClient.invalidateQueries({ queryKey: ['supplier-invoices', supplierId] });
    queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
    queryClient.invalidateQueries({ queryKey: ['suppliers-summary'] });
  };

  const create = useMutation({
    mutationFn: (input: PaymentCreateInput) =>
      apiClient.post<SupplierPayment>(`/suppliers/${supplierId}/payments`, input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (paymentId: string) =>
      apiClient.delete(`/suppliers/${supplierId}/payments/${paymentId}`),
    onSuccess: invalidate,
  });

  return { create, remove };
}
