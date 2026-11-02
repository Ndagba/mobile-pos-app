'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@/lib/roles';
import { useBranches } from '@/hooks/useBranches';
import { useSuppliers, useSupplierSummary } from '@/hooks/useSuppliers';
import { useLowStock } from '@/hooks/useLowStock';
import {
  usePurchaseOrders,
  PO_STATUS_LABEL,
  type POStatus,
  type POListItem,
} from '@/hooks/usePurchaseOrders';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { BranchFilter } from '@/components/inventory/BranchFilter';
import { POStatusBadge } from '@/components/purchasing/POStatusBadge';
import { SuggestedReorders } from '@/components/purchasing/SuggestedReorders';
import { SuppliersMini } from '@/components/purchasing/SuppliersMini';

type StatusFilter = POStatus | 'all';

const STATUS_ORDER: StatusFilter[] = [
  'all',
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
];

/** Short "29 Oct" style date for a PO row. */
function fmtShortDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Ordered / partially-received POs can still take a delivery. */
function isReceivable(status: POStatus): boolean {
  return status === 'ordered' || status === 'partially_received';
}

/**
 * Purchasing dashboard (admin + manager; the section layout gates cashiers out).
 *
 * Redesigned to the handoff: a wide "Purchase orders" panel beside a right rail of
 * "Suggested reorders" (low stock → start a PO) and a compact "Suppliers" list with
 * outstanding payables. One `GET /purchase-orders` load per branch, filtered
 * client-side by status and PO-number/supplier search. Admins with more than one
 * branch get the branch selector (narrowed server-side). The header raises a new PO.
 */
export default function PurchasingPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);

  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const branchesQ = useBranches();
  const suppliersQ = useSuppliers();
  const summaryQ = useSupplierSummary();
  const lowStockQ = useLowStock({ branchId });
  const ordersQ = usePurchaseOrders({ branchId });

  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const summary = useMemo(() => summaryQ.data ?? [], [summaryQ.data]);
  const lowStock = useMemo(() => lowStockQ.data ?? [], [lowStockQ.data]);
  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);

  const canChooseBranch = admin && branches.length > 1;

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = orders;
    if (status !== 'all') list = list.filter((o) => o.status === status);
    if (q) {
      list = list.filter(
        (o) =>
          o.po_number?.toLowerCase().includes(q) || o.supplier?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, status, q]);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Purchasing"
        subtitle="Purchase orders, deliveries and suppliers in one place."
        actions={
          <Link href="/purchasing/new" className={cn(buttonVariants())}>
            New purchase order
          </Link>
        }
      />

      {canChooseBranch && (
        <BranchFilter branches={branches} selected={branchId} onSelect={setBranchId} />
      )}

      <div className="grid min-h-0 flex-1 gap-4 overflow-auto lg:grid-cols-3">
        {/* Purchase orders panel */}
        <section className="flex min-h-0 flex-col rounded-card border border-border bg-card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-4 py-3">
            <h2 className="text-sm font-bold text-ink">Purchase orders</h2>
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO or supplier"
                className="h-9 w-44"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className="h-9 rounded-lg border border-border-strong bg-surface px-2 text-sm text-ink-2"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All statuses' : PO_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {ordersQ.isError ? (
              <p className="py-10 text-center text-sm text-text-muted">
                Couldn&apos;t load purchase orders — they need a connection, check you&apos;re
                online.
              </p>
            ) : ordersQ.isLoading && orders.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-text-muted">No purchase orders found.</p>
            ) : (
              <ul>
                {visible.map((po) => (
                  <PurchaseOrderRow key={po.id} po={po} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Right rail */}
        <div className="flex flex-col gap-4">
          <SuggestedReorders items={lowStock} loading={lowStockQ.isLoading} />
          <SuppliersMini
            suppliers={suppliers}
            summary={summary}
            loading={suppliersQ.isLoading}
          />
        </div>
      </div>
    </div>
  );
}

/** One purchase-order row in the handoff list style. */
function PurchaseOrderRow({ po }: { po: POListItem }) {
  return (
    <li className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-0 hover:bg-surface-subtle/60">
      <Link
        href={`/purchasing/${po.id}`}
        className="w-32 shrink-0 truncate whitespace-nowrap text-sm font-semibold text-primary hover:underline"
        title={po.po_number}
      >
        {po.po_number}
      </Link>
      <p className="min-w-0 flex-1 truncate text-sm text-ink">{po.supplier?.name ?? '—'}</p>
      <span className="hidden w-14 shrink-0 text-right text-xs text-text-muted sm:block">
        {fmtShortDate(po.order_date ?? po.created_at)}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs text-text-muted md:block">
        {po.items.length} {po.items.length === 1 ? 'line' : 'lines'}
      </span>
      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
        {naira(po.total_amount)}
      </span>
      <span className="hidden w-32 shrink-0 sm:block">
        <POStatusBadge status={po.status} />
      </span>
      <span className="flex shrink-0 items-center justify-end gap-1">
        <Link
          href={`/purchasing/${po.id}?print=1`}
          aria-label="Print purchase order"
          title="Print"
          className={cn(buttonVariants({ size: 'icon', variant: 'ghost' }))}
        >
          <Printer className="h-4 w-4" />
        </Link>
        {isReceivable(po.status) ? (
          <Link
            href={`/purchasing/${po.id}`}
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-20')}
          >
            Receive
          </Link>
        ) : (
          <Link
            href={`/purchasing/${po.id}`}
            className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'w-20')}
          >
            View
          </Link>
        )}
      </span>
    </li>
  );
}
