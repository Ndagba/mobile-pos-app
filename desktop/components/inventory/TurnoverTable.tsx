'use client';

import type { TurnoverRow } from '@/hooks/useTurnover';
import { Spinner } from '@/components/ui/spinner';

/**
 * Inventory turnover table: units sold, distinct transactions and the turnover
 * ratio per product over the selected range. Presentational — the page owns the
 * date range and query. A null ratio (no average on-hand to divide by) shows as —.
 */
export function TurnoverTable({
  rows,
  loading,
}: {
  rows: TurnoverRow[];
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
        No sales in this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Product</th>
            <th className="px-4 py-2.5 font-medium">SKU</th>
            <th className="px-4 py-2.5 text-right font-medium">Units sold</th>
            <th className="px-4 py-2.5 text-right font-medium">Transactions</th>
            <th className="px-4 py-2.5 text-right font-medium">Turnover ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{r.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{r.sku || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.total_sold}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.transaction_count}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {r.turnover_ratio == null ? '—' : r.turnover_ratio.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
