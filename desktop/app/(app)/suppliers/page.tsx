'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { naira } from '@jaypos/shared';
import { useSuppliers, useSupplierSummary, type Supplier } from '@/hooks/useSuppliers';
import { useSupplierMutations } from '@/hooks/useSupplierMutations';
import { apiErrorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SupplierTable } from '@/components/suppliers/SupplierTable';
import { SupplierFormModal } from '@/components/suppliers/SupplierFormModal';

type Filter = 'all' | 'preferred' | 'blocked';

/**
 * Supplier directory (admin + manager; the section layout gates cashiers out).
 *
 * Mirrors mobile's SuppliersScreen: one `GET /suppliers` load filtered/searched
 * client-side, tag chips (All / Preferred / Blocked) with counts, and a per-row
 * outstanding balance from `GET /suppliers/summary`. Rows link to the AP ledger;
 * the header creates suppliers. Delete is a hard delete server-side (admin +
 * manager), so the confirm dialog spells out the consequence.
 */
export default function SuppliersPage() {
  const suppliersQ = useSuppliers();
  const summaryQ = useSupplierSummary();
  const { remove } = useSupplierMutations();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const summary = useMemo(() => summaryQ.data ?? [], [summaryQ.data]);

  const outstandingBySupplier = useMemo(() => {
    const m = new Map<string, number>();
    summary.forEach((r) => m.set(r.supplier_id, r.outstanding));
    return m;
  }, [summary]);
  const outstandingFor = (id: string) => outstandingBySupplier.get(id) ?? 0;

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set).sort();
  }, [suppliers]);

  const counts = {
    all: suppliers.length,
    preferred: suppliers.filter((s) => s.tag === 'Preferred').length,
    blocked: suppliers.filter((s) => s.tag === 'Blocked').length,
  };

  const totalOutstanding = useMemo(
    () => summary.reduce((s, r) => s + r.outstanding, 0),
    [summary]
  );

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = suppliers;
    if (filter === 'preferred') list = list.filter((s) => s.tag === 'Preferred');
    else if (filter === 'blocked') list = list.filter((s) => s.tag === 'Blocked');
    if (q) {
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.phone?.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, filter, q]);

  const openCreate = () => {
    setFormTarget(null);
    setFormOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setFormTarget(s);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    remove.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (e) => setDeleteError(apiErrorMessage(e, 'Could not delete the supplier.')),
    });
  };

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'preferred', label: 'Preferred', count: counts.preferred },
    { key: 'blocked', label: 'Blocked', count: counts.blocked },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            Manage suppliers and track accounts payable.
          </p>
        </div>
        <Button onClick={openCreate}>New supplier</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Suppliers</p>
          <p className="text-lg font-semibold tabular-nums">{counts.all}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total outstanding</p>
          <p className="text-lg font-semibold tabular-nums">{naira(totalOutstanding)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email or category"
          className="max-w-xs"
        />
        <div className="flex gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                filter === c.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground hover:bg-accent'
              )}
            >
              {c.label}
              <span className="ml-1.5 text-xs text-muted-foreground">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {suppliersQ.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load suppliers. They need a connection — check you&apos;re online.
          </p>
        ) : (
          <SupplierTable
            suppliers={visible}
            loading={suppliersQ.isLoading}
            outstandingFor={outstandingFor}
            renderRowActions={(s) => (
              <div className="flex justify-end gap-1.5">
                <Link
                  href={`/suppliers/${s.id}`}
                  className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
                >
                  Ledger
                </Link>
                <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(s);
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          />
        )}
      </div>

      <SupplierFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        supplier={formTarget}
        categorySuggestions={categorySuggestions}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete supplier"
        message={
          <>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name}</span>? This
            also removes its invoices and payments and cannot be undone. A supplier linked to any
            purchase order can&apos;t be deleted — cancel or remove those first.
          </>
        }
        pending={remove.isPending}
        error={deleteError}
      />
    </div>
  );
}
