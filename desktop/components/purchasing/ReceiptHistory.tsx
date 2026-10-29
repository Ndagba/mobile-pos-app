'use client';

import { useMemo } from 'react';
import { naira } from '@jaypos/shared';
import type { PurchaseOrderDetail } from '@/hooks/usePurchaseOrders';

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

/**
 * Receipt history for a PO. The backend's receipt lines carry only `product_id`
 * (no product join), so names/units are resolved from the PO's own `items` — the
 * detail response we already hold. Each receipt shows its date + reference and the
 * per-line quantity received, with batch/expiry where captured.
 */
export function ReceiptHistory({ po }: { po: PurchaseOrderDetail }) {
  const productById = useMemo(() => {
    const m = new Map<string, { name: string; unit?: string | null }>();
    for (const it of po.items) {
      if (it.product?.name) m.set(it.product_id, { name: it.product.name, unit: it.product.unit });
    }
    return m;
  }, [po.items]);

  if (po.receipts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No goods received yet.</p>;
  }

  // Newest first — the backend returns them in creation order.
  const receipts = [...po.receipts].reverse();

  return (
    <div className="space-y-4">
      {receipts.map((r) => (
        <div key={r.id} className="rounded-lg border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
            <div>
              <span className="text-sm font-medium">Received {fmtDate(r.received_date)}</span>
              {r.reference && (
                <span className="ml-2 text-xs text-muted-foreground">Ref {r.reference}</span>
              )}
            </div>
            {r.notes && <span className="text-xs text-muted-foreground">{r.notes}</span>}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {r.items.map((line) => {
                const p = productById.get(line.product_id);
                return (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="px-4 py-2">
                      <span className="font-medium">{p?.name ?? 'Product'}</span>
                      {(line.batch_number || line.expiry_date) && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {line.batch_number ? `Batch ${line.batch_number}` : ''}
                          {line.batch_number && line.expiry_date ? ' · ' : ''}
                          {line.expiry_date ? `Exp ${fmtDate(line.expiry_date)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      +{line.quantity_received}
                      {p?.unit ? ` ${p.unit}` : ''}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {naira(line.unit_cost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
