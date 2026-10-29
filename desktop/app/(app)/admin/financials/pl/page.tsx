'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useBranchStore } from '@/store/branchStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { exportToCSV, exportToPDF } from '@/lib/exports';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FinancialSummary {
  grossIncome: number;
  productRevenue: number;
  serviceRevenue: number;
  productCogs: number;
  serviceDirectCosts: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

export default function PLReportPage() {
  const { selectedBranchId } = useBranchStore();
  const branchId = selectedBranchId || '';
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const { data: plData, isLoading } = useQuery({
    queryKey: ['financial-pl', branchId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('branchId', branchId);
      params.set('startDate', filters.startDate);
      params.set('endDate', filters.endDate);

      const res = await apiClient.get<FinancialSummary>(`/financials/pl?${params.toString()}`);
      return res;
    },
  });

  const handleExport = (format: 'pdf' | 'csv') => {
    if (!plData) return;

    const reportData = [
      { item: 'Product Revenue', amount: plData.productRevenue },
      { item: 'Service Revenue', amount: plData.serviceRevenue },
      { item: 'Gross Income', amount: plData.grossIncome },
      { item: 'Product COGS', amount: -plData.productCogs },
      { item: 'Service Direct Costs', amount: -plData.serviceDirectCosts },
      { item: 'Gross Profit', amount: plData.grossProfit },
      { item: 'Operating Expenses', amount: -plData.operatingExpenses },
      { item: 'Net Profit', amount: plData.netProfit },
    ];

    if (format === 'csv') {
      exportToCSV(`PL_Report_${filters.startDate}_to_${filters.endDate}`, reportData);
    } else {
      const rows = reportData.map(d => [d.item, naira(d.amount)]);
      exportToPDF(
        `PL_Report_${filters.startDate}_to_${filters.endDate}`,
        `Profit & Loss Report (${filters.startDate} to ${filters.endDate})`,
        ['Financial Item', 'Amount'],
        rows
      );
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Profit & Loss Report</h1>
          <p className="text-muted-foreground">Comprehensive financial overview for the selected period.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Export Report
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('pdf')}>
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>
              Export as CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : plData ? (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Financial Waterfall</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Financial Item</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Product Revenue</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(plData.productRevenue)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Service Revenue</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(plData.serviceRevenue)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Gross Income</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(plData.grossIncome)}</TableCell>
                  </TableRow>
                  <TableRow className="text-destructive">
                    <TableCell>Product COGS</TableCell>
                    <TableCell className="text-right tabular-nums">-{naira(plData.productCogs)}</TableCell>
                  </TableRow>
                  <TableRow className="text-destructive">
                    <TableCell>Service Direct Costs</TableCell>
                    <TableCell className="text-right tabular-nums">-{naira(plData.serviceDirectCosts)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Gross Profit</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(plData.grossProfit)}</TableCell>
                  </TableRow>
                  <TableRow className="text-destructive">
                    <TableCell>Operating Expenses</TableCell>
                    <TableCell className="text-right tabular-nums">-{naira(plData.operatingExpenses)}</TableCell>
                  </TableRow>
                  <TableRow className="bg-primary text-primary-foreground font-bold">
                    <TableCell>Net Profit</TableCell>
                    <TableCell className="text-right tabular-nums">{naira(plData.netProfit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center p-12 text-muted-foreground">No data available for the selected period.</div>
      )}
    </div>
  );
}
