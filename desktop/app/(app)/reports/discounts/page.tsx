'use client';

import React from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useBranchStore } from '@/store/branchStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { ReportActions } from '@/components/reports/ReportActions';
import type { ReportDoc } from '@/lib/reportExport';
import { rangeLabel } from '@/lib/reportPeriods';
import { ReportContext } from '../ReportContext';

export default function DiscountReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { dateFrom, dateTo, branchId } = React.useContext(ReportContext);
  const { useDiscounts } = useAnalytics();

  const activeBranch = branchId || selectedBranchId || '';
  const { data, isLoading } = useDiscounts(activeBranch, dateFrom, dateTo);

  const rows = data ?? [];
  const totalDiscount = rows.reduce((s, d) => s + d.total_discount, 0);
  const totalCount = rows.reduce((s, d) => s + d.discount_count, 0);
  const totalRevenue = rows.reduce((s, d) => s + d.associated_revenue, 0);

  const buildDoc = React.useCallback((): ReportDoc | null => {
    if (rows.length === 0) return null;
    const period = dateFrom && dateTo ? rangeLabel(dateFrom, dateTo) : 'All time';
    return {
      title: 'Discount Analysis Report',
      meta: [
        { label: 'Period', value: period },
        { label: 'Branch', value: activeBranch ? 'Selected branch' : 'All branches' },
        { label: 'Generated', value: new Date().toLocaleString() },
      ],
      summary: [
        { label: 'Total Discount Given', value: naira(totalDiscount) },
        { label: 'Discounted Txns', value: String(totalCount) },
        { label: 'Associated Revenue', value: naira(totalRevenue) },
      ],
      tables: [
        {
          heading: 'Cashier Discounts',
          columns: [
            { label: 'Cashier' },
            { label: 'Discounted Txns', type: 'number', align: 'right' },
            { label: 'Total Discount', type: 'currency', align: 'right' },
            { label: 'Associated Revenue', type: 'currency', align: 'right' },
          ],
          rows: rows.map((d) => [d.cashier_name, d.discount_count, d.total_discount, d.associated_revenue]),
          totals: ['Totals', totalCount, totalDiscount, totalRevenue],
        },
      ],
    };
  }, [rows, dateFrom, dateTo, activeBranch, totalDiscount, totalCount, totalRevenue]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Discount Analysis</h2>
        <ReportActions getDoc={buildDoc} filenameBase="discount_report" disabled={isLoading} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Discount Given</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-rose-600">{naira(totalDiscount)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Discounted Txns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Associated Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{naira(totalRevenue)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cashier</TableHead>
                    <TableHead className="text-right">Discounted Txns</TableHead>
                    <TableHead className="text-right">Total Discount</TableHead>
                    <TableHead className="text-right">Associated Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        No discount data for selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((d) => (
                      <TableRow key={d.user_id}>
                        <TableCell className="font-medium">{d.cashier_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.discount_count}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-rose-600">
                          {naira(d.total_discount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{naira(d.associated_revenue)}</TableCell>
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
