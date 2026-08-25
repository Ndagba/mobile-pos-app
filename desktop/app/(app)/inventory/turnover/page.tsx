'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTurnover } from '@/hooks/useTurnover';
import { TurnoverTable } from '@/components/inventory/TurnoverTable';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/** YYYY-MM-DD for a date `n` days before today (local). */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Inventory turnover for a date range (admin + manager — inherits the inventory
 * layout). Store-scoped server-side. Defaults to the last 30 days.
 */
export default function TurnoverPage() {
  const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(() => isoDaysAgo(0));

  const turnoverQ = useTurnover({ dateFrom, dateTo });
  const rows = useMemo(() => turnoverQ.data ?? [], [turnoverQ.data]);
  const rangeInvalid = !!dateFrom && !!dateTo && dateFrom > dateTo;

  return (
    <div className="flex h-full flex-col gap-4">
      <header>
        <Link
          href="/inventory"
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Inventory
        </Link>
        <h1 className="text-xl font-semibold">Stock turnover</h1>
        <p className="text-sm text-muted-foreground">
          Units sold, transactions and turnover ratio per product over a period.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="to-from">From</Label>
          <Input
            id="to-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to-to">To</Label>
          <Input
            id="to-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      {rangeInvalid && (
        <p className="text-sm text-destructive">The start date must be on or before the end date.</p>
      )}
      {turnoverQ.isError && !rangeInvalid && (
        <p className="text-sm text-destructive">
          Couldn&apos;t load turnover. It needs a connection — check you&apos;re online.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <TurnoverTable rows={rows} loading={turnoverQ.isLoading || turnoverQ.isFetching} />
      </div>
    </div>
  );
}
