'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Download } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { useBranchStore } from '@/store/branchStore';
import { useBranches } from '@/hooks/useBranches';
import { useAnalytics } from '@/hooks/useAnalytics';
import { exportToCSV, exportToPDF } from '@/lib/exports';
import {
  derivePL,
  buildInsights,
  pctChange,
  safeDiv,
  dayBoundsIso,
  type PLData,
  type PLDerived,
  type Insight,
} from '@/lib/plMetrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Segmented } from '@/components/ui/segmented';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Chart palette (handoff §3).
const C = {
  revenue: '#6E56F7',
  revenueSoft: '#D9D2FD',
  grossProfit: '#8B78F9',
  cogs: '#E8838F',
  expenseSoft: '#F2B3BB',
  net: '#11734F',
  services: '#3DDC97',
  grey: '#E2E0EC',
};

type Preset = 'today' | '7days' | 'month' | 'lastmonth' | 'custom';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `₦${Math.round(n / 1_000)}k`;
  return `₦${Math.round(n)}`;
}

function fmtPct(frac: number, digits = 1): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

function rangeDays(start: string, end: string): number {
  const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return Math.max(1, d);
}

/** The period of equal length immediately before [start, end]. */
function previousRange(start: string, end: string): { start: string; end: string } {
  const days = rangeDays(start, end);
  const prevEnd = new Date(new Date(start).getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  return { start: ymd(prevStart), end: ymd(prevEnd) };
}

function presetRange(p: Exclude<Preset, 'custom'>): { start: string; end: string } {
  const now = new Date();
  if (p === 'today') return { start: ymd(now), end: ymd(now) };
  if (p === '7days') {
    const s = new Date();
    s.setDate(s.getDate() - 6);
    return { start: ymd(s), end: ymd(now) };
  }
  if (p === 'lastmonth') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: ymd(s), end: ymd(e) };
  }
  // this month
  return { start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), end: ymd(now) };
}

async function fetchPL(branchId: string, start: string, end: string): Promise<PLData> {
  // Whole local days: a bare `endDate=YYYY-MM-DD` is parsed server-side as midnight
  // at the START of that day, which drops every sale made on the last day of the
  // range (and made "Today" always empty). Mobile sends the same bounds.
  const { startDate, endDate } = dayBoundsIso(start, end);
  const p = new URLSearchParams({ branchId, startDate, endDate });
  return apiClient.get<PLData>(`/financials/pl?${p.toString()}`);
}

interface ExpenseSummary {
  byCategory: Record<string, number>;
  total: number;
}

