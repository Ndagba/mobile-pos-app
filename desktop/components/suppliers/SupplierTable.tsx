'use client';

import type { ReactNode } from 'react';
import { naira } from '@jaypos/shared';
import { Spinner } from '@/components/ui/spinner';
import type { Supplier } from '@/hooks/useSuppliers';

/** Coloured pill for the two styled tags; anything else renders nothing. */
function TagBadge({ tag }: { tag?: string | null }) {
  if (tag !== 'Preferred' && tag !== 'Blocked') return null;
  const preferred = tag === 'Preferred';
  return (
    <span
      className={
        'rounded-full px-2 py-0.5 text-xs font-medium ' +
        (preferred ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
      }
    >
      {tag}
    </span>
  );
}

/**
 * Presentational supplier table. Outstanding is looked up per-row via
 * `outstandingFor` (from `GET /suppliers/summary`) rather than carried on the
 * supplier record. Row actions (Ledger / Edit / Delete) are injected by the page.
 */
export function SupplierTable({
  suppliers,
  loading,
  outstandingFor,
  renderRowActions,
}: {
  suppliers: Supplier[];
  loading?: boolean;
  outstandingFor?: (supplierId: string) => number;
  renderRowActions?: (supplier: Supplier) => ReactNode;
}) {
  if (loading && suppliers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (suppliers.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No suppliers found.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Contact</th>
            <th className="px-4 py-2.5 font-medium">Tag</th>
            <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
            {renderRowActions && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => {
            const outstanding = outstandingFor?.(s.id) ?? 0;
            return (
              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{s.name}</span>
                  {s.category && (
                    <span className="ml-2 text-xs text-muted-foreground">{s.category}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{s.phone || s.email || '—'}</td>
                <td className="px-4 py-2.5">
                  <TagBadge tag={s.tag} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  <span
                    className={
                      outstanding > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                    }
                  >
                    {naira(outstanding)}
                  </span>
                </td>
                {renderRowActions && (
                  <td className="px-4 py-2.5 text-right">{renderRowActions(s)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
