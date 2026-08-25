'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useExpiringBatches } from '@/hooks/useExpiringBatches';
import { ExpiringList } from '@/components/inventory/ExpiringList';
import { Label } from '@/components/ui/label';

const DAY_OPTIONS = [7, 14, 30, 60, 90];

/**
 * Batches expiring within a window (admin + manager — inherits the inventory
 * layout). ⚠️ The backend endpoint is NOT store-scoped, so results may include
 * batches from other stores; the banner makes that explicit until the backend fix
 * lands (tracked in TODO.md).
 */
export default function ExpiringPage() {
  const [days, setDays] = useState(30);
  const expiringQ = useExpiringBatches({ days });
  const rows = useMemo(() => expiringQ.data ?? [], [expiringQ.data]);

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <Link
          href="/inventory"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Inventory
        </Link>
        <h1 className="text-xl font-semibold">Expiring batches</h1>
        <p className="text-sm text-muted-foreground">
          Tracked batches approaching their expiry date.
        </p>
      </header>

      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-medium">Heads up:</span> this list is not yet filtered to your store.
          It may include batches from other stores until a backend fix scopes the endpoint. Treat the
          results as indicative.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="exp-days">Window</Label>
          <select
            id="exp-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-10 w-44 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Next {d} days
              </option>
            ))}
          </select>
        </div>
      </div>

      {expiringQ.isError && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load expiring batches. It needs a connection — check you&apos;re online.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <ExpiringList rows={rows} loading={expiringQ.isLoading || expiringQ.isFetching} />
      </div>
    </div>
  );
}
