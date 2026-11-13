'use client';

import { useMemo, useState } from 'react';
import { useAuditLogs, type AuditLogRow } from '@/hooks/useOpsReports';
import { useBranches } from '@/hooks/useBranches';
import { useNetworkStatus } from '@/lib/useNetwork';
import { BranchFilter } from '@/components/inventory/BranchFilter';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

function fmtWhen(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function who(r: AuditLogRow): string {
  return [r.user?.first_name, r.user?.last_name].filter(Boolean).join(' ') || r.user?.email || 'System';
}

/** Same colour rule the mobile Audit Logs screen uses, keyed off the action name. */
function actionTone(action: string): string {
  if (/VOID|DELETE|REFUND|DEACTIVATE/.test(action)) return 'bg-danger-soft text-danger';
  if (/DISCOUNT|UPDATE|RESET|MODIFY|CLOSE/.test(action)) return 'bg-warning-soft text-warning';
  if (/LOGIN|START|CREATE|REGISTER/.test(action)) return 'bg-success-soft text-success';
  return 'bg-surface-subtle text-ink-2';
}

function changesText(changes: unknown): string {
  if (changes === null || changes === undefined) return '';
  if (typeof changes === 'string') return changes;
  try {
    const s = JSON.stringify(changes);
    return s === '{}' ? '' : s;
  } catch {
    return '';
  }
}

/**
 * Audit log (admin + manager; the section layout gates cashiers out) — desktop
 * counterpart of the mobile Audit Logs screen on `GET /v1/audit`. Newest first,
 * cursor-paged ("Load more"), scoped server-side to the caller's branches. The
 * search box filters the rows already loaded (the endpoint has no search).
 */
export default function AuditLogPage() {
  const online = useNetworkStatus();
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const branchesQ = useBranches();
  const branches = useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  const logsQ = useAuditLogs(branchId);

  const rows = useMemo(() => (logsQ.data?.pages ?? []).flatMap((p) => p.items), [logsQ.data]);
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        who(r).toLowerCase().includes(q) ||
        (r.resource_type ?? '').toLowerCase().includes(q) ||
        (r.resource_id ?? '').toLowerCase().includes(q)
    );
  }, [rows, q]);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Audit log"
        subtitle="Security events and critical actions, newest first."
        className="mb-0"
        actions={
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter loaded rows"
            className="h-9 w-56"
          />
        }
      />

      {!online && (
        <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-ink-2">
          You&apos;re offline. The audit log needs a connection.
        </p>
      )}

      <BranchFilter branches={branches} selected={branchId} onSelect={setBranchId} />

      <div className="min-h-0 flex-1 overflow-auto rounded-card border border-border bg-card">
        {logsQ.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : logsQ.isError ? (
          <p className="py-10 text-center text-sm text-text-muted">Couldn&apos;t load the audit log — check you&apos;re online.</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            {q ? 'No loaded rows match this filter.' : 'No audit entries yet.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-surface-subtle text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Resource</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const details = changesText(r.changes);
                return (
                  <tr key={r.id} className="border-b border-divider align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-text-muted">{fmtWhen(r.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium text-ink-2">{who(r)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('rounded-pill px-2 py-0.5 text-2xs font-bold', actionTone(r.action))}>
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {r.resource_type || '—'}
                      {r.resource_id && (
                        <span className="ml-1.5 font-mono text-2xs" title={r.resource_id}>
                          {r.resource_id.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-2.5 font-mono text-2xs text-text-muted" title={details || undefined}>
                      {details || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} loaded{q ? ` · ${visible.length} shown` : ''}
        </p>
        {logsQ.hasNextPage && (
          <Button variant="outline" size="sm" onClick={() => logsQ.fetchNextPage()} disabled={logsQ.isFetchingNextPage || !online}>
            {logsQ.isFetchingNextPage && <Spinner className="h-4 w-4" />}
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
