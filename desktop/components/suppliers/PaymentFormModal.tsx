'use client';

import { useEffect, useMemo, useState } from 'react';
import { naira } from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';
import { usePaymentMutations, type PaymentCreateInput } from '@/hooks/usePaymentMutations';
import type { PurchaseInvoice, SupplierPayment } from '@/hooks/useSupplier';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Record a payment against one open invoice. The invoice picker lists only
 * invoices with a positive balance (amount − payments already applied);
 * selecting one prefills the amount with its outstanding balance. A payment may
 * not exceed the selected invoice's balance (mirrors mobile's
 * `amount > balance + 0.001` guard, which absorbs float noise).
 */
export function PaymentFormModal({
  open,
  onClose,
  supplierId,
  invoices,
  payments,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  invoices: PurchaseInvoice[];
  payments: SupplierPayment[];
}) {
  const { create } = usePaymentMutations(supplierId);

  // Balance per invoice = amount − payments linked to it.
  const balanceByInvoice = useMemo(() => {
    const paid: Record<string, number> = {};
    for (const p of payments) {
      if (p.invoice_id) paid[p.invoice_id] = (paid[p.invoice_id] ?? 0) + p.amount;
    }
    const map: Record<string, number> = {};
    for (const inv of invoices) map[inv.id] = inv.amount - (paid[inv.id] ?? 0);
    return map;
  }, [invoices, payments]);

  const openInvoices = useMemo(
    () => invoices.filter((inv) => (balanceByInvoice[inv.id] ?? 0) > 0.001),
    [invoices, balanceByInvoice]
  );

  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(todayIso());
    setNotes('');
    const first = openInvoices[0];
    setInvoiceId(first?.id ?? '');
    setAmount(first ? String((balanceByInvoice[first.id] ?? 0).toFixed(2)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedBalance = invoiceId ? (balanceByInvoice[invoiceId] ?? 0) : 0;
  const amt = Number(amount);
  const pending = create.isPending;

  const onSelectInvoice = (id: string) => {
    setInvoiceId(id);
    // Prefill the amount with the newly-selected invoice's balance.
    setAmount(id ? String((balanceByInvoice[id] ?? 0).toFixed(2)) : '');
  };

  const validate = (): string | null => {
    if (!invoiceId) return 'Select an invoice to pay.';
    if (!Number.isFinite(amt) || amt <= 0) return 'Enter a payment amount greater than zero.';
    if (amt > selectedBalance + 0.001)
      return `Payment exceeds the invoice balance of ${naira(selectedBalance)}.`;
    return null;
  };

  const handleSubmit = () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    const input: PaymentCreateInput = {
      amount: amt,
      date,
      notes: notes.trim() || null,
      invoice_id: invoiceId,
    };
    create.mutate(input, {
      onSuccess: () => onClose(),
      onError: (e) => setError(apiErrorMessage(e, 'Could not record the payment.')),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Record payment" className="max-w-lg">
      <div className="space-y-4 px-4 py-4">
        {openInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open invoices to pay. Record an invoice first.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="pf-invoice">Invoice *</Label>
              <select
                id="pf-invoice"
                value={invoiceId}
                onChange={(e) => onSelectInvoice(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {openInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {(inv.invoice_number || inv.id.slice(0, 8))} — bal {naira(balanceByInvoice[inv.id] ?? 0)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Balance on this invoice: {naira(selectedBalance)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-amount">Amount (₦) *</Label>
                <Input
                  id="pf-amount"
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-date">Date *</Label>
                <Input id="pf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-notes">Notes</Label>
              <Input id="pf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending || openInvoices.length === 0}>
            {pending && <Spinner className="h-4 w-4" />}
            Record payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
