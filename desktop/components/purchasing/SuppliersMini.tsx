'use client';

import Link from 'next/link';
import { naira } from '@jaypos/shared';
import type { Supplier, SupplierSummaryRow } from '@/hooks/useSuppliers';
import { Spinner } from '@/components/ui/spinner';

/** Two-letter avatar initials from a supplier name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The contact subtitle: category/contact person and phone, whatever is set. */
function subtitle(s: Supplier): string {
  return [s.category, s.phone].filter(Boolean).join(' · ') || s.email || 'No contact on file';
}

/**
 * Right-rail card (design handoff): a compact supplier list with each supplier's
 * outstanding payable (red) or a green "Settled" when nothing is owed. "View all"
 * opens the full Suppliers directory.
 */
export function SuppliersMini({
  suppliers,
  summary,
  loading,
  limit = 5,
}: {
  suppliers: Supplier[];
  summary: SupplierSummaryRow[];
  loading?: boolean;
  limit?: number;
}) {
  const outstandingOf = (id: string) =>
    summary.find((r) => r.supplier_id === id)?.outstanding ?? 0;

  // Surface the suppliers you owe the most first, then the rest.
  const top = [...suppliers]
    .sort((a, b) => outstandingOf(b.id) - outstandingOf(a.id))
    .slice(0, limit);

  return (
    <section className="rounded-card border border-border bg-card">
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <h2 className="text-sm font-bold text-ink">Suppliers</h2>
        <Link href="/suppliers" className="text-xs font-semibold text-primary hover:underline">
          View all →
        </Link>
      </div>
      {loading && suppliers.length === 0 ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner className="h-5 w-5" />
        </div>
      ) : top.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-text-muted">No suppliers yet.</p>
      ) : (
        <ul>
          {top.map((s) => {
            const owed = outstandingOf(s.id);
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 border-b border-divider px-4 py-2.5 last:border-0"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-bold text-primary">
                  {initials(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                  <p className="truncate text-xs text-text-muted">{subtitle(s)}</p>
                </div>
                {owed > 0 ? (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-danger">
                    {naira(owed)}
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-success">Settled</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
