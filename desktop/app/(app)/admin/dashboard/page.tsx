'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { DashboardData } from '@/types/analytics';
import { Sparkline } from '@/components/dashboard/Sparkline';
import { KpiTile } from '@/components/dashboard/KpiTile';
import { PaymentBar } from '@/components/dashboard/PaymentBar';
import { FinancialQuickView } from '@/components/dashboard/FinancialQuickView';

export default function DashboardPage() {
  const { selectedBranchId } = useBranchStore();
  const { user } = useAuthStore();
  const branchId = selectedBranchId || '';
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [showValues, setShowValues] = useState(false);
  const isCashier = user?.role === 'cashier';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', branchId, range],
    queryFn: async () => {
      const params = branchId ? `?branch_id=${branchId}` : '';
      return await apiClient.get<DashboardData>(`/analytics/dashboard${params}`);
    },
  });

  const payTotal = data?.payment_breakdown?.reduce((sum: number, p) => sum + p.total, 0) ?? 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isCashier ? 'My Sales Activity' : 'Command Center'}
          </h1>
          <p className="text-muted-foreground">
            {isCashier
              ? 'Your personal sales performance and transactions.'
              : 'Real-time business performance overview.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowValues(!showValues)}
            className="gap-2"
            title={showValues ? 'Hide sales figures' : 'Show sales figures'}
          >
            {showValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showValues ? 'Hide Values' : 'Show Values'}
          </Button>
          <Button variant="outline" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          {!isCashier && (
            <Button className="gap-2" onClick={() => window.location.href = '/admin/expenses/record'}>
              <Plus className="h-4 w-4" /> Quick Record
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-12 lg:col-span-8 overflow-hidden border-none shadow-lg">
          <div className="bg-gradient-to-br from-primary to-primary-dark p-6 text-primary-foreground relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute right-20 bottom-0 w-32 h-32 bg-white/5 rounded-full blur-2xl" />

            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest opacity-80">
                    {range === 'today' ? 'Sales Today' : 'Sales This Week'}
                  </span>
                  <div className="flex bg-black/20 rounded-full p-1 text-xs font-medium">
                    <button
                      onClick={() => setRange('today')}
                      className={`px-3 py-1 rounded-full transition-all ${range === 'today' ? 'bg-white text-primary' : 'text-white/70'}`}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => setRange('week')}
                      className={`px-3 py-1 rounded-full transition-all ${range === 'week' ? 'bg-white text-primary' : 'text-white/70'}`}
                    >
                      Week
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-baseline gap-3 mb-6">
                <span className="text-5xl font-black tabular-nums">
                  {showValues
                    ? `₦${Math.round(range === 'today' ? (data?.total_revenue ?? 0) : (data?.weekly_revenue ?? 0)).toLocaleString()}`
                    : '₦••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowValues(!showValues)}
                  className="p-1 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white"
                  title={showValues ? 'Hide revenue' : 'Show revenue'}
                >
                  {showValues ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                <span className="text-primary-foreground/70 font-medium text-lg">
                  {isCashier ? 'My Revenue' : 'Total Revenue'}
                </span>
              </div>

              <div className="h-24 w-full">
                <Sparkline
                  data={range === 'today' ? [10, 15, 8, 20, 25, 18, 30] : [40, 60, 45, 80, 70, 90, 110]}
                  color="rgba(255,255,255,0.9)"
                  height={80}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardHeader>
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium">API Connection</span>
              </div>
              <span className="text-xs text-muted-foreground">Online</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Sync Queue</span>
              </div>
              <span className="text-xs font-bold text-primary">0 Pending</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile
          icon="cash-multiple" tone="#10B981" label="Revenue"
          value={showValues ? naira(data?.total_revenue ?? 0) : '₦••••••'}
          sub={`${data?.transaction_count ?? 0} sales`}
        />
        <KpiTile
          icon="trending-up" tone="#3B82F6" label="Avg Ticket"
          value={showValues ? naira(data?.avg_transaction ?? 0) : '₦••••••'}
          sub="per transaction"
        />
        <KpiTile
          icon="package-variant" tone="#F59E0B" label="Items Sold"
          value={String(data?.total_items_sold ?? 0)}
          sub="units today"
        />
        <KpiTile
          icon="alert-circle" tone="#F43F5E" label="Low Stock"
          value={String(data?.low_stock_count ?? 0)}
          sub="needs reorder"
        />
        <KpiTile
          icon="chart-donut" tone="#8B5CF6" label="Profit Margin"
          value={`${(data?.profit_margin ?? 0).toFixed(1)}%`}
          sub={showValues ? `₦${Math.round(data?.total_profit ?? 0).toLocaleString()} net` : '₦•••••• net'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentBar breakdown={data?.payment_breakdown ?? []} totalAmount={payTotal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.top_products?.slice(0, 5).map((p, i) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold text-muted-foreground w-8">{i + 1}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {showValues ? naira(p.total_revenue) : '₦••••••'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.recent_transactions?.slice(0, 5).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${t.status === 'refunded' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span className="text-sm">{t.item_count} items · {t.payment_method}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.cashier}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {showValues
                        ? `${t.status === 'refunded' ? `-` : `+`}${naira(t.total_amount)}`
                        : (t.status === 'refunded' ? '-₦••••••' : '+₦••••••')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <FinancialQuickView
          showValues={showValues}
          data={{
            grossIncome: data?.total_revenue ?? 0,
            operatingExpenses: 0,
            netProfit: data?.total_profit ?? 0,
          }}
        />
      </div>
    </div>
  );
}
