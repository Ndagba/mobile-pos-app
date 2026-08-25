'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useBranches } from '@/hooks/useBranches';
import { useStockCounts, type StockCountRow } from '@/hooks/useStockCounts';
import { useStockCountMutations } from '@/hooks/useStockCountMutations';
import { apiErrorMessage } from '@/lib/errors';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

function formatTs(ts?: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

function personName(p?: { first_name?: string; last_name?: string } | null): string {
  if (!p) return '—';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
}

function StatusBadge({ status }: { status: string }) {
  const done = status === 'completed';
  return (
    <span
      className={
        'rounded-full px-2 py-0.5 text-xs font-medium ' +
        (done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')
      }
    >
      {done ? 'Completed' : 'In progress'}
    </span>
  );
}

/**
 * Stock-count list (admin-only — the `counts` layout gates it). Shows every count
 * for the authorized branches with its status and who ran it, and starts a new one.
 * Creating navigates straight to the count sheet. An admin must choose a branch to
 * count (the backend requires it); single-branch stores pick the only branch.
 */
export default function StockCountsPage() {
  const router = useRouter();
  const branchesQ = useBranches();
  const countsQ = useStockCounts();
  const { create } = useStockCountMutations();

  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const counts = useMemo(() => countsQ.data ?? [], [countsQ.data]);
  const multiBranch = branches.length > 1;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.name;

  const openDialog = () => {
    setNotes('');
    setBranchId(branches[0]?.id);
    setError(null);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setError(null);
    const branch_id = multiBranch ? branchId : branches[0]?.id;
    if (!branch_id) {
      setError('Select a branch to count.');
      return;
    }
    create.mutate(
      { notes: notes.trim() || undefined, branch_id },
      {
        onSuccess: (row: StockCountRow) => {
          setDialogOpen(false);
          router.push(`/inventory/counts/${row.id}`);
        },
        onError: (e) => setError(apiErrorMessage(e, 'Could not start the stock count.')),
      }
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/inventory"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Inventory
          </Link>
          <h1 className="text-xl font-semibold">Stock counts</h1>
          <p className="text-sm text-muted-foreground">
            Count physical stock and reconcile it against the system.
          </p>
        </div>
        <Button onClick={openDialog}>New count</Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {countsQ.isLoading && counts.length === 0 ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : countsQ.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load stock counts. They need a connection — check you&apos;re online.
          </p>
        ) : counts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No stock counts yet. Start one to reconcile physical stock.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {multiBranch && <th className="px-4 py-2.5 font-medium">Branch</th>}
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Started by</th>
                  <th className="px-4 py-2.5 font-medium">Completed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    {multiBranch && (
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {c.branch?.name ?? branchName(c.branch_id) ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-muted-foreground">{formatTs(c.started_at)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{personName(c.started_by)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatTs(c.completed_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/inventory/counts/${c.id}`}
                        className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
                      >
                        {c.status === 'completed' ? 'View' : 'Open'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title="New stock count">
        <div className="space-y-4 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            This creates a count sheet pre-filled with every active product in the branch. Enter the
            physical quantities, then accept to reconcile.
          </p>
          {multiBranch && (
            <div className="space-y-1.5">
              <Label htmlFor="sc-branch">Branch</Label>
              <select
                id="sc-branch"
                value={branchId ?? ''}
                onChange={(e) => setBranchId(e.target.value || undefined)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sc-notes">Notes</Label>
            <Input
              id="sc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending && <Spinner className="h-4 w-4" />}
              Start count
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
