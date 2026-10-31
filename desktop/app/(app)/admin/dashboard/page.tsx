'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { naira } from '@jaypos/shared';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { usePrefsStore } from '@/store/prefsStore';
import { DashboardData } from '@/types/analytics';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Sparkline } from '@/components/dashboard/Sparkline';
import { PaymentBar } from '@/components/dashboard/PaymentBar';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { selectedBranchId } = useBranchStore();
  const { user } = useAuthStore();
  const hideAmounts = usePrefsStore((s) => s.hideAmounts);
  const toggleHide = usePrefsStore((s) => s.toggleHideAmounts);
  const branchId = selectedBranchId || '';
  const [range, setRange] = React.useState<'today' | 'week'>('today');
  const isCashier = user?.role === 'cashier';

  const money = (n: number) => (hideAmounts ? '₦ ••••••' : naira(n));

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', branchId, range],
    queryFn: async () => {
      const params = branchId ? `?branch_id=${branchId}` : '';
      return await apiClient.get<DashboardData>(`/analytics/dashboard${params}`);
    },
  });

  const payTotal = data?.payment_breakdown?.reduce((sum, p) => sum + p.total, 0) ?? 0;
  const revenue = range === 'today' ? data?.total_revenue ?? 0 : data?.weekly_revenue ?? data?.total_revenue ?? 0;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    { label: 'Total sales', value: money(revenue), sub: `${data?.transaction_count ?? 0} transactions` },
    { label: 'Transactions', value: String(data?.transaction_count ?? 0), sub: 'this period' },
    { label: 'Average ticket', value: money(data?.avg_transaction ?? 0), sub: 'per sale' },
    { label: 'Gross profit', value: money(data?.total_profit ?? 0), sub: `${(data?.profit_margin ?? 0).toFixed(1)}% margin` },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting()}, ${user?.first_name ?? ''}`.trim()}
        subtitle={
          isCashier
            ? 'Your personal sales performance and transactions.'
            : new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })
        }
        actions={
          <div className="flex items-center gap-2">
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={[{ value: 'today', label: 'Today' }, { value: 'week', label: '7 days' }]}
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
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{k.label}</p>
            <p className="mt-2 font-mono text-kpi font-bold tabular-nums text-ink">{k.value}</p>
            <p className="mt-1 text-xs text-text-muted">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* Sales performance + payment mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-md font-bold text-ink">Sales performance</h2>
              <p className="font-mono text-xl font-bold tabular-nums text-ink">{money(revenue)}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success">
              <TrendingUp className="h-3 w-3" /> live
            </span>
          </div>
          <div className="h-40 w-full">
            <Sparkline
              data={range === 'today' ? [10, 15, 8, 20, 25, 18, 30] : [40, 60, 45, 80, 70, 90, 110]}
              color="#6E56F7"
              height={150}
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-md font-bold text-ink">Payment mix</h2>
          <PaymentBar breakdown={data?.payment_breakdown ?? []} totalAmount={payTotal} />
        </Card>
      </div>

      {/* Recent + top sellers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-divider px-5 py-3.5">
            <h2 className="text-md font-bold text-ink">Recent transactions</h2>
          </div>
          <div className="divide-y divide-divider">
            {(data?.recent_transactions ?? []).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-pill ${t.status === 'refunded' ? 'bg-danger' : 'bg-success'}`} />
                  <span className="text-ink-2">{t.item_count} items · <span className="capitalize text-text-muted">{t.payment_method}</span></span>
                </div>
                <span className="font-mono tabular-nums font-semibold text-ink">
                  {t.status === 'refunded' ? '−' : ''}{money(t.total_amount)}
                </span>
              </div>
            ))}
            {(data?.recent_transactions ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-text-muted">No transactions yet.</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-divider px-5 py-3.5">
            <h2 className="text-md font-bold text-ink">Top sellers</h2>
          </div>
          <div className="divide-y divide-divider">
            {(data?.top_products ?? []).slice(0, 6).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-5 font-mono text-text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink-2">{p.name}</span>
                <span className="font-mono tabular-nums font-semibold text-ink">{money(p.total_revenue)}</span>
              </div>
            ))}
            {(data?.top_products ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-text-muted">No sales yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
