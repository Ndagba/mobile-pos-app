'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  useStockCount,
  type StockCountDetail,
  type StockCountItemRow,
} from '@/hooks/useStockCounts';
import { useStockCountMutations, type SaveItemInput } from '@/hooks/useStockCountMutations';
import { apiErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

function formatTs(ts?: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

/** Signed variance cell, coloured by direction (over green, short red, none muted). */
function Variance({ value }: { value: number | null }) {
  if (value == null || Number.isNaN(value)) return <span className="text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-muted-foreground tabular-nums">0</span>;
  const over = value > 0;
  return (
    <span className={'tabular-nums font-medium ' + (over ? 'text-emerald-600' : 'text-red-600')}>
      {over ? '+' : ''}
      {value}
    </span>
  );
}

/**
 * Stock-count sheet: one row per active product with its system quantity, an input
 * for the physical count, and the live variance. Save upserts the entered lines;
 * Accept reconciles (sets on-hand = physical for every non-zero variance, writing an
 * `adjustment` movement per line) and completes the count.
 *
 * User input is held as an overlay keyed by product id, so a background refetch
 * never clobbers unsaved typing; a successful save clears the overlay and the table
 * falls back to the freshly-loaded server values. A completed count renders
 * read-only.
 */
export default function StockCountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const countQ = useStockCount(id);
  const { saveItems, accept } = useStockCountMutations();

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmAccept, setConfirmAccept] = useState(false);

  const count = countQ.data as StockCountDetail | undefined;
  const items = useMemo(() => count?.items ?? [], [count?.items]);
  const isCompleted = count?.status === 'completed';

  // Displayed physical string for a line: user overlay wins, else the server value.
  const displayedPhysical = (item: StockCountItemRow): string => {
    if (item.product_id in edits) return edits[item.product_id];
    return item.physical_quantity != null ? String(item.physical_quantity) : '';
  };

  const parsePhysical = (raw: string): number | null => {
    const t = raw.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const varianceFor = (item: StockCountItemRow): number | null => {
    const p = parsePhysical(displayedPhysical(item));
    return p == null ? null : p - item.system_quantity;
  };

  // Valid, changed lines ready to persist.
  const pendingItems: SaveItemInput[] = useMemo(() => {
    return Object.entries(edits)
      .map(([product_id, raw]) => ({ product_id, physical_quantity: parsePhysical(raw) }))
      .filter((i): i is SaveItemInput => i.physical_quantity != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits]);

  const dirty = Object.keys(edits).length > 0;

  const countedCount = items.filter((i) => parsePhysical(displayedPhysical(i)) != null).length;
  const discrepancies = items.filter((i) => {
    const v = varianceFor(i);
    return v != null && v !== 0;
  }).length;

  const handleSave = () => {
    setError(null);
    if (pendingItems.length === 0) return;
    saveItems.mutate(
      { id, items: pendingItems },
      {
        onSuccess: () => setEdits({}),
        onError: (e) => setError(apiErrorMessage(e, 'Could not save the counts.')),
      }
    );
  };

  const handleAccept = () => {
    setError(null);
    accept.mutate(id, {
      onSuccess: () => setConfirmAccept(false),
      onError: (e) => {
        setConfirmAccept(false);
        setError(apiErrorMessage(e, 'Could not accept the count.'));
      },
    });
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/inventory/counts"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Stock counts
          </Link>
          <h1 className="text-xl font-semibold">
            Stock count
            {count?.branch?.name ? ` — ${count.branch.name}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCompleted ? (
              <>Completed {formatTs(count?.completed_at)}</>
            ) : (
              <>
                {countedCount} of {items.length} counted · {discrepancies} discrepanc
                {discrepancies === 1 ? 'y' : 'ies'}
              </>
            )}
          </p>
        </div>
        {!isCompleted && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSave} disabled={!dirty || saveItems.isPending}>
              {saveItems.isPending && <Spinner className="h-4 w-4" />}
              Save
            </Button>
            <Button
              onClick={() => setConfirmAccept(true)}
              disabled={dirty || accept.isPending || items.length === 0}
              title={dirty ? 'Save your changes before accepting' : undefined}
            >
              {accept.isPending && <Spinner className="h-4 w-4" />}
              Accept &amp; reconcile
            </Button>
          </div>
        )}
      </header>

      {isCompleted && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          This count is completed. On-hand quantities were set to the physical counts and the
          variances written to the movement ledger.
        </div>
      )}
      {dirty && !isCompleted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          You have unsaved counts. Save before accepting.
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto">
        {countQ.isLoading && !count ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : countQ.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this stock count. It needs a connection — check you&apos;re online.
          </p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No products to count in this branch.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 text-right font-medium">System</th>
                  <th className="px-4 py-2.5 text-right font-medium">Physical</th>
                  <th className="px-4 py-2.5 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{item.product?.name ?? '—'}</span>
                      {item.product?.category?.name && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.product.category.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.product?.sku || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.system_quantity}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isCompleted ? (
                        <span className="tabular-nums">
                          {item.physical_quantity != null ? item.physical_quantity : '—'}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          inputMode="decimal"
                          value={displayedPhysical(item)}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [item.product_id]: e.target.value }))
                          }
                          className="ml-auto h-9 w-28 text-right"
                          placeholder="—"
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Variance value={isCompleted ? item.variance : varianceFor(item)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmAccept}
        onClose={() => setConfirmAccept(false)}
        onConfirm={handleAccept}
        title="Accept & reconcile"
        message={
          <>
            Set on-hand quantities to the physical counts for all {discrepancies} discrepanc
            {discrepancies === 1 ? 'y' : 'ies'}? This writes adjustments to the movement ledger and
            can&apos;t be undone.
          </>
        }
        confirmLabel="Accept & reconcile"
        destructive={false}
        pending={accept.isPending}
      />
    </div>
  );
}
