'use client';

import Link from 'next/link';
import { naira } from '@jaypos/shared';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { POStatusBadge } from './POStatusBadge';
import type { POListItem } from '@/hooks/usePurchaseOrders';

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

/** "3 / 5" received-lines summary for a PO's line roll-ups. */
function lineProgress(items: POListItem['items']): string {
  if (items.length === 0) return '—';
  const done = items.filter((i) => i.quantity_received >= i.quantity_ordered && i.quantity_ordered > 0).length;
  return `${done} / ${items.length}`;
}

/**
 * Presentational purchase-order list. The whole PO number links to the detail
 * page (which carries every action — submit / cancel / receive / delete). Rows
 * show status, supplier, expected date, line fulfilment and the order total.
 */
export function PurchaseOrderTable({
  orders,
  loading,
}: {
  orders: POListItem[];
  loading?: boolean;
}) {
  if (loading && orders.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (orders.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No purchase orders found.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">PO number</th>
            <th className="px-4 py-2.5 font-medium">Supplier</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Expected</th>
            <th className="px-4 py-2.5 text-center font-medium">Lines</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
            <th className="px-4 py-2.5 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((po) => (
            <tr key={po.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5">
                <Link href={`/purchasing/${po.id}`} className="font-medium text-primary hover:underline">
                  {po.po_number}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{po.supplier?.name ?? '—'}</td>
              <td className="px-4 py-2.5">
                <POStatusBadge status={po.status} />
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(po.expected_date)}</td>
              <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">
                {lineProgress(po.items)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{naira(po.total_amount)}</td>
              <td className="px-4 py-2.5 text-right">
                <Link
                  href={`/purchasing/${po.id}`}
                  className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
