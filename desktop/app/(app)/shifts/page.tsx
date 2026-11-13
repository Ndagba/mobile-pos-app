'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { naira } from '@jaypos/shared';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { canManageInventory } from '@/lib/roles';
import { apiErrorMessage } from '@/lib/errors';
import { useNetworkStatus } from '@/lib/useNetwork';
import { useBranches } from '@/hooks/useBranches';
import { useCurrentShift, useShifts, useShiftMutations, type CashShift } from '@/hooks/useShifts';
import { BranchFilter } from '@/components/inventory/BranchFilter';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

function fmtWhen(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function staffName(s: CashShift): string {
  return [s.user?.first_name, s.user?.last_name].filter(Boolean).join(' ') || '—';
}

/** Signed over/short with its tone: exact = muted, over = green, short = red. */
function OverShort({ value }: { value: number | null }) {
  if (value === null) return <span className="text-text-muted">—</span>;
  if (value === 0) return <span className="text-text-muted">Balanced</span>;
  return (
    <span className={cn('font-semibold', value > 0 ? 'text-success' : 'text-danger')}>
      {value > 0 ? `+${naira(value)} over` : `${naira(Math.abs(value))} short`}
    </span>
  );
}

/**
 * Cash shifts (every role) — desktop counterpart of the mobile Cash Shifts screen,
 * on the same `/v1/shifts*` routes. A user opens one shift with an opening float
 * and later closes it with the counted cash; the server works out the expected
 * closing (opening + that user's completed cash sales in the shift's branch) and
 * the over/short. The history lists shifts for the branches the user may see
 * (a cashier sees their own branch; admins/managers theirs). Online-only.
 */
export default function ShiftsPage() {
  const user = useAuthStore((s) => s.user);
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId);
  const online = useNetworkStatus();
  const multiBranchUser = canManageInventory(user);

  const branchesQ = useBranches();
  const branches = useMemo(
    () => (branchesQ.data ?? []).filter((b) => b.is_active !== false),
    [branchesQ.data]
  );

  const [historyBranch, setHistoryBranch] = useState<string | undefined>(undefined);
  const currentQ = useCurrentShift();
  const shiftsQ = useShifts(historyBranch);
  const { start, close } = useShiftMutations();

  // Start form. A cashier's shift is always in their own branch; an admin/manager
  // without a home branch picks one (defaulting to the top-bar selection).
  const [branchId, setBranchId] = useState('');
  const [opening, setOpening] = useState('');
  const [startNotes, setStartNotes] = useState('');
  useEffect(() => {
    if (branchId) return;
    const preferred = user?.branch_id || selectedBranchId || (branches.length === 1 ? branches[0].id : '');
    if (preferred) setBranchId(preferred);
  }, [branchId, user?.branch_id, selectedBranchId, branches]);

  // Close form.
  const [actual, setActual] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const current = currentQ.data ?? null;
  const shifts = useMemo(() => shiftsQ.data ?? [], [shiftsQ.data]);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const actualNum = Number(actual);
  const diff =
    current && actual.trim() !== '' && Number.isFinite(actualNum) && current.expected_closing !== null
      ? actualNum - current.expected_closing
      : null;

  const handleStart = () => {
    const amount = Number(opening);
    if (opening.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      toast.error('Enter a valid opening balance.');
      return;
    }
    if (!branchId) {
      toast.error('Choose a branch for this shift.');
      return;
    }
    start.mutate(
      { branch_id: branchId, opening_balance: amount, notes: startNotes.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Shift started');
          setOpening('');
          setStartNotes('');
        },
        onError: (e) => toast.error(apiErrorMessage(e, 'Could not start the shift.')),
      }
    );
  };

  const handleClose = () => {
    if (!current) return;
    if (actual.trim() === '' || !Number.isFinite(actualNum) || actualNum < 0) {
      toast.error('Enter the cash you counted in the drawer.');
      return;
    }
    close.mutate(
      { id: current.id, actual_closing: actualNum, notes: closeNotes.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Shift closed');
          setActual('');
          setCloseNotes('');
        },
        onError: (e) => toast.error(apiErrorMessage(e, 'Could not close the shift.')),
      }
    );
  };

  const needsBranchChoice = !user?.branch_id;

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Cash shifts" subtitle="Open and close your till, and review past shifts." className="mb-0" />

      {!online && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink-2">
          You&apos;re offline. Shifts need a connection — you can&apos;t open or close one until you reconnect.
        </p>
      )}

      {/* Current shift */}
      <Card className="p-5">
        {currentQ.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner className="h-5 w-5" />
          </div>
        ) : currentQ.isError ? (
          <p className="text-sm text-text-muted">Couldn&apos;t load your current shift — check you&apos;re online.</p>
        ) : current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-md font-bold text-ink">Your shift is open</h2>
                <p className="text-xs text-text-muted">
                  Opened {fmtWhen(current.opened_at)} · {branchName(current.branch_id)}
                </p>
              </div>
              <span className="rounded-pill bg-success-soft px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-success">
                Open
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Opening balance" value={naira(current.opening_balance)} />
              <Stat
                label="Cash sales so far"
                value={naira((current.expected_closing ?? current.opening_balance) - current.opening_balance)}
              />
              <Stat label="Expected in drawer" value={naira(current.expected_closing ?? current.opening_balance)} strong />
            </div>

            <div className="grid max-w-2xl grid-cols-1 gap-3 border-t border-divider pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shift-actual">Cash counted (₦) *</Label>
                <Input
                  id="shift-actual"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder="0"
                  className="font-mono tabular-nums"
                />
                <p className="text-xs">
                  {diff === null ? (
                    <span className="text-text-muted">Count the drawer and enter the total.</span>
                  ) : (
                    <OverShort value={diff} />
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-close-notes">Notes</Label>
                <Input
                  id="shift-close-notes"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <Button onClick={handleClose} disabled={close.isPending || !online}>
              {close.isPending && <Spinner className="h-4 w-4" />}
              Close shift
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-md font-bold text-ink">Start a shift</h2>
              <p className="text-xs text-text-muted">
                Enter the cash float in the drawer. Cash sales you make are added to the expected closing.
              </p>
            </div>
            <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
              {needsBranchChoice && (
                <div className="space-y-1.5">
                  <Label htmlFor="shift-branch">Branch *</Label>
                  <select
                    id="shift-branch"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="h-[38px] w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2"
                  >
                    <option value="">Select branch…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="shift-opening">Opening balance (₦) *</Label>
                <Input
                  id="shift-opening"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="0"
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-start-notes">Notes</Label>
                <Input
                  id="shift-start-notes"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <Button onClick={handleStart} disabled={start.isPending || !online}>
              {start.isPending && <Spinner className="h-4 w-4" />}
              Start shift
            </Button>
          </div>
        )}
      </Card>

      {/* History */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">Shift history</h2>
        {multiBranchUser && branches.length > 1 && (
          <BranchFilter branches={branches} selected={historyBranch} onSelect={setHistoryBranch} />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-card border border-border bg-card">
        {shiftsQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : shiftsQ.isError ? (
          <p className="py-10 text-center text-sm text-text-muted">Couldn&apos;t load shifts — check you&apos;re online.</p>
        ) : shifts.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">No shifts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-surface-subtle text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5">Opened</th>
                <th className="px-4 py-2.5">Closed</th>
                <th className="px-4 py-2.5">Staff</th>
                {branches.length > 1 && <th className="px-4 py-2.5">Branch</th>}
                <th className="px-4 py-2.5 text-right">Opening</th>
                <th className="px-4 py-2.5 text-right">Expected</th>
                <th className="px-4 py-2.5 text-right">Counted</th>
                <th className="px-4 py-2.5 text-right">Over / short</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-divider last:border-0">
                  <td className="px-4 py-2.5">{fmtWhen(s.opened_at)}</td>
                  <td className="px-4 py-2.5">
                    {s.status === 'open' ? (
                      <span className="rounded-pill bg-success-soft px-2 py-0.5 text-2xs font-bold uppercase text-success">
                        Open
                      </span>
                    ) : (
                      fmtWhen(s.closed_at)
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-ink-2">{staffName(s)}</td>
                  {branches.length > 1 && <td className="px-4 py-2.5 text-text-muted">{branchName(s.branch_id)}</td>}
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{naira(s.opening_balance)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {s.expected_closing === null ? '—' : naira(s.expected_closing)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {s.actual_closing === null ? '—' : naira(s.actual_closing)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {s.status === 'open' ? <span className="text-text-muted">—</span> : <OverShort value={s.overage_shortage ?? 0} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-2xs font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn('mt-0.5 font-mono tabular-nums text-ink', strong ? 'text-xl font-extrabold' : 'text-lg font-semibold')}>
        {value}
      </p>
    </div>
  );
}
