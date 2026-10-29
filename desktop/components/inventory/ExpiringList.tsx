'use client';

import type { ExpiringBatchRow } from '@/hooks/useExpiringBatches';
import { Spinner } from '@/components/ui/spinner';

const URGENCY_STYLES: Record<string, string> = {
  EXPIRED: 'bg-rose-100 text-rose-700 font-semibold',
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
};

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

/**
 * Expiring-batches table: urgency, product, batch number, expiry date, days left
 * and remaining quantity. Presentational — the page owns the `days` selector and
 * the not-store-scoped warning banner.
 */
export function ExpiringList({
  rows,
  loading,
}: {
  rows: ExpiringBatchRow[];
  loading?: boolean;
}) {
  if (loading && rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No batches expiring in this window.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Urgency</th>
            <th className="px-4 py-2.5 font-medium">Product</th>
            <th className="px-4 py-2.5 font-medium">Batch</th>
            <th className="px-4 py-2.5 font-medium">Expires</th>
            <th className="px-4 py-2.5 text-right font-medium">Days left</th>
            <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.batch_id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5">
                <span
                  className={
                    'rounded-full px-2 py-0.5 text-xs font-medium ' +
                    (URGENCY_STYLES[r.urgency] ?? 'bg-muted text-muted-foreground')
                  }
                >
                  {r.urgency}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <span className="font-medium">{r.product_name}</span>
                {r.sku && <span className="ml-2 text-xs text-muted-foreground">{r.sku}</span>}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.batch_number || '—'}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.expiry_date)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.urgency === 'EXPIRED' || r.days_until_expiry < 0
                  ? `${Math.abs(r.days_until_expiry)}d ago`
                  : r.days_until_expiry}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
