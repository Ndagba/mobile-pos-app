'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  Eye,
  EyeOff,
  Banknote,
  Receipt,
  Ticket,
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { naira } from '@jaypos/shared';
import { useAuthStore } from '@/store/authStore';
import { usePrefsStore } from '@/store/prefsStore';
import { useLowStock } from '@/hooks/useLowStock';
import type { SalesReportData } from '@/hooks/useAnalytics';
import { DashboardData } from '@/types/analytics';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { buttonVariants } from '@/components/ui/button';
import { WeekBars } from '@/components/dashboard/WeekBars';
import { cn } from '@/lib/utils';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Local `YYYY-MM-DD` key (so day bucketing lines up with the user's calendar). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function payLabel(m: string): string {
  if (m === 'mobile_wallet') return 'Wallet';
  if (m === 'split') return 'Split';
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const hideAmounts = usePrefsStore((s) => s.hideAmounts);
  const toggleHide = usePrefsStore((s) => s.toggleHideAmounts);
  const [range, setRange] = React.useState<'today' | 'week'>('today');

  const role = user?.role ?? '';
  const isCashier = role === 'cashier';
  const isManager = role === 'manager';

  const money = (n: number) => (hideAmounts ? '₦ ••••••' : naira(n));

  // Dashboard figures. The backend scopes this by role already: a cashier sees
  // only their own sales (user_id), a manager only their assigned branches, an
  // admin the whole store — so no extra client scoping is needed here.
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => apiClient.get<DashboardData>('/analytics/dashboard'),
  });

  // 14-day daily series for the Sales-performance chart (this week vs last week).
  // `/analytics/sales` carries the same role/branch scoping as the dashboard.
  const window14 = React.useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - 13);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const salesQ = useQuery({
    queryKey: ['dashboard-sales-14', window14.from, window14.to],
    queryFn: () =>
      apiClient.get<SalesReportData>(
        `/analytics/sales?dateFrom=${encodeURIComponent(window14.from)}&dateTo=${encodeURIComponent(window14.to)}`
      ),
  });

  const lowStockQ = useLowStock({});

  const series = React.useMemo(() => {
    const byDay = new Map<string, number>();
    (salesQ.data ?? []).forEach((r) => byDay.set(ymd(new Date(r.date)), r.revenue));
    const thisWeek: number[] = [];
    const lastWeek: number[] = [];
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const tw = new Date();
      tw.setDate(tw.getDate() - (6 - i));
      const lw = new Date();
      lw.setDate(lw.getDate() - (13 - i));
      thisWeek.push(byDay.get(ymd(tw)) ?? 0);
      lastWeek.push(byDay.get(ymd(lw)) ?? 0);
      labels.push(tw.toLocaleDateString(undefined, { weekday: 'short' }));
    }
    const thisTotal = thisWeek.reduce((a, b) => a + b, 0);
    const lastTotal = lastWeek.reduce((a, b) => a + b, 0);
    const delta = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : null;
    return { thisWeek, lastWeek, labels, thisTotal, lastTotal, delta };
  }, [salesQ.data]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const revenue =
    range === 'today' ? data?.total_revenue ?? 0 : data?.weekly_revenue ?? data?.total_revenue ?? 0;

  // Cashiers get a sales-only fourth card (Items sold) instead of profit/margin.
  const fourth = isCashier
    ? {
        label: 'Items sold',
        value: String(data?.total_items_sold ?? 0),
        sub: 'Today',
        icon: <Package className="h-4 w-4" />,
      }
    : {
        label: 'Gross profit',
        value: money(data?.total_profit ?? 0),
        sub: `${(data?.profit_margin ?? 0).toFixed(1)}% margin`,
        icon: <TrendingUp className="h-4 w-4" />,
      };

  const kpis = [
    {
      label: 'Total sales',
      value: money(revenue),
      sub: range === 'today' ? 'Today' : 'Last 7 days',
      icon: <Banknote className="h-4 w-4" />,
    },
    {
      label: 'Transactions',
      value: String(data?.transaction_count ?? 0),
      sub: 'Today',
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      label: 'Average ticket',
      value: money(data?.avg_transaction ?? 0),
      sub: 'Per sale',
      icon: <Ticket className="h-4 w-4" />,
    },
    fourth,
  ];

  const recent = (data?.recent_transactions ?? []).slice(0, 6);
  const topProducts = (data?.top_products ?? []).slice(0, 5);
  const maxRev = Math.max(1, ...topProducts.map((p) => p.total_revenue));
  const lowStock = (lowStockQ.data ?? []).slice(0, 6);

  const scopeNote = isCashier
    ? 'Your sales activity'
    : isManager
      ? 'Your branch'
      : 'All branches';

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}, ${user?.first_name ?? ''}`.trim()}
        subtitle={`${new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })} · ${scopeNote}`}
        actions={
          <div className="flex items-center gap-2">
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'week', label: '7 days' },
              ]}
            />
            <button
              type="button"
              onClick={toggleHide}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-ink-2 hover:bg-surface-subtle"
            >
              {hideAmounts ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {hideAmounts ? 'Show figures' : 'Hide figures'}
            </button>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {k.label}
                </p>
                <p className="mt-2 font-mono text-kpi font-bold tabular-nums text-ink">{k.value}</p>
                <p className="mt-1 text-xs text-text-muted">{k.sub}</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                {k.icon}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Sales performance + top sellers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-md font-bold text-ink">Sales performance</h2>
              <p className="font-mono text-xl font-bold tabular-nums text-ink">
                {money(series.thisTotal)}
              </p>
              <p className="text-xs text-text-muted">Last 7 days</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {series.delta !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-2xs font-semibold',
                    series.delta >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                  )}
                >
                  {series.delta >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(series.delta).toFixed(1)}% vs last week
                </span>
              )}
              <div className="flex items-center gap-3 text-2xs text-text-muted">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary" /> This week
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary/25" /> Last week
                </span>
              </div>
            </div>
          </div>
          <div className="h-48">
            {salesQ.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <WeekBars
                thisWeek={series.thisWeek}
                lastWeek={series.lastWeek}
                labels={series.labels}
                hideAmounts={hideAmounts}
              />
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
            <h2 className="text-md font-bold text-ink">Top sellers</h2>
            <span className="text-2xs text-text-muted">by revenue</span>
          </div>
          <div className="divide-y divide-divider">
            {topProducts.map((p) => (
              <div key={p.id} className="px-5 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-2">{p.name}</span>
                  <span className="font-mono tabular-nums font-semibold text-ink">
                    {money(p.total_revenue)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-subtle">
                    <div
                      className="h-full rounded-pill bg-primary"
                      style={{ width: `${(p.total_revenue / maxRev) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-2xs text-text-muted">{p.total_sold ?? 0} sold</span>
                </div>
              </div>
            ))}
            {topProducts.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-text-muted">No sales yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent transactions + stock alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
            <h2 className="text-md font-bold text-ink">Recent transactions</h2>
            <Link
              href="/sales/history"
              className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            {recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-text-muted">No transactions yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
                  <tr className="border-b border-divider">
                    <th className="px-5 py-2.5">Receipt</th>
                    <th className="px-5 py-2.5">Customer</th>
                    {!isCashier && <th className="px-5 py-2.5">Cashier</th>}
                    <th className="px-5 py-2.5">Payment</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => {
                    const refunded = t.status === 'refunded';
                    return (
                      <tr key={t.id} className="border-b border-divider last:border-0">
                        <td className="px-5 py-2.5 font-medium text-ink-2">
                          {t.receipt_number ?? '—'}
                        </td>
                        <td className="px-5 py-2.5 text-text-muted">{t.customer ?? 'Walk-in'}</td>
                        {!isCashier && (
                          <td className="px-5 py-2.5 text-text-muted">{t.cashier}</td>
                        )}
                        <td className="px-5 py-2.5 text-text-muted">
                          {payLabel(t.payment_method)}
                          {refunded && <span className="ml-1 text-danger">· refunded</span>}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-2.5 text-right font-mono tabular-nums font-semibold',
                            refunded ? 'text-danger' : 'text-ink'
                          )}
                        >
                          {refunded ? '−' : ''}
                          {money(t.total_amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
            <h2 className="text-md font-bold text-ink">Stock alerts</h2>
            <span className="text-2xs text-text-muted">items</span>
          </div>
          <div className="divide-y divide-divider">
            {lowStock.map((it) => {
              const out = it.current_quantity <= 0;
              return (
                <div
                  key={it.product_id}
                  className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-2">{it.product_name}</p>
                    <p className="text-2xs text-text-muted">
                      reorder at {it.reorder_point ?? it.low_stock_threshold}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-xs font-semibold',
                      out ? 'text-danger' : 'text-warning'
                    )}
                  >
                    {out ? 'Out of stock' : `${it.current_quantity} left`}
                  </span>
                </div>
              );
            })}
            {lowStock.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-text-muted">
                Stock levels look healthy.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
