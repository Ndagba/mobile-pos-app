'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PurchaseInvoice, InvoiceStatus } from './useSupplier';

export interface InvoiceCreateInput {
  invoice_number?: string | null;
  invoice_date: string;
  due_date?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount: number;
  notes?: string | null;
}

/**
 * Purchase-invoice create / status-update / delete for one supplier
 * (`/v1/suppliers/:id/invoices*`, admin + manager). Every write changes the
 * ledger and the store-wide outstanding, so the supplier's invoice list, the
 * single-supplier cache and the financial summary are all invalidated.
 */
export function useInvoiceMutations(supplierId: string) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier-invoices', supplierId] });
    queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
    queryClient.invalidateQueries({ queryKey: ['suppliers-summary'] });
  };

  const create = useMutation({
    mutationFn: (input: InvoiceCreateInput) =>
      apiClient.post<PurchaseInvoice>(`/suppliers/${supplierId}/invoices`, input),
    onSuccess: invalidate,
  });

  const updateStatus = useMutation({
    mutationFn: ({ invoiceId, status }: { invoiceId: string; status: InvoiceStatus }) =>
      apiClient.patch<PurchaseInvoice>(`/suppliers/${supplierId}/invoices/${invoiceId}`, { status }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (invoiceId: string) =>
      apiClient.delete(`/suppliers/${supplierId}/invoices/${invoiceId}`),
    onSuccess: invalidate,
  });

  return { create, updateStatus, remove };
}
