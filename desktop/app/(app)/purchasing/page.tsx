'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@/lib/roles';
import { useBranches } from '@/hooks/useBranches';
import { useSuppliers } from '@/hooks/useSuppliers';
import { usePurchaseOrders, PO_STATUS_LABEL, type POStatus } from '@/hooks/usePurchaseOrders';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BranchFilter } from '@/components/inventory/BranchFilter';
import { PurchaseOrderTable } from '@/components/purchasing/PurchaseOrderTable';

type StatusFilter = POStatus | 'all';

const STATUS_ORDER: StatusFilter[] = [
  'all',
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
];

/**
 * Purchase-order list (admin + manager; the section layout gates cashiers out).
 *
 * One `GET /purchase-orders` load per branch, filtered client-side by status,
 * supplier and PO-number search — mirroring the suppliers directory. Status chips
 * show live counts off the full set; admins with more than one branch get the
 * branch selector (narrowed server-side). The header raises a new PO.
 */
export default function PurchasingPage() {
  const user = useAuthStore((s) => s.user);
  const admin = isAdmin(user);

  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [supplierId, setSupplierId] = useState<string>('');
  const [search, setSearch] = useState('');

  const branchesQ = useBranches();
  const suppliersQ = useSuppliers();
  const ordersQ = usePurchaseOrders({ branchId });

  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const suppliers = useMemo(() => suppliersQ.data ?? [], [suppliersQ.data]);
  const orders = useMemo(() => ordersQ.data ?? [], [ordersQ.data]);

  const canChooseBranch = admin && branches.length > 1;

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: orders.length,
      draft: 0,
      ordered: 0,
      partially_received: 0,
      received: 0,
      cancelled: 0,
    };
    orders.forEach((o) => {
      c[o.status] += 1;
    });
    return c;
  }, [orders]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = orders;
    if (status !== 'all') list = list.filter((o) => o.status === status);
    if (supplierId) list = list.filter((o) => o.supplier_id === supplierId);
    if (q) {
      list = list.filter(
        (o) =>
          o.po_number?.toLowerCase().includes(q) || o.supplier?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, status, supplierId, q]);

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            Raise purchase orders and receive stock from suppliers.
          </p>
        </div>
        <Link href="/purchasing/new" className={cn(buttonVariants())}>
          New PO
        </Link>
      </header>

      {canChooseBranch && (
        <BranchFilter branches={branches} selected={branchId} onSelect={setBranchId} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO number or supplier"
          className="max-w-xs"
        />
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              status === s
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input text-muted-foreground hover:bg-accent'
            )}
          >
            {s === 'all' ? 'All' : PO_STATUS_LABEL[s]}
            <span className="ml-1.5 text-xs text-muted-foreground">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {ordersQ.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load purchase orders — they need a connection, check you&apos;re online.
          </p>
        ) : (
          <PurchaseOrderTable orders={visible} loading={ordersQ.isLoading} />
        )}
      </div>
    </div>
  );
}
