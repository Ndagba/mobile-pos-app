'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { naira } from '@jaypos/shared';
import {
  useSupplier,
  useSupplierInvoices,
  useSupplierPayments,
  type PurchaseInvoice,
  type SupplierPayment,
  type InvoiceStatus,
} from '@/hooks/useSupplier';
import { useInvoiceMutations } from '@/hooks/useInvoiceMutations';
import { usePaymentMutations } from '@/hooks/usePaymentMutations';
import { apiErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InvoiceFormModal } from '@/components/suppliers/InvoiceFormModal';
import { PaymentFormModal } from '@/components/suppliers/PaymentFormModal';

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

const STATUS_TEXT: Record<InvoiceStatus, string> = {
  unpaid: 'text-red-600',
  partial: 'text-amber-600',
  paid: 'text-emerald-600',
};

/**
 * Supplier AP ledger (admin + manager). Shows invoiced / paid / outstanding
 * totals and two tabs — Invoices (with an inline status select + delete) and
 * Payments (delete). Recording an invoice or a payment reconciles the balance
 * server-side; all views invalidate together via the mutation hooks.
 */
export default function SupplierLedgerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const supplierQ = useSupplier(id);
  const invoicesQ = useSupplierInvoices(id);
  const paymentsQ = useSupplierPayments(id);
  const invoiceMut = useInvoiceMutations(id);
  const paymentMut = usePaymentMutations(id);

  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [deleteInvoice, setDeleteInvoice] = useState<PurchaseInvoice | null>(null);
  const [deletePayment, setDeletePayment] = useState<SupplierPayment | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const supplier = supplierQ.data;
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);

  const totalInvoiced = useMemo(
    () => invoices.reduce((s, i) => s + (i.amount || 0), 0),
    [invoices]
  );
  const totalPaid = useMemo(() => payments.reduce((s, p) => s + (p.amount || 0), 0), [payments]);
  const outstanding = Math.max(0, totalInvoiced - totalPaid);
  const openInvoiceCount = invoices.filter((i) => i.status !== 'paid').length;

  const handleStatusChange = (invoiceId: string, status: InvoiceStatus) => {
    setStatusError(null);
    invoiceMut.updateStatus.mutate(
      { invoiceId, status },
      { onError: (e) => setStatusError(apiErrorMessage(e, 'Could not update the invoice status.')) }
    );
  };

  const confirmDeleteInvoice = () => {
    if (!deleteInvoice) return;
    setDeleteError(null);
    invoiceMut.remove.mutate(deleteInvoice.id, {
      onSuccess: () => setDeleteInvoice(null),
      onError: (e) => setDeleteError(apiErrorMessage(e, 'Could not delete the invoice.')),
    });
  };
  const confirmDeletePayment = () => {
    if (!deletePayment) return;
    setDeleteError(null);
    paymentMut.remove.mutate(deletePayment.id, {
      onSuccess: () => setDeletePayment(null),
      onError: (e) => setDeleteError(apiErrorMessage(e, 'Could not delete the payment.')),
    });
  };

  const headerMeta = [supplier?.category, supplier?.phone, supplier?.email].filter(Boolean).join(' · ');

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <Link
          href="/suppliers"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Suppliers
        </Link>
        <h1 className="text-xl font-semibold">{supplier?.name ?? 'Supplier'}</h1>
        {headerMeta && <p className="text-sm text-muted-foreground">{headerMeta}</p>}
      </header>

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoiced</p>
          <p className="text-lg font-semibold tabular-nums">{naira(totalInvoiced)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
          <p className="text-lg font-semibold tabular-nums">{naira(totalPaid)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className={cn('text-lg font-semibold tabular-nums', outstanding > 0 && 'text-red-600')}>
            {naira(outstanding)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border p-0.5">
          {(['invoices', 'payments'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {t === 'invoices' ? `Invoices (${invoices.length})` : `Payments (${payments.length})`}
            </button>
          ))}
        </div>
        {tab === 'invoices' ? (
          <Button onClick={() => setInvoiceFormOpen(true)}>Record invoice</Button>
        ) : (
          <Button onClick={() => setPaymentFormOpen(true)} disabled={openInvoiceCount === 0}>
            Record payment
          </Button>
        )}
      </div>

      {statusError && <p className="text-sm text-destructive">{statusError}</p>}

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'invoices' ? (
          invoicesQ.isLoading && invoices.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          ) : invoicesQ.isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Couldn&apos;t load invoices — check you&apos;re online.
            </p>
          ) : invoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Invoice</th>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">
                          {inv.invoice_number ? `#${inv.invoice_number}` : 'Invoice'}
                        </span>
                        {inv.notes && (
                          <span className="ml-2 text-xs text-muted-foreground">{inv.notes}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {fmtDate(inv.invoice_date)}
                        {inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{naira(inv.amount)}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={inv.status}
                          onChange={(e) => handleStatusChange(inv.id, e.target.value as InvoiceStatus)}
                          disabled={invoiceMut.updateStatus.isPending}
                          className={cn(
                            'rounded-md border border-input bg-background px-2 py-1 text-xs font-medium',
                            STATUS_TEXT[inv.status]
                          )}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="partial">Partial</option>
                          <option value="paid">Paid</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteInvoice(inv);
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : paymentsQ.isLoading && payments.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : paymentsQ.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load payments — check you&apos;re online.
          </p>
        ) : payments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Notes</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(pay.date)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{pay.notes || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                      −{naira(pay.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeleteError(null);
                          setDeletePayment(pay);
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InvoiceFormModal open={invoiceFormOpen} onClose={() => setInvoiceFormOpen(false)} supplierId={id} />
      <PaymentFormModal
        open={paymentFormOpen}
        onClose={() => setPaymentFormOpen(false)}
        supplierId={id}
        invoices={invoices}
        payments={payments}
      />
      <ConfirmDialog
        open={deleteInvoice !== null}
        onClose={() => setDeleteInvoice(null)}
        onConfirm={confirmDeleteInvoice}
        title="Delete invoice"
        message="Delete this invoice? This cannot be undone."
        pending={invoiceMut.remove.isPending}
        error={deleteError}
      />
      <ConfirmDialog
        open={deletePayment !== null}
        onClose={() => setDeletePayment(null)}
        onConfirm={confirmDeletePayment}
        title="Delete payment"
        message="Delete this payment? This cannot be undone."
        pending={paymentMut.remove.isPending}
        error={deleteError}
      />
    </div>
  );
}
