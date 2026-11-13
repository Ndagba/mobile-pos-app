'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { useBranchStore } from '@/store/branchStore';
import { useVoidsReport } from '@/hooks/useOpsReports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReportActions } from '@/components/reports/ReportActions';
import type { ReportDoc } from '@/lib/reportExport';
import { rangeLabel } from '@/lib/reportPeriods';
import { ReportContext } from '../ReportContext';

type StatusFilter = 'all' | 'voided' | 'refunded';

function fmtWhen(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Voids & refunds report (admin + manager — the Reports layout gates cashiers
 * out). Desktop counterpart of the "Voids & Refunds" tab on the mobile EOD screen,
 * on `GET /v1/reports/voids`: every voided or refunded sale in the period, who
 * rang it up, who reversed it and why.
 */
export default function VoidsReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { dateFrom, dateTo, branchId } = React.useContext(ReportContext);
  const activeBranch = branchId || selectedBranchId || '';
  const [status, setStatus] = React.useState<StatusFilter>('all');

  const { data, isLoading, isError } = useVoidsReport({ dateFrom, dateTo, branchId: activeBranch || undefined });

  const all = React.useMemo(() => data ?? [], [data]);
  const rows = React.useMemo(() => (status === 'all' ? all : all.filter((r) => r.status === status)), [all, status]);

  const sum = (s: string) => all.filter((r) => r.status === s).reduce((t, r) => t + r.total_amount, 0);
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const visibleTotal = rows.reduce((t, r) => t + r.total_amount, 0);

  const buildDoc = React.useCallback((): ReportDoc | null => {
    if (rows.length === 0) return null;
    return {
      title: 'Voids & Refunds Report',
      meta: [
        { label: 'Period', value: dateFrom && dateTo ? rangeLabel(dateFrom, dateTo) : '—' },
        { label: 'Branch', value: activeBranch ? 'Selected branch' : 'All branches' },
        { label: 'Generated', value: new Date().toLocaleString() },
      ],
      summary: [
        { label: 'Voided', value: `${count('voided')} (${naira(sum('voided'))})` },
        { label: 'Refunded', value: `${count('refunded')} (${naira(sum('refunded'))})` },
      ],
      tables: [
        {
          heading: status === 'all' ? 'Voided and refunded sales' : status === 'voided' ? 'Voided sales' : 'Refunded sales',
          columns: [
            { label: 'Date' },
            { label: 'Receipt' },
            { label: 'Status' },
            { label: 'Cashier' },
            { label: 'Reversed by' },
            { label: 'Reason' },
            { label: 'Amount', type: 'currency', align: 'right' },
          ],
          rows: rows.map((r) => [
            fmtWhen(r.created_at),
            r.receipt_number ?? `#${r.id.slice(-8).toUpperCase()}`,
            r.status,
            r.cashier || '—',
            r.voided_by || '—',
            r.void_reason ?? '',
            r.total_amount,
          ]),
          totals: ['Total', '', '', '', '', '', visibleTotal],
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, all, status, dateFrom, dateTo, activeBranch, visibleTotal]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Voids &amp; Refunds</h2>
        <ReportActions getDoc={buildDoc} filenameBase="voids_refunds_report" disabled={isLoading} />
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Couldn&apos;t load voids and refunds — check you&apos;re online.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi label="Voided" value={naira(sum('voided'))} sub={`${count('voided')} sale${count('voided') === 1 ? '' : 's'}`} />
            <Kpi label="Refunded" value={naira(sum('refunded'))} sub={`${count('refunded')} sale${count('refunded') === 1 ? '' : 's'}`} />
            <Kpi label="Total reversed" value={naira(sum('voided') + sum('refunded'))} sub={`${all.length} in period`} />
          </div>

          <div className="flex gap-1">
            {(['all', 'voided', 'refunded'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  status === s
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {s === 'all' ? 'All' : s === 'voided' ? 'Voided' : 'Refunded'}
              </button>
            ))}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Reversed by</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No voided or refunded sales for the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{fmtWhen(r.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.receipt_number ?? `#${r.id.slice(-8).toUpperCase()}`}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                              r.status === 'voided' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </TableCell>
                        <TableCell>{r.cashier || '—'}</TableCell>
                        <TableCell>{r.voided_by || '—'}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-muted-foreground" title={r.void_reason ?? undefined}>
                          {r.void_reason || '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-rose-600">
                          {naira(r.total_amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
