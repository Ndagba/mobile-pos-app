'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';
import { useInvoiceMutations, type InvoiceCreateInput } from '@/hooks/useInvoiceMutations';

/** `INV-YYYYMMDD-NNNN` (mirrors mobile's `genInvoiceNumber`). */
function genInvoiceNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return `INV-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Record a purchase invoice against a supplier. The total is auto-filled from
 * quantity × unit price (both optional) but stays editable — matching the mobile
 * ledger, which lets you enter a lump-sum amount directly. Requires a date and a
 * positive amount.
 */
export function InvoiceFormModal({
  open,
  onClose,
  supplierId,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
}) {
  const { create } = useInvoiceMutations(supplierId);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInvoiceNumber(genInvoiceNumber());
    setInvoiceDate(todayIso());
    setDueDate('');
    setQuantity('');
    setUnitPrice('');
    setAmount('');
    setNotes('');
  }, [open]);

  // Auto-calc amount from qty × unit price (mirrors mobile); stays editable.
  useEffect(() => {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    if (q > 0 && p > 0) setAmount((q * p).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, unitPrice]);

  const amt = Number(amount);
  const pending = create.isPending;
  const canSubmit =
    invoiceDate.trim() !== '' && amount.trim() !== '' && Number.isFinite(amt) && amt > 0 && !pending;

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    const input: InvoiceCreateInput = {
      invoice_number: invoiceNumber.trim() || null,
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      quantity: quantity.trim() ? Number(quantity) : null,
      unit_price: unitPrice.trim() ? Number(unitPrice) : null,
      amount: amt,
      notes: notes.trim() || null,
    };
    create.mutate(input, {
      onSuccess: () => onClose(),
      onError: (e) => setError(apiErrorMessage(e, 'Could not record the invoice.')),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Record invoice" className="max-w-lg">
      <div className="max-h-[75vh] space-y-4 overflow-y-auto px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="if-number">Invoice # (auto, editable)</Label>
          <Input
            id="if-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="if-date">Invoice date *</Label>
            <Input
              id="if-date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="if-due">Due date</Label>
            <Input id="if-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="if-qty">Quantity</Label>
            <Input
              id="if-qty"
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="if-unit">Unit price</Label>
            <Input
              id="if-unit"
              type="number"
              step="any"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-amount">Total amount (₦) *</Label>
          <Input
            id="if-amount"
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Auto-filled from qty × unit price; edit if needed.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-notes">Notes</Label>
          <textarea
            id="if-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {pending && <Spinner className="h-4 w-4" />}
            Record invoice
          </Button>
        </div>
      </div>
    </Modal>
  );
}
