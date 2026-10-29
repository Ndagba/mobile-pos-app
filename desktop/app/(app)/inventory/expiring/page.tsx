'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Plus } from 'lucide-react';
import { useExpiringBatches } from '@/hooks/useExpiringBatches';
import { useProducts } from '@/hooks/useProducts';
import { useLocations } from '@/hooks/useLocations';
import { ExpiringList } from '@/components/inventory/ExpiringList';
import { AddBatchModal } from '@/components/inventory/AddBatchModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const DAY_OPTIONS = [7, 14, 30, 60, 90];

/**
 * Batches expiring soon or already expired (admin + manager — inherits the inventory layout).
 */
export default function ExpiringPage() {
  const [status, setStatus] = useState<'expiring' | 'expired'>('expiring');
  const [days, setDays] = useState(30);
  const [addBatchOpen, setAddBatchOpen] = useState(false);

  const expiringQ = useExpiringBatches({ days, status });
  const productsQ = useProducts({ limit: 500 });
  const locationsQ = useLocations();

  const rows = useMemo(() => expiringQ.data ?? [], [expiringQ.data]);
  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);
  const locations = useMemo(() => locationsQ.data ?? [], [locationsQ.data]);

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/inventory"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Inventory
          </Link>
          <h1 className="text-xl font-semibold">
            {status === 'expired' ? 'Expired Batches' : 'Expiring Batches'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {status === 'expired'
              ? 'Tracked batches whose expiry date has passed.'
              : 'Tracked batches approaching their expiry date.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setAddBatchOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Batch
          </Button>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-medium">Batch tracking:</span> Expiry dates are tracked per-batch.
          Batches are scoped to your authorized branches.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Toggle between Expiring Soon and Expired */}
        <div className="flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setStatus('expiring')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              status === 'expiring'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Expiring Soon
          </button>
          <button
            type="button"
            onClick={() => setStatus('expired')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              status === 'expired'
                ? 'bg-rose-50 text-rose-700 shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Expired
          </button>
        </div>

        {status === 'expiring' && (
          <div className="flex items-center gap-2">
            <Label htmlFor="exp-days" className="text-xs text-muted-foreground">
              Window:
            </Label>
            <select
              id="exp-days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  Next {d} days
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {expiringQ.isError && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load batches. Please verify your connection.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <ExpiringList rows={rows} loading={expiringQ.isLoading || expiringQ.isFetching} />
      </div>

      <AddBatchModal
        open={addBatchOpen}
        onClose={() => setAddBatchOpen(false)}
        products={products}
        locations={locations}
      />
    </div>
  );
}
