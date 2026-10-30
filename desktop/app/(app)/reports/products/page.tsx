'use client';

import React from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useBranchStore } from '@/store/branchStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { cn } from '@/lib/utils';
import { ReportContext } from '../ReportContext';

type Period = 'daily' | 'weekly' | 'monthly';
type SortKey = 'revenue' | 'units' | 'profit';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'units', label: 'Units' },
  { key: 'profit', label: 'Profit' },
];

export default function ProductReportPage() {
  const { selectedBranchId } = useBranchStore();
  const { branchId } = React.useContext(ReportContext);
  const { useTopProducts } = useAnalytics();

  const [period, setPeriod] = React.useState<Period>('daily');
  const [sort, setSort] = React.useState<SortKey>('revenue');

  const activeBranch = branchId || selectedBranchId || '';
  const { data, isLoading } = useTopProducts(activeBranch, period);

  const products = React.useMemo(() => {
    const rows = [...(data ?? [])];
    rows.sort((a, b) => {
      if (sort === 'units') return b.total_sold - a.total_sold;
      if (sort === 'profit') return b.profit - a.profit;
      return b.total_revenue - a.total_revenue;
    });
    return rows;
  }, [data, sort]);

  const totalRevenue = products.reduce((s, p) => s + p.total_revenue, 0);
  const totalUnits = products.reduce((s, p) => s + p.total_sold, 0);
  const totalProfit = products.reduce((s, p) => s + p.profit, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={period === p.key ? 'default' : 'outline'}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort by</span>
          {SORTS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={sort === s.key ? 'default' : 'outline'}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
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
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{naira(totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Units Sold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUnits}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{naira(totalProfit)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No product sales for selected period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((p, i) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                        <TableCell>
                          <span className="font-medium">{p.name}</span>
                          {p.sku && <span className="ml-2 text-xs text-muted-foreground">{p.sku}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.total_sold}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{naira(p.total_revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.transaction_count}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {naira(p.profit)}
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
