'use client';

import { useEffect, useMemo, useState } from 'react';
import { naira, generateId } from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';
import {
  usePurchaseOrderMutations,
  type ReceiveLineInput,
} from '@/hooks/usePurchaseOrderMutations';
import type { PurchaseOrderDetail } from '@/hooks/usePurchaseOrders';

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

interface LineDraft {
  qty: string;
  batch: string;
  expiry: string;
}

/**
 * Receive goods against a PO — the desktop face of the core stock-in transaction.
 * Each PO line shows ordered / already received / outstanding and a "receiving
 * now" input prefilled with the outstanding quantity. Over-receipt is allowed
 * (real deliveries overship) and flagged inline. Optional per-line batch + expiry
 * feed `BatchTracking`; an opt-in checkbox spawns an unpaid AP invoice for the
 * receipt.
 *
 * A fresh `receipt_hash` is minted each time the sheet opens and reused across
 * in-modal retries, so a double-submit (or a lost-response retry) returns the
 * first receipt server-side instead of double-incrementing stock.
 */
export function ReceiveGoodsModal({
  open,
  onClose,
  po,
}: {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrderDetail;
}) {
  const { receive } = usePurchaseOrderMutations();

  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [receivedDate, setReceivedDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [createInvoice, setCreateInvoice] = useState(false);
  const [receiptHash, setReceiptHash] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReceivedDate(todayIso());
    setReference('');
    setNotes('');
    setCreateInvoice(false);
    setReceiptHash(generateId());
    const initial: Record<string, LineDraft> = {};
    for (const it of po.items) {
      initial[it.id] = { qty: it.quantity_outstanding > 0 ? String(it.quantity_outstanding) : '', batch: '', expiry: '' };
    }
    setDrafts(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, po.id]);

  const setLine = (id: string, patch: Partial<LineDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // Preview: Σ receiving-now × unit_cost (the amount an opt-in AP invoice would carry).
  const receiptTotal = useMemo(() => {
    return po.items.reduce((sum, it) => {
      const qty = Number(drafts[it.id]?.qty);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty * it.unit_cost : 0);
    }, 0);
  }, [po.items, drafts]);

  const pending = receive.isPending;

  const handleSubmit = () => {
    setError(null);

    const items: ReceiveLineInput[] = [];
    for (const it of po.items) {
      const d = drafts[it.id];
      if (!d) continue;
      const raw = d.qty.trim();
      if (raw === '') continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty < 0) {
        setError(`Enter a valid quantity for "${it.product?.name ?? 'line'}".`);
        return;
      }
      if (qty === 0) continue;
      if (d.batch.trim() && !d.expiry) {
        setError(`Set an expiry date for batch "${d.batch.trim()}" on "${it.product?.name ?? 'line'}".`);
        return;
      }
      items.push({
        purchase_order_item_id: it.id,
        quantity_received: qty,
        batch_number: d.batch.trim() || null,
        expiry_date: d.expiry || null,
      });
    }

    if (items.length === 0) {
      setError('Enter a received quantity on at least one line.');
      return;
    }

    receive.mutate(
      {
        id: po.id,
        data: {
          received_date: receivedDate || null,
          reference: reference.trim() || null,
          receipt_hash: receiptHash,
          create_invoice: createInvoice,
          notes: notes.trim() || null,
          items,
        },
      },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(apiErrorMessage(e, 'Could not record the receipt.')),
      }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={`Receive goods — ${po.po_number}`} className="max-w-2xl">
      <div className="max-h-[80vh] space-y-4 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rg-date">Received date *</Label>
            <Input id="rg-date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rg-ref">Delivery / waybill ref</Label>
            <Input
              id="rg-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Ordered</th>
                <th className="px-3 py-2 text-right font-medium">Received</th>
                <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                <th className="px-3 py-2 text-right font-medium">Receiving now</th>
                <th className="px-3 py-2 font-medium">Batch / expiry</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it) => {
                const d = drafts[it.id] ?? { qty: '', batch: '', expiry: '' };
                const qtyNum = Number(d.qty);
                const over = Number.isFinite(qtyNum) && qtyNum > it.quantity_outstanding;
                return (
                  <tr key={it.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{it.product?.name ?? 'Product'}</span>
                      {it.product?.sku && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{it.product.sku}</span>
                      )}
                      <div className="text-xs text-muted-foreground">@ {naira(it.unit_cost)}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{it.quantity_ordered}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{it.quantity_received}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.quantity_outstanding}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={d.qty}
                        onChange={(e) => setLine(it.id, { qty: e.target.value })}
                        className="h-9 w-24 text-right"
                      />
                      {over && <div className="mt-1 text-[11px] text-amber-600">Over-receipt</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1.5">
                        <Input
                          value={d.batch}
                          onChange={(e) => setLine(it.id, { batch: e.target.value })}
                          placeholder="Batch #"
                          className="h-9 w-36"
                        />
                        <Input
                          type="date"
                          value={d.expiry}
                          onChange={(e) => setLine(it.id, { expiry: e.target.value })}
                          className="h-9 w-36"
                          aria-label="Expiry date"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rg-notes">Notes</Label>
          <Input id="rg-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>

        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            checked={createInvoice}
            onChange={(e) => setCreateInvoice(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Create a payable (AP invoice) for this receipt</span>
            <span className="block text-xs text-muted-foreground">
              Adds an unpaid supplier invoice of {naira(receiptTotal)} to the Suppliers ledger. Leave off if
              you record invoices from the supplier&apos;s bill separately.
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-sm text-muted-foreground">
            Receiving total: <span className="font-medium tabular-nums text-foreground">{naira(receiptTotal)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={pending}>
              {pending && <Spinner className="h-4 w-4" />}
              Receive goods
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
