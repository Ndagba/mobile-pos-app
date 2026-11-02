'use client';

import { naira } from '@jaypos/shared';
import type { PurchaseOrderDetail } from '@/hooks/usePurchaseOrders';
import { PO_STATUS_LABEL } from '@/hooks/usePurchaseOrders';
import { useSettings } from '@/hooks/useSettings';

function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}

/**
 * Hidden-on-screen, print-only purchase-order document (`#po-print`). The
 * globals.css `@media print` block reveals this region and hides the app chrome,
 * so printing the detail page yields a clean one-page PO. Store identity (name,
 * RC, address) comes from settings, matching the sales receipt.
 */
export function PurchaseOrderPrint({ po }: { po: PurchaseOrderDetail }) {
  const { settings } = useSettings();
  const storeName = settings?.business_name?.trim() || 'JayPOS';

  return (
    <div id="po-print" className="print-only text-black">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-lg font-bold">{storeName}</p>
          {settings?.rc_number && <p className="text-xs">{settings.rc_number}</p>}
          {settings?.store_address && <p className="text-xs">{settings.store_address}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase">Purchase Order</p>
          <p className="text-sm font-semibold">{po.po_number}</p>
          <p className="text-xs">Status: {PO_STATUS_LABEL[po.status]}</p>
        </div>
      </div>

      <div className="mb-4 flex justify-between border-y border-black/40 py-2 text-xs">
        <div>
          <p className="font-semibold uppercase">Supplier</p>
          <p>{po.supplier?.name ?? '—'}</p>
          {po.supplier?.phone && <p>{po.supplier.phone}</p>}
          {po.supplier?.email && <p>{po.supplier.email}</p>}
        </div>
        <div className="text-right">
          <p>Ordered: {fmtDate(po.order_date)}</p>
          <p>Expected: {fmtDate(po.expected_date)}</p>
        </div>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-black/60 text-left">
            <th className="py-1.5 pr-2 font-semibold">Product</th>
            <th className="py-1.5 px-2 text-right font-semibold">Ordered</th>
            <th className="py-1.5 px-2 text-right font-semibold">Received</th>
            <th className="py-1.5 px-2 text-right font-semibold">Unit cost</th>
            <th className="py-1.5 pl-2 text-right font-semibold">Line total</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((it) => (
            <tr key={it.id} className="border-b border-black/20">
              <td className="py-1.5 pr-2">
                {it.product?.name ?? 'Product'}
                {it.product?.sku ? ` (${it.product.sku})` : ''}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums">{it.quantity_ordered}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{it.quantity_received}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{naira(it.unit_cost)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{naira(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 ml-auto w-56 space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{naira(po.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span className="tabular-nums">{naira(po.tax_amount)}</span>
        </div>
        <div className="flex justify-between border-t border-black/60 pt-1 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{naira(po.total_amount)}</span>
        </div>
      </div>

      {po.notes && <p className="mt-4 text-xs">Notes: {po.notes}</p>}

      <p className="mt-6 text-2xs text-black/60">Printed {new Date().toLocaleString()}</p>
    </div>
  );
}
