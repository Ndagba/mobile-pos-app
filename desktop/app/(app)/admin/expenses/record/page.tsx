'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { naira } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { useBranchStore } from '@/store/branchStore';
import { useAuthStore } from '@/store/authStore';
import { useUsers } from '@/hooks/useUsers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface ExpenseCategory {
  id: string;
  name: string;
}

interface ExpenseRow {
  id: string;
  amount: number | string;
  description: string | null;
  expenseDate: string;
  paymentMethod: string;
  status: string;
  createdBy?: string | null;
  category_id?: string | null;
  category: { name: string };
}

/** A fixed palette assigned to categories in load order (stable per session). */
const CAT_COLORS = ['#6E56F7', '#F59E0B', '#2563EB', '#10B981', '#EC4899', '#8B5CF6', '#14B8A6', '#EF4444'];

function fmtDay(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function payLabel(m: string): string {
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : '—';
}

export default function RecordExpensePage() {
  const queryClient = useQueryClient();
  const { selectedBranchId } = useBranchStore();
  const { user } = useAuthStore();
  const branchId = selectedBranchId || user?.branch_id || '';

  const [form, setForm] = useState({
    category_id: '',
    amount: '',
    description: '',
    paymentMethod: 'cash' as 'cash' | 'transfer' | 'card',
  });
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Current-month window for the summary + list.
  const { monthStart, monthEnd, monthLabel } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return {
      monthStart: start.toISOString(),
      monthEnd: end.toISOString(),
      monthLabel: now.toLocaleDateString(undefined, { month: 'long' }),
    };
  }, []);

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['expense-categories', branchId],
    queryFn: () => apiClient.get<ExpenseCategory[]>(`/expenses/categories?branchId=${branchId}`),
  });

  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ['expenses-month', branchId, monthStart, monthEnd],
    queryFn: () => {
      const params = new URLSearchParams({ branchId, startDate: monthStart, endDate: monthEnd });
      return apiClient.get<ExpenseRow[]>(`/expenses?${params.toString()}`);
    },
    enabled: !!branchId,
  });

  const usersQ = useUsers();

  const userName = (id?: string | null) => {
    if (!id) return '—';
    const u = (usersQ.data ?? []).find((x) => x.id === id);
    return u ? `${u.first_name} ${u.last_name}`.trim() : '—';
  };

  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c, i) => map.set(c.name, CAT_COLORS[i % CAT_COLORS.length]));
    return (name: string) => map.get(name) ?? '#94A3B8';
  }, [categories]);

  // Month totals by category for the summary bar + legend.
  const summary = useMemo(() => {
    const byCat = new Map<string, number>();
    let total = 0;
    for (const e of expenses) {
      const amt = Number(e.amount) || 0;
      total += amt;
      byCat.set(e.category.name, (byCat.get(e.category.name) ?? 0) + amt);
    }
    const legend = [...byCat.entries()]
      .map(([name, amount]) => ({ name, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
    return { total, legend };
  }, [expenses]);

  const visible = useMemo(() => {
    if (categoryFilter === 'all') return expenses;
    return expenses.filter((e) => e.category_id === categoryFilter);
  }, [expenses, categoryFilter]);

  const record = useMutation({
    mutationFn: (data: any) => apiClient.post('/expenses', data),
    onSuccess: () => {
      toast.success('Expense recorded');
      setForm({ category_id: '', amount: '', description: '', paymentMethod: 'cash' });
      queryClient.invalidateQueries({ queryKey: ['expenses-month'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not record the expense.'),
  });

  const amountNum = Number(form.amount);
  const canSave = !!form.category_id && amountNum > 0 && !record.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    record.mutate({
      category_id: form.category_id,
      amount: amountNum,
      description: form.description,
      expenseDate: new Date().toISOString().split('T')[0],
      paymentMethod: form.paymentMethod,
      branch_id: branchId,
      createdBy: user?.id || 'system',
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Expenses"
        subtitle="Record running costs as they happen — they feed straight into Profit & loss."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary + list */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {monthLabel} total
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">
                  {naira(summary.total)}
                </p>
              </div>
              <span className="text-xs text-text-muted">{expenses.length} expense(s)</span>
            </div>

            {summary.total > 0 && (
              <>
                <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-pill bg-surface-subtle">
                  {summary.legend.map((c) => (
                    <div
                      key={c.name}
                      style={{ width: `${c.pct}%`, background: colorFor(c.name) }}
                      title={`${c.name}: ${naira(c.amount)}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {summary.legend.map((c) => (
                    <span key={c.name} className="inline-flex items-center gap-1.5 text-xs">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ background: colorFor(c.name) }}
                      />
                      <span className="text-ink-2">{c.name}</span>
                      <span className="font-semibold tabular-nums text-ink">{naira(c.amount)}</span>
                      <span className="text-text-muted">{c.pct.toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="overflow-hidden">
            {/* Category filter chips */}
            <div className="flex flex-wrap gap-1.5 border-b border-divider px-4 py-3">
              <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
                All
              </FilterChip>
              {categories.map((c) => (
                <FilterChip
                  key={c.id}
                  active={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(c.id)}
                >
                  {c.name}
                </FilterChip>
              ))}
            </div>

            {expLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            ) : visible.length === 0 ? (
              <p className="py-12 text-center text-sm text-text-muted">
                No expenses recorded this month.
              </p>
            ) : (
              <ul>
                {visible.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-0"
                  >
                    <span className="w-12 shrink-0 text-xs text-text-muted">
                      {fmtDay(e.expenseDate)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {e.description || '—'}
                    </span>
                    <span className="hidden w-28 shrink-0 items-center gap-1.5 text-xs text-text-muted sm:flex">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: colorFor(e.category.name) }}
                      />
                      <span className="truncate">{e.category.name}</span>
                    </span>
                    <span className="hidden w-16 shrink-0 text-xs text-text-muted md:block">
                      {payLabel(e.paymentMethod)}
                    </span>
                    <span className="hidden w-24 shrink-0 truncate text-xs text-text-muted lg:block">
                      {userName(e.createdBy)}
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                      {naira(Number(e.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Record expense form */}
        <Card className="h-fit p-5">
          <h2 className="mb-4 text-md font-bold text-ink">Record expense</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What was this for?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
                  ₦
                </span>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              {catsLoading ? (
                <p className="text-sm text-text-muted">Loading…</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-text-muted">
                  No categories yet — add one under Manage categories.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <FilterChip
                      key={c.id}
                      active={form.category_id === c.id}
                      onClick={() => setForm({ ...form, category_id: c.id })}
                      type="button"
                    >
                      {c.name}
                    </FilterChip>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <Segmented
                className="w-full"
                value={form.paymentMethod}
                onChange={(v) => setForm({ ...form, paymentMethod: v })}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'transfer', label: 'Transfer' },
                  { value: 'card', label: 'Card' },
                ]}
              />
            </div>

            <Button type="submit" className="w-full" disabled={!canSave}>
              {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save expense
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

/** A pill filter/selection chip used for the category filter and the form picker. */
function FilterChip({
  active,
  onClick,
  children,
  type = 'button',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  type?: 'button';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border-strong text-text-muted hover:bg-surface-subtle'
      )}
    >
      {children}
    </button>
  );
}
