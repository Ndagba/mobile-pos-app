'use client';

import React from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useBranchStore } from '@/store/branchStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { ReportContext } from '../ReportContext';

export default function SalesReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { dateFrom, dateTo, branchId } = React.useContext(ReportContext);
  const { useSales } = useAnalytics();

  const activeBranch = branchId || selectedBranchId || '';
  const { data, isLoading } = useSales(activeBranch, dateFrom, dateTo);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const sales = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {naira(sales.reduce((sum, s) => sum + s.revenue, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {naira(sales.reduce((sum, s) => sum + s.profit, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {sales.reduce((sum, s) => sum + s.transactions, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Profit</TableHead>
                <TableHead>Items Sold</TableHead>
                <TableHead>Transactions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No sales data for selected period.
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{s.date}</TableCell>
                    <TableCell className="font-medium">{naira(s.revenue)}</TableCell>
                    <TableCell className="text-emerald-600">{naira(s.profit)}</TableCell>
                    <TableCell>{s.items_sold}</TableCell>
                    <TableCell>{s.transactions}</TableCell>
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
