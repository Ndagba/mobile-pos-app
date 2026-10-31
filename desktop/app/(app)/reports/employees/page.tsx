'use client';

import React from 'react';
import Link from 'next/link';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useBranchStore } from '@/store/branchStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { ReportActions } from '@/components/reports/ReportActions';
import type { ReportDoc } from '@/lib/reportExport';
import { rangeLabel } from '@/lib/reportPeriods';
import { ReportContext } from '../ReportContext';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Cashier',
};

export default function EmployeeReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { dateFrom, dateTo, branchId } = React.useContext(ReportContext);
  const { useEmployeePerformance } = useAnalytics();

  const activeBranch = branchId || selectedBranchId || '';
  const { data, isLoading } = useEmployeePerformance(activeBranch, dateFrom, dateTo);

  const staff = data ?? [];
  const totalRevenue = staff.reduce((s, e) => s + e.total_revenue, 0);
  const totalTxns = staff.reduce((s, e) => s + e.transaction_count, 0);

  const buildDoc = React.useCallback((): ReportDoc | null => {
    if (staff.length === 0) return null;
    const period = dateFrom && dateTo ? rangeLabel(dateFrom, dateTo) : 'All time';
    return {
      title: 'Employee Activity Report',
      meta: [
        { label: 'Period', value: period },
        { label: 'Branch', value: activeBranch ? 'Selected branch' : 'All branches' },
        { label: 'Generated', value: new Date().toLocaleString() },
      ],
      summary: [
        { label: 'Staff', value: String(staff.length) },
        { label: 'Total Revenue', value: naira(totalRevenue) },
        { label: 'Transactions', value: String(totalTxns) },
      ],
      tables: [
        {
          heading: 'Employees',
          columns: [
            { label: 'Employee' },
            { label: 'Role' },
            { label: 'Transactions', type: 'number', align: 'right' },
            { label: 'Revenue', type: 'currency', align: 'right' },
            { label: 'Avg Sale', type: 'currency', align: 'right' },
          ],
          rows: staff.map((e) => [
            `${e.first_name} ${e.last_name}`.trim(),
            ROLE_LABEL[e.role] ?? e.role,
            e.transaction_count,
            e.total_revenue,
            e.avg_transaction,
          ]),
          totals: ['Totals', '', totalTxns, totalRevenue, ''],
        },
      ],
    };
  }, [staff, dateFrom, dateTo, activeBranch, totalRevenue, totalTxns]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Employee Activity</h2>
        <ReportActions getDoc={buildDoc} filenameBase="employee_activity_report" disabled={isLoading} />
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
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Staff</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{staff.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{naira(totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTxns}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg Sale</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No performance data for selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    staff.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">
                          {`${e.first_name} ${e.last_name}`.trim() || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{ROLE_LABEL[e.role] ?? e.role}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.transaction_count}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{naira(e.total_revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{naira(e.avg_transaction)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Link href={`/reports/employees/${e.id}`}>
                              <Button size="sm" variant="ghost">View Report</Button>
                            </Link>
                            <Link href={`/reports/employees/${e.id}?print=1`} target="_blank">
                              <Button size="sm" variant="ghost">Print Report</Button>
                            </Link>
                          </div>
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
