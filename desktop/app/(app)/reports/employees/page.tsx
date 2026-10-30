'use client';

import React from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useBranchStore } from '@/store/branchStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const staff = data ?? [];
  const totalRevenue = staff.reduce((s, e) => s + e.total_revenue, 0);
  const totalTxns = staff.reduce((s, e) => s + e.transaction_count, 0);

  return (
    <div className="space-y-6">
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
