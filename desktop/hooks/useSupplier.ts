'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { numOr0, numify } from '@/lib/normalize';
import { useNetworkStatus } from '@/lib/useNetwork';
import type { Supplier } from './useSuppliers';

/**
 * One supplier's AP ledger: the supplier record, its purchase invoices and its
 * payments. The backend serialises Decimal columns as JSON strings, so
 * `amount`/`quantity`/`unit_price` are normalised to numbers on the way in
 * (matching mobile's `parseFloat` reads). Online-only, like the other AP hooks.
 */
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid';

export interface PurchaseInvoice {
  id: string;
  supplier_id: string;
  invoice_number?: string | null;
  invoice_date: string;
  due_date?: string | null;
  amount: number;
  quantity?: number;
  unit_price?: number;
  status: InvoiceStatus;
  notes?: string | null;
  created_at?: string;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  invoice_id?: string | null;
  amount: number;
  date: string;
  notes?: string | null;
  created_at?: string;
}

function normalizeInvoice(raw: Record<string, unknown>): PurchaseInvoice {
  return {
    ...(raw as unknown as PurchaseInvoice),
    amount: numOr0(raw.amount),
    quantity: numify(raw.quantity),
    unit_price: numify(raw.unit_price),
    status: ((raw.status as InvoiceStatus) ?? 'unpaid'),
  };
}

function normalizePayment(raw: Record<string, unknown>): SupplierPayment {
  return {
    ...(raw as unknown as SupplierPayment),
    amount: numOr0(raw.amount),
  };
}

/** One supplier record. Disabled until an id is supplied. */
export function useSupplier(id?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['supplier', id ?? '', online],
    queryFn: () => apiClient.get<Supplier>(`/suppliers/${id}`),
    enabled: !!id,
  });
}

/** Purchase invoices for one supplier (Decimal fields normalised to numbers). */
export function useSupplierInvoices(id?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['supplier-invoices', id ?? '', online],
    queryFn: () =>
      apiClient
        .get<Record<string, unknown>[]>(`/suppliers/${id}/invoices`)
        .then((rows) => (rows ?? []).map(normalizeInvoice)),
    enabled: !!id,
  });
}

/** Payments for one supplier (Decimal amount normalised to a number). */
export function useSupplierPayments(id?: string) {
  const online = useNetworkStatus();
  return useQuery({
    queryKey: ['supplier-payments', id ?? '', online],
    queryFn: () =>
      apiClient
        .get<Record<string, unknown>[]>(`/suppliers/${id}/payments`)
        .then((rows) => (rows ?? []).map(normalizePayment)),
    enabled: !!id,
  });
}
