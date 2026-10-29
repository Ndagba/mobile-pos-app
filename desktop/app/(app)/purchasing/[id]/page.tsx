'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { usePurchaseOrder } from '@/hooks/usePurchaseOrder';
import { usePurchaseOrderMutations } from '@/hooks/usePurchaseOrderMutations';
import { apiErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { POStatusBadge } from '@/components/purchasing/POStatusBadge';
import { ReceiveGoodsModal } from '@/components/purchasing/ReceiveGoodsModal';
import { ReceiptHistory } from '@/components/purchasing/ReceiptHistory';

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

/**
 * Purchase-order detail (admin + manager). Drives the whole PO lifecycle:
 * draft → submit (ordered) / delete, ordered/partially_received → receive goods
 * (the atomic stock-in), and cancel while no goods have been received. The line
 * table shows ordered / received / outstanding per product; receipts accumulate
 * below.
 */
export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const poQ = usePurchaseOrder(id);
  const { update, remove } = usePurchaseOrderMutations();

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const po = poQ.data;

  if (poQ.isLoading && !po) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (poQ.isError || !po) {
    return (
      <div className="flex h-full flex-col gap-4">
        <Link
          href="/purchasing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Purchasing
        </Link>
        <p className="py-10 text-center text-sm text-muted-foreground">
          Couldn&apos;t load this purchase order — check you&apos;re online.
        </p>
      </div>
    );
  }

  const canReceive = po.status === 'ordered' || po.status === 'partially_received';
  const canSubmit = po.status === 'draft';
  const canDelete = po.status === 'draft';
  // Cancellation is only allowed before any goods are received (backend-enforced).
  const canCancel = (po.status === 'draft' || po.status === 'ordered') && po.receipts.length === 0;

  const submitOrder = () => {
    setActionError(null);
    update.mutate(
      { id, data: { status: 'ordered' } },
      { onError: (e) => setActionError(apiErrorMessage(e, 'Could not submit the order.')) }
    );
  };
  const cancelOrder = () => {
    setActionError(null);
    update.mutate(
      { id, data: { status: 'cancelled' } },
      {
        onSuccess: () => setConfirmCancel(false),
        onError: (e) => setActionError(apiErrorMessage(e, 'Could not cancel the order.')),
      }
    );
  };
  const deleteOrder = () => {
    setActionError(null);
    remove.mutate(id, {
      onSuccess: () => router.push('/purchasing'),
      onError: (e) => setActionError(apiErrorMessage(e, 'Could not delete the order.')),
    });
  };

  const headerMeta = [po.supplier?.name, po.supplier?.phone].filter(Boolean).join(' · ');

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/purchasing"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Purchasing
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{po.po_number}</h1>
            <POStatusBadge status={po.status} />
          </div>
          {headerMeta && <p className="text-sm text-muted-foreground">{headerMeta}</p>}
          <p className="text-xs text-muted-foreground">
            Ordered {fmtDate(po.order_date)} · Expected {fmtDate(po.expected_date)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSubmit && (
            <Button onClick={submitOrder} disabled={update.isPending}>
              {update.isPending && <Spinner className="h-4 w-4" />}
              Submit order
            </Button>
          )}
          {canReceive && <Button onClick={() => setReceiveOpen(true)}>Receive goods</Button>}
          {canCancel && (
            <Button variant="outline" onClick={() => setConfirmCancel(true)}>
              Cancel order
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </header>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal</p>
          <p className="text-lg font-semibold tabular-nums">{naira(po.subtotal)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Tax</p>
          <p className="text-lg font-semibold tabular-nums">{naira(po.tax_amount)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-lg font-semibold tabular-nums">{naira(po.total_amount)}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-auto">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Lines</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ordered</th>
                  <th className="px-4 py-2.5 text-right font-medium">Received</th>
                  <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{it.product?.name ?? 'Product'}</span>
                      {it.product?.sku && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{it.product.sku}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{it.quantity_ordered}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{it.quantity_received}</td>
                    <td
                      className={cn(
                        'px-4 py-2.5 text-right tabular-nums',
                        it.quantity_outstanding > 0 ? 'font-medium text-amber-600' : 'text-muted-foreground'
                      )}
                    >
                      {it.quantity_outstanding}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {naira(it.unit_cost)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{naira(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {po.notes && <p className="text-sm text-muted-foreground">Notes: {po.notes}</p>}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Receipts</h2>
          <ReceiptHistory po={po} />
        </section>
      </div>

      <ReceiveGoodsModal open={receiveOpen} onClose={() => setReceiveOpen(false)} po={po} />
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancelOrder}
        title="Cancel purchase order"
        message="Cancel this purchase order? It can't be received afterwards. This cannot be undone."
        confirmLabel="Cancel order"
        pending={update.isPending}
        error={actionError}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteOrder}
        title="Delete purchase order"
        message="Delete this draft purchase order? This cannot be undone."
        pending={remove.isPending}
        error={actionError}
      />
    </div>
  );
}
