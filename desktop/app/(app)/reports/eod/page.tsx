'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { useBranchStore } from '@/store/branchStore';
import { useEodReport } from '@/hooks/useOpsReports';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReportActions } from '@/components/reports/ReportActions';
import type { ReportDoc } from '@/lib/reportExport';
import { rangeLabel } from '@/lib/reportPeriods';
import { ReportContext } from '../ReportContext';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  transfer: 'Transfer',
  mobile_wallet: 'Transfer (wallet)',
  split: 'Split payment',
  credit: 'Credit',
};
const methodLabel = (m: string) => METHOD_LABEL[m] ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : '—');

/**
 * End-of-day report (admin + manager — the Reports layout gates cashiers out).
 * Desktop counterpart of the mobile EOD screen on `GET /v1/reports/eod`: tender
 * totals for completed sales in the selected period and branch, plus the count
 * and value of voided sales. Uses the shared report filter bar and export bar.
 */
export default function EodReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { dateFrom, dateTo, branchId } = React.useContext(ReportContext);
  const activeBranch = branchId || selectedBranchId || '';

  const { data, isLoading, isError } = useEodReport({ dateFrom, dateTo, branchId: activeBranch || undefined });

  const payments = React.useMemo(
    () => [...(data?.payments ?? [])].sort((a, b) => b.total - a.total),
    [data?.payments]
  );
  const totalSales = payments.reduce((s, p) => s + p.total, 0);
  const totalCount = payments.reduce((s, p) => s + p.count, 0);
  const byMethod = (m: string) => payments.filter((p) => p.method === m).reduce((s, p) => s + p.total, 0);
  const voids = data?.voids ?? { count: 0, total: 0 };

  const buildDoc = React.useCallback((): ReportDoc | null => {
    if (!data || (payments.length === 0 && voids.count === 0)) return null;
    return {
      title: 'End of Day Report',
      meta: [
        { label: 'Period', value: dateFrom && dateTo ? rangeLabel(dateFrom, dateTo) : '—' },
        { label: 'Branch', value: activeBranch ? 'Selected branch' : 'All branches' },
        { label: 'Generated', value: new Date().toLocaleString() },
      ],
      summary: [
        { label: 'Total Sales', value: naira(totalSales) },
        { label: 'Transactions', value: String(totalCount) },
        { label: 'Voided', value: `${voids.count} (${naira(voids.total)})` },
      ],
      tables: [
        {
          heading: 'Sales by payment method',
          columns: [
            { label: 'Payment method' },
            { label: 'Transactions', type: 'number', align: 'right' },
            { label: 'Total', type: 'currency', align: 'right' },
          ],
          rows: payments.map((p) => [methodLabel(p.method), p.count, p.total]),
          totals: ['Totals', totalCount, totalSales],
        },
      ],
    };
  }, [data, payments, voids.count, voids.total, dateFrom, dateTo, activeBranch, totalSales, totalCount]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">End of Day</h2>
        <ReportActions getDoc={buildDoc} filenameBase="eod_report" disabled={isLoading} />
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Couldn&apos;t load the end-of-day report — check you&apos;re online.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="Total sales" value={naira(totalSales)} sub={`${totalCount} transaction${totalCount === 1 ? '' : 's'}`} />
            <Kpi label="Cash" value={naira(byMethod('cash'))} />
            <Kpi label="Card" value={naira(byMethod('card'))} />
            <Kpi label="Transfer" value={naira(byMethod('transfer') + byMethod('mobile_wallet'))} />
            <Kpi label="Voided" value={naira(voids.total)} sub={`${voids.count} sale${voids.count === 1 ? '' : 's'}`} tone="text-rose-600" />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment method</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No completed sales for the selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((p) => (
                      <TableRow key={p.method}>
                        <TableCell className="font-medium">{methodLabel(p.method)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.count}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{naira(p.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {totalSales > 0 ? `${((p.total / totalSales) * 100).toFixed(1)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Totals cover completed sales only; refunded and voided sales are listed under Voids &amp; refunds.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${tone ?? ''}`}>{value}</div>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