export default function PLReportPage() {
  const { selectedBranchId } = useBranchStore();
  const branchesQ = useBranches();
  const branches = React.useMemo(() => branchesQ.data ?? [], [branchesQ.data]);
  // The P&L is always per-branch (the endpoint requires one), so default to the
  // globally-selected branch, falling back to the first available.
  const [branchId, setBranchId] = React.useState(selectedBranchId || '');
  React.useEffect(() => {
    if (!branchId && branches.length) setBranchId(branches[0].id);
  }, [branchId, branches]);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? 'Selected branch';

  const { useTopProducts } = useAnalytics();

  const [preset, setPreset] = React.useState<Preset>('month');
  const initial = presetRange('month');
  const [startDate, setStartDate] = React.useState(initial.start);
  const [endDate, setEndDate] = React.useState(initial.end);
  const [compare, setCompare] = React.useState(true);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      setStartDate(r.start);
      setEndDate(r.end);
    }
  };

  const prev = previousRange(startDate, endDate);
  const days = rangeDays(startDate, endDate);
  const enabled = !!branchId;

  const plQ = useQuery({
    queryKey: ['pl', branchId, startDate, endDate],
    queryFn: () => fetchPL(branchId, startDate, endDate),
    enabled,
  });
  const prevQ = useQuery({
    queryKey: ['pl-prev', branchId, prev.start, prev.end],
    queryFn: () => fetchPL(branchId, prev.start, prev.end),
    enabled: enabled && compare,
  });
  const monthlyQ = useQuery({
    queryKey: ['pl-monthly', branchId],
    queryFn: async () => {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, k) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
        return {
          label: d.toLocaleDateString(undefined, { month: 'short' }),
          start: ymd(new Date(d.getFullYear(), d.getMonth(), 1)),
          end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
        };
      });
      const data = await Promise.all(months.map((m) => fetchPL(branchId, m.start, m.end)));
      return months.map((m, i) => ({ ...m, ...data[i] }));
    },
    enabled,
  });
  const expQ = useQuery({
    queryKey: ['pl-exp', branchId, startDate, endDate],
    queryFn: () =>
      apiClient.get<ExpenseSummary>(
        `/expenses/summary?branchId=${branchId}&startDate=${startDate}&endDate=${endDate}`
      ),
    enabled,
  });
  const expPrevQ = useQuery({
    queryKey: ['pl-exp-prev', branchId, prev.start, prev.end],
    queryFn: () =>
      apiClient.get<ExpenseSummary>(
        `/expenses/summary?branchId=${branchId}&startDate=${prev.start}&endDate=${prev.end}`
      ),
    enabled: enabled && compare,
  });
  const productsQ = useTopProducts(branchId, 'monthly');

  const cur = plQ.data;
  const prevData = compare ? prevQ.data : undefined;
  const der = cur ? derivePL(cur) : null;
  const prevDer = prevData ? derivePL(prevData) : null;

  const products = React.useMemo(
    () =>
      (productsQ.data ?? []).map((p) => ({
        name: p.name,
        units: p.total_sold,
        revenue: p.total_revenue,
        profit: p.profit,
      })),
    [productsQ.data]
  );

  const expenseDeltas = React.useMemo(() => {
    if (!expQ.data || !expPrevQ.data) return [];
    return Object.entries(expQ.data.byCategory).map(([name, total]) => {
      const before = expPrevQ.data!.byCategory[name] ?? 0;
      return { name, changeFraction: before ? (total - before) / before : 0 };
    });
  }, [expQ.data, expPrevQ.data]);

  const insights: Insight[] =
    cur && der
      ? buildInsights({ cur, der, prev: prevData, prevDer, topProducts: products, expenseDeltas, naira })
      : [];

  const doExport = (format: 'pdf' | 'csv') => {
    if (!cur || !der) return;
    const gi = cur.grossIncome;
    const lines = [
      ['Product revenue', cur.productRevenue, prevData?.productRevenue],
      ['Service revenue', cur.serviceRevenue, prevData?.serviceRevenue],
      ['Gross income', cur.grossIncome, prevData?.grossIncome],
      ['Product COGS', -cur.productCogs, prevData ? -prevData.productCogs : undefined],
      ['Service direct costs', -cur.serviceDirectCosts, prevData ? -prevData.serviceDirectCosts : undefined],
      ['Gross profit', cur.grossProfit, prevData?.grossProfit],
      ['Operating expenses', -cur.operatingExpenses, prevData ? -prevData.operatingExpenses : undefined],
      ['Net profit', cur.netProfit, prevData?.netProfit],
    ] as Array<[string, number, number | undefined]>;

    const fname = `PL_Report_${startDate}_to_${endDate}`;
    if (format === 'csv') {
      const rows = lines.map(([item, amount, p]) => ({
        Item: item,
        Amount: amount,
        'Percent of revenue': fmtPct(safeDiv(Math.abs(amount), gi)),
        Previous: p == null ? '' : p,
        Change: p == null ? '' : pctChange(Math.abs(amount), Math.abs(p)) == null ? '—' : `${pctChange(Math.abs(amount), Math.abs(p))!.toFixed(1)}%`,
      }));
      rows.push(
        { Item: 'Gross margin', Amount: '' as any, 'Percent of revenue': fmtPct(der.grossMargin), Previous: '', Change: '' },
        { Item: 'Net margin', Amount: '' as any, 'Percent of revenue': fmtPct(der.netMargin), Previous: '', Change: '' },
        { Item: 'Break-even revenue', Amount: Math.round(der.breakEven) as any, 'Percent of revenue': '', Previous: '', Change: '' }
      );
      exportToCSV(fname, rows);
    } else {
      const headers = ['Line item', 'Amount', '% of revenue', 'Previous', 'Change'];
      const rows = lines.map(([item, amount, p]) => [
        item,
        naira(amount),
        fmtPct(safeDiv(Math.abs(amount), gi)),
        p == null ? '—' : naira(p),
        p == null ? '—' : pctChange(Math.abs(amount), Math.abs(p)) == null ? '—' : `${pctChange(Math.abs(amount), Math.abs(p))!.toFixed(1)}%`,
      ]);
      rows.push(['Gross margin', fmtPct(der.grossMargin), '', '', '']);
      rows.push(['Net margin', fmtPct(der.netMargin), '', '', '']);
      rows.push(['Break-even revenue', naira(der.breakEven), '', '', '']);
      exportToPDF(fname, `Profit & Loss (${startDate} to ${endDate})`, headers, rows);
    }
  };

  // ── States ────────────────────────────────────────────────────
  if (!branchId) {
    return (
      <div className="rounded-card border border-border bg-card p-10 text-center">
        <p className="text-sm text-text-muted">
          Select a branch from the top bar to view its Profit &amp; Loss.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header
        startDate={startDate}
        endDate={endDate}
        days={days}
        branchName={branchName}
        branches={branches}
        branchId={branchId}
        onBranch={setBranchId}
        preset={preset}
        onPreset={applyPreset}
        onStart={(v) => {
          setPreset('custom');
          setStartDate(v);
        }}
        onEnd={(v) => {
          setPreset('custom');
          setEndDate(v);
        }}
        compare={compare}
        onCompare={setCompare}
        onExport={doExport}
        canExport={!!cur}
      />

      {plQ.isLoading || !cur || !der ? (
        plQ.isLoading ? (
          <Skeletons />
        ) : (
          <EmptyState start={startDate} end={endDate} onTryLastMonth={() => applyPreset('lastmonth')} />
        )
      ) : (
        <>
          <KpiRow cur={cur} der={der} prev={prevData} prevDer={prevDer} monthly={monthlyQ.data} compare={compare} />

          <div className="flex flex-wrap gap-4">
            <div className="min-w-[320px] flex-[2_1_560px]">
              <Waterfall cur={cur} der={der} />
            </div>
            <div className="min-w-[280px] flex-[1_1_300px]">
              <CostPerHundred cur={cur} der={der} />
            </div>
          </div>

          <InsightsRow insights={insights} />

          <div className="flex flex-wrap gap-4">
            <div className="min-w-[320px] flex-[2_1_520px]">
              <Trend months={monthlyQ.data} loading={monthlyQ.isLoading} />
            </div>
            <div className="flex min-w-[280px] flex-[1_1_300px] flex-col gap-4">
              <RevenueMix cur={cur} />
              <ExpenseBreakdown
                summary={expQ.data}
                deltas={expenseDeltas}
                compare={compare}
                loading={expQ.isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ProductProfit products={products} loading={productsQ.isLoading} />
            <Statement cur={cur} prev={prevData} compare={compare} />
          </div>

          {compare && (
            <p className="text-xs text-text-faint">
              Deltas compare {startDate} – {endDate} with the previous {days} day(s):{' '}
              {prev.start} – {prev.end}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Header ─────────────────────────── */

function Header(props: {
  startDate: string;
  endDate: string;
  days: number;
  branchName: string;
  branches: Array<{ id: string; name: string }>;
  branchId: string;
  onBranch: (id: string) => void;
  preset: Preset;
  onPreset: (p: Preset) => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  compare: boolean;
  onCompare: (v: boolean) => void;
  onExport: (f: 'pdf' | 'csv') => void;
  canExport: boolean;
}) {
  const { startDate, endDate, days, branchName, preset } = props;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <nav className="text-xs font-medium text-text-muted">
          <Link href="/reports" className="hover:text-ink-2">
            Reports
          </Link>{' '}
          / Profit &amp; loss
        </nav>
        <h1 className="mt-0.5 text-2xl font-extrabold text-ink">Profit &amp; loss</h1>
        <p className="text-sm text-text-muted">
          {startDate} – {endDate} ({days} day{days === 1 ? '' : 's'}) · {branchName}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {props.branches.length > 0 && (
          <select
            aria-label="Branch"
            value={props.branchId}
            onChange={(e) => props.onBranch(e.target.value)}
            className="h-9 rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink-2 focus:outline-none"
          >
            {props.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <Segmented
          size="sm"
          value={preset}
          onChange={props.onPreset}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7days', label: '7 days' },
            { value: 'month', label: 'This month' },
            { value: 'lastmonth', label: 'Last month' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => props.onStart(e.target.value)}
              className="h-9 w-[150px]"
            />
            <span className="text-text-muted">→</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => props.onEnd(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <Switch checked={props.compare} onCheckedChange={props.onCompare} />
          vs previous period
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-1" disabled={!props.canExport}>
              <Download className="h-4 w-4" /> Export <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => props.onExport('pdf')}>Download PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onExport('csv')}>Download CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ─────────────────────────── KPI row ─────────────────────────── */

function DeltaPill({ change, invert }: { change: number | null; invert?: boolean }) {
  if (change == null) return null;
  const neutral = Math.abs(change) < 0.5;
  const good = invert ? change < 0 : change > 0;
  const cls = neutral
    ? 'bg-muted text-text-muted'
    : good
      ? 'bg-success-soft text-success'
      : 'bg-danger-soft text-danger';
  const arrow = neutral ? '•' : change > 0 ? '▲' : '▼';
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-pill px-1.5 py-0.5 text-2xs font-semibold', cls)}>
      {arrow} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="flex h-7 items-end gap-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm"
          style={{
            height: `${Math.max(8, (Math.abs(v) / max) * 100)}%`,
            background: i === values.length - 1 ? color : C.grey,
          }}
        />
      ))}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-card border border-border bg-card p-5', className)}>{children}</div>
  );
}

function KpiRow({
  cur,
  der,
  prev,
  prevDer,
  monthly,
  compare,
}: {
  cur: PLData;
  der: PLDerived;
  prev?: PLData;
  prevDer?: PLDerived | null;
  monthly?: Array<PLData & { label: string }>;
  compare: boolean;
}) {
  const mRevenue = (monthly ?? []).map((m) => m.grossIncome);
  const mGross = (monthly ?? []).map((m) => m.grossProfit);
  const mOpex = (monthly ?? []).map((m) => m.grossProfit - m.netProfit);
  const mNet = (monthly ?? []).map((m) => m.netProfit);

  const marginPts = prevDer ? (der.grossMargin - prevDer.grossMargin) * 100 : null;
  const netPos = cur.netProfit >= 0;

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Revenue"
        value={naira(cur.grossIncome)}
        color={C.revenue}
        bars={mRevenue}
        delta={compare ? pctChange(cur.grossIncome, prev?.grossIncome ?? 0) : null}
        sub={`${naira(cur.productRevenue)} products · ${naira(cur.serviceRevenue)} services`}
      />
      <Kpi
        label="Gross profit"
        value={naira(cur.grossProfit)}
        color={C.grossProfit}
        bars={mGross}
        delta={compare ? pctChange(cur.grossProfit, prev?.grossProfit ?? 0) : null}
        sub={`${fmtPct(der.grossMargin)} margin${marginPts != null ? ` (${marginPts >= 0 ? '+' : ''}${marginPts.toFixed(1)} pts)` : ''}`}
      />
      <Kpi
        label="Operating expenses"
        value={naira(cur.operatingExpenses)}
        color={C.cogs}
        bars={mOpex}
        delta={compare ? pctChange(cur.operatingExpenses, prev?.operatingExpenses ?? 0) : null}
        invertDelta
        sub={`${fmtPct(der.opexPct)} of revenue`}
      />
      <Kpi
        label="Net profit"
        value={naira(cur.netProfit)}
        valueClass={netPos ? 'text-success' : 'text-danger'}
        color={C.net}
        bars={mNet}
        delta={compare ? pctChange(cur.netProfit, prev?.netProfit ?? 0) : null}
        sub={`${fmtPct(der.netMargin)} net margin`}
        border={netPos ? 'border-[#CDEBDD]' : 'border-[#F3C9CE]'}
      />
    </div>
  );
}

function Kpi(props: {
  label: string;
  value: string;
  valueClass?: string;
  color: string;
  bars: number[];
  delta: number | null;
  invertDelta?: boolean;
  sub: string;
  border?: string;
}) {
  return (
    <div className={cn('rounded-card border border-border bg-card p-4', props.border)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text-muted">{props.label}</p>
        <DeltaPill change={props.delta} invert={props.invertDelta} />
      </div>
      <p className={cn('mt-2 font-mono text-[26px] font-bold leading-none tabular-nums', props.valueClass ?? 'text-ink')}>
        {props.value}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-xs text-text-muted">{props.sub}</p>
        {props.bars.length > 0 && <MiniBars values={props.bars} color={props.color} />}
      </div>
    </div>
  );
}

/* ─────────────────────────── Waterfall ─────────────────────────── */

function Waterfall({ cur, der }: { cur: PLData; der: PLDerived }) {
  const gi = cur.grossIncome;
  const gp = cur.grossProfit;
  const np = cur.netProfit;
  const min = Math.min(0, np);
  const range = gi - min || 1;
  const pos = (v: number) => ((v - min) / range) * 100; // % from bottom

  const bars = [
    { name: 'Revenue', lo: 0, hi: gi, color: C.revenue, label: compact(gi), sub: '100%', cost: false },
    { name: 'Cost of goods', lo: gp, hi: gi, color: C.cogs, label: compact(der.cogs), sub: fmtPct(der.cogsPct) + ' of revenue', cost: true },
    { name: 'Gross profit', lo: 0, hi: gp, color: C.grossProfit, label: compact(gp), sub: fmtPct(der.grossMargin) + ' margin', cost: false },
    { name: 'Expenses', lo: Math.min(np, gp), hi: Math.max(np, gp), color: C.expenseSoft, label: compact(cur.operatingExpenses), sub: fmtPct(der.opexPct) + ' of revenue', cost: true },
    { name: 'Net profit', lo: Math.min(0, np), hi: Math.max(0, np), color: np >= 0 ? C.net : C.cogs, label: compact(np), sub: fmtPct(der.netMargin) + ' margin', cost: false },
  ];

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-ink">From revenue to net profit</h2>
          <p className="text-xs text-text-muted">Each bar shows what&apos;s left after a cost comes out.</p>
        </div>
      </div>
      <div className="relative mt-6 h-[260px]">
        {[0, 25, 50, 75, 100].map((g) => (
          <div key={g} className="absolute inset-x-0 border-t border-dashed border-divider" style={{ bottom: `${g}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end justify-around gap-3">
          {bars.map((b) => {
            const bottom = pos(b.lo);
            const height = ((b.hi - b.lo) / range) * 100;
            return (
              <div key={b.name} className="relative flex h-full flex-1 flex-col items-center">
                <div
                  className="absolute w-full max-w-[72px] rounded-t-md"
                  style={{ bottom: `${bottom}%`, height: `${Math.max(1, height)}%`, background: b.color }}
                />
                <span
                  className={cn('absolute text-xs font-mono font-semibold', b.cost ? 'text-danger' : 'text-ink')}
                  style={{ bottom: `calc(${bottom + height}% + 4px)` }}
                >
                  {b.cost ? '−' : ''}
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-around gap-3">
        {bars.map((b) => (
          <div key={b.name} className="flex-1 text-center">
            <p className="text-xs font-semibold text-ink-2">{b.name}</p>
            <p className="text-2xs text-text-muted">{b.sub}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─────────────────── Where each ₦100 goes ─────────────────── */

function CostPerHundred({ cur, der }: { cur: PLData; der: PLDerived }) {
  const segs = [
    { label: 'Cost of goods', pct: der.cogsPct, per: der.cogsPct * 100, color: C.cogs },
    { label: 'Operating expenses', pct: der.opexPct, per: der.opexPct * 100, color: C.expenseSoft },
    { label: 'Kept as profit', pct: der.netPct, per: der.netPct * 100, color: C.net },
  ];
  const markerPct = Math.min(100, Math.max(0, safeDiv(der.breakEven, cur.grossIncome) * 100));
  const above = der.headroom >= 0;

  return (
    <Card className="h-full">
      <h2 className="text-[15px] font-bold text-ink">Where each ₦100 goes</h2>
      <p className="text-xs text-text-muted">Out of every ₦100 taken at the till.</p>

      <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-pill bg-surface-subtle">
        {segs.map((s) => (
          <div key={s.label} style={{ width: `${Math.max(0, s.pct * 100)}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-mono tabular-nums text-ink">₦{s.per.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-divider pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-2">Break-even revenue</span>
          <span className="font-mono text-sm font-bold tabular-nums text-ink">{naira(der.breakEven)}</span>
        </div>
        <div className="relative mt-2 h-2 w-full rounded-pill bg-surface-subtle">
          <div className="absolute inset-y-0 left-0 rounded-pill bg-primary/30" style={{ width: `${markerPct}%` }} />
          <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-ink" style={{ left: `${markerPct}%` }} />
        </div>
        <p className={cn('mt-2 text-xs', above ? 'text-text-muted' : 'text-danger')}>
          At a {fmtPct(der.grossMargin)} gross margin you need {naira(der.breakEven)} in sales to cover expenses. You&apos;re{' '}
          {naira(Math.abs(der.headroom))} ({fmtPct(Math.abs(der.headroomPct), 0)}) {above ? 'above' : 'below'} it.
        </p>
      </div>
    </Card>
  );
}

/* ─────────────────────────── Insights ─────────────────────────── */

const TAG_STYLES: Record<Insight['tag'], string> = {
  Watch: 'bg-danger-soft text-danger',
  Strength: 'bg-success-soft text-success',
  Review: 'bg-warning-soft text-warning',
};

function InsightsRow({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {insights.map((ins, i) => (
        <Card key={i}>
          <span className={cn('inline-block rounded-pill px-2 py-0.5 text-2xs font-bold uppercase tracking-wide', TAG_STYLES[ins.tag])}>
            {ins.tag}
          </span>
          <h3 className="mt-2 text-[14.5px] font-bold text-ink">{ins.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{ins.body}</p>
        </Card>
      ))}
    </div>
  );
}

/* ─────────────────────────── Trend ─────────────────────────── */

function Trend({ months, loading }: { months?: Array<PLData & { label: string }>; loading?: boolean }) {
  if (loading || !months) {
    return (
      <Card className="h-full">
        <h2 className="text-[15px] font-bold text-ink">6-month trend</h2>
        <div className="mt-6 h-[220px] animate-pulse rounded-lg bg-surface-subtle" />
      </Card>
    );
  }
  const max = Math.max(1, ...months.map((m) => m.grossIncome));
  const series = [
    { key: 'grossIncome', color: C.revenueSoft },
    { key: 'grossProfit', color: C.grossProfit },
    { key: 'netProfit', color: C.net },
  ] as const;
  return (
    <Card className="h-full">
      <h2 className="text-[15px] font-bold text-ink">6-month trend</h2>
      <p className="text-xs text-text-muted">
        Revenue, gross profit and net profit by month. Net margin is shown above each month.
      </p>
      <div className="mt-5 flex h-[220px] items-end gap-3">
        {months.map((m) => {
          const nm = safeDiv(m.netProfit, m.grossIncome);
          return (
            <div key={m.label} className="flex h-full flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-2xs font-semibold text-success">{fmtPct(nm, 0)}</span>
              <div className="flex h-full w-full items-end justify-center gap-1">
                {series.map((s) => (
                  <div
                    key={s.key}
                    className="w-2.5 rounded-t-sm"
                    style={{ height: `${Math.max(2, (Math.max(0, m[s.key]) / max) * 100)}%`, background: s.color }}
                    title={`${s.key}: ${naira(m[s.key])}`}
                  />
                ))}
              </div>
              <span className="mt-1 text-2xs text-text-muted">{m.label}</span>
              <span className="text-2xs font-medium text-ink-2">{compact(m.grossIncome)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-2xs text-text-muted">
        <Legend color={C.revenueSoft} label="Revenue" />
        <Legend color={C.grossProfit} label="Gross profit" />
        <Legend color={C.net} label="Net" />
      </div>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/* ─────────────────────────── Revenue mix ─────────────────────────── */

function RevenueMix({ cur }: { cur: PLData }) {
  const gi = cur.grossIncome || 1;
  const rows = [
    {
      label: 'Products',
      amount: cur.productRevenue,
      share: cur.productRevenue / gi,
      margin: safeDiv(cur.productRevenue - cur.productCogs, cur.productRevenue),
      color: C.revenue,
    },
    {
      label: 'Services',
      amount: cur.serviceRevenue,
      share: cur.serviceRevenue / gi,
      margin: safeDiv(cur.serviceRevenue - cur.serviceDirectCosts, cur.serviceRevenue),
      color: C.services,
    },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Revenue mix</h2>
        <span className="text-2xs text-text-muted">Share of sales</span>
      </div>
      <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-pill bg-surface-subtle">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${r.share * 100}%`, background: r.color }} />
        ))}
      </div>
      <div className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
              {r.label} · {fmtPct(r.share, 0)}
            </span>
            <span className="text-text-muted">
              {fmtPct(r.margin, 0)} margin ·{' '}
              <span className="font-mono tabular-nums text-ink">{naira(r.amount)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─────────────────────── Expense breakdown ─────────────────────── */

function ExpenseBreakdown({
  summary,
  deltas,
  compare,
  loading,
}: {
  summary?: ExpenseSummary;
  deltas: Array<{ name: string; changeFraction: number }>;
  compare: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <h2 className="text-[15px] font-bold text-ink">Operating expenses</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-surface-subtle" />
      </Card>
    );
  }
  const entries = Object.entries(summary?.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const total = summary?.total || entries.reduce((s, [, v]) => s + v, 0);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const deltaOf = (name: string) => deltas.find((d) => d.name === name)?.changeFraction ?? null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Operating expenses</h2>
        <Link href="/admin/expenses" className="text-xs font-semibold text-primary hover:underline">
          View expenses →
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">No operating expenses recorded this period.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {entries.map(([name, amount]) => {
            const d = compare ? deltaOf(name) : null;
            return (
              <div key={name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2 text-ink-2">
                    {name}
                    {d != null && <DeltaPill change={d * 100} invert />}
                  </span>
                  <span className="font-mono tabular-nums text-ink">{naira(amount)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-subtle">
                    <div className="h-full rounded-pill" style={{ width: `${(amount / max) * 100}%`, background: C.expenseSoft }} />
                  </div>
                  <span className="w-10 text-right text-2xs text-text-muted">{fmtPct(safeDiv(amount, total), 0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────── Profit by product ─────────────────────── */

function ProductProfit({
  products,
  loading,
}: {
  products: Array<{ name: string; units: number; revenue: number; profit: number }>;
  loading?: boolean;
}) {
  const sorted = [...products].sort((a, b) => b.profit - a.profit);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const other =
    rest.length > 0
      ? {
          name: `Other products (${rest.length})`,
          units: rest.reduce((s, p) => s + p.units, 0),
          revenue: rest.reduce((s, p) => s + p.revenue, 0),
          profit: rest.reduce((s, p) => s + p.profit, 0),
        }
      : null;
  const rows = other ? [...top, other] : top;

  const marginColor = (m: number) => (m < 0.2 ? C.cogs : m < 0.27 ? '#F59E0B' : C.net);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-divider px-5 py-3.5">
        <h2 className="text-[15px] font-bold text-ink">Profit by product</h2>
        <Link href="/reports/products" className="text-xs font-semibold text-primary hover:underline">
          Products report →
        </Link>
      </div>
      {loading ? (
        <div className="m-5 h-40 animate-pulse rounded-lg bg-surface-subtle" />
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-text-muted">No product sales this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
              <tr className="border-b border-divider">
                <th className="px-5 py-2.5">Product</th>
                <th className="px-5 py-2.5 text-right">Units</th>
                <th className="px-5 py-2.5 text-right">Revenue</th>
                <th className="px-5 py-2.5 text-right">Profit</th>
                <th className="px-5 py-2.5">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const m = safeDiv(p.profit, p.revenue);
                return (
                  <tr key={p.name} className="border-b border-divider last:border-0">
                    <td className="px-5 py-2.5 font-medium text-ink">{p.name}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-text-muted">{p.units}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-ink-2">{naira(p.revenue)}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-ink">{naira(p.profit)}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-pill bg-surface-subtle">
                          <div
                            className="h-full rounded-pill"
                            style={{ width: `${Math.min(100, (m / 0.4) * 100)}%`, background: marginColor(m) }}
                          />
                        </div>
                        <span className="text-2xs tabular-nums text-text-muted">{fmtPct(m, 0)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────── Statement ─────────────────────────── */

function Statement({ cur, prev, compare }: { cur: PLData; prev?: PLData; compare: boolean }) {
  const gi = cur.grossIncome || 1;
  const lines: Array<{ label: string; amount: number; prev?: number; kind: 'line' | 'subtotal' | 'cost' | 'net' }> = [
    { label: 'Product revenue', amount: cur.productRevenue, prev: prev?.productRevenue, kind: 'line' },
    { label: 'Service revenue', amount: cur.serviceRevenue, prev: prev?.serviceRevenue, kind: 'line' },
    { label: 'Gross income', amount: cur.grossIncome, prev: prev?.grossIncome, kind: 'subtotal' },
    { label: 'Product COGS', amount: -cur.productCogs, prev: prev ? -prev.productCogs : undefined, kind: 'cost' },
    { label: 'Service direct costs', amount: -cur.serviceDirectCosts, prev: prev ? -prev.serviceDirectCosts : undefined, kind: 'cost' },
    { label: 'Gross profit', amount: cur.grossProfit, prev: prev?.grossProfit, kind: 'subtotal' },
    { label: 'Operating expenses', amount: -cur.operatingExpenses, prev: prev ? -prev.operatingExpenses : undefined, kind: 'cost' },
    { label: 'Net profit', amount: cur.netProfit, prev: prev?.netProfit, kind: 'net' },
  ];
  const showCompare = compare && !!prev;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-divider px-5 py-3.5">
        <h2 className="text-[15px] font-bold text-ink">Statement</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-2xs font-bold uppercase tracking-wide text-text-muted">
            <tr className="border-b border-divider">
              <th className="px-5 py-2.5">Line item</th>
              <th className="px-5 py-2.5 text-right">Amount</th>
              <th className="px-5 py-2.5 text-right">% rev</th>
              {showCompare && <th className="px-5 py-2.5 text-right">Previous</th>}
              {showCompare && <th className="px-5 py-2.5 text-right">Change</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const change = l.prev == null ? null : pctChange(Math.abs(l.amount), Math.abs(l.prev));
              return (
                <tr
                  key={l.label}
                  className={cn(
                    'border-b border-divider last:border-0',
                    l.kind === 'subtotal' && 'bg-[#FAF9FD] font-semibold',
                    l.kind === 'net' && 'bg-[#F1EEFF] font-bold text-[#3D2EC4]'
                  )}
                >
                  <td className={cn('px-5 py-2.5', l.kind === 'cost' && 'pl-10 text-danger')}>{l.label}</td>
                  <td
                    className={cn(
                      'px-5 py-2.5 text-right font-mono tabular-nums',
                      l.kind === 'cost' && 'text-danger',
                      l.kind === 'net' && (cur.netProfit >= 0 ? 'text-[#3D2EC4]' : 'text-danger')
                    )}
                  >
                    {naira(l.amount)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-text-muted">
                    {fmtPct(safeDiv(Math.abs(l.amount), gi), 0)}
                  </td>
                  {showCompare && (
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-text-muted">
                      {l.prev == null ? '—' : naira(l.prev)}
                    </td>
                  )}
                  {showCompare && (
                    <td className="px-5 py-2.5 text-right tabular-nums text-text-muted">
                      {change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ─────────────────────────── States ─────────────────────────── */

function Skeletons() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border border-border bg-surface-subtle" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-card border border-border bg-surface-subtle" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border border-border bg-surface-subtle" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ start, end, onTryLastMonth }: { start: string; end: string; onTryLastMonth: () => void }) {
  return (
    <div className="rounded-card border border-border bg-card p-12 text-center">
      <p className="text-sm text-text-muted">
        No sales between {start} and {end}.
      </p>
      <Button variant="outline" className="mt-4" onClick={onTryLastMonth}>
        Try last month
      </Button>
    </div>
  );
}
