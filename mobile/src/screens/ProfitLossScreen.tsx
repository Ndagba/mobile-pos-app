import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Share, Switch,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  buildInsights, dayBoundsIso, derivePL, pctChange, plPresetRange, plPreviousRange, plRangeDays, safeDiv, ymd,
} from '@jaypos/shared';
import type { Insight, PLData, PLPreset } from '@jaypos/shared';

import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, PurchasingLocked, useCanPurchase as useIsManagerOrAdmin, useIsOnline,
} from '../components/purchasing/PurchasingBits';

interface Branch { id: string; name: string; is_active: boolean; }
interface ExpenseSummary { byCategory: Record<string, number>; total: number; }
interface MonthPoint extends PLData { label: string; }

const PRESETS: Array<{ key: PLPreset; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7days', label: '7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastmonth', label: 'Last month' },
];

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** ₦ with a real minus sign for losses (theme `naira()` has no negative form). */
const money = (v: number): string => `${v < 0 ? '−' : ''}₦${Math.round(Math.abs(v)).toLocaleString('en-NG')}`;
const compact = (v: number): string => {
  const a = Math.abs(v); const sign = v < 0 ? '−' : '';
  if (a >= 1_000_000) return `${sign}₦${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}₦${Math.round(a / 1_000)}k`;
  return `${sign}₦${Math.round(a)}`;
};
const pct = (frac: number, digits = 1): string => `${(frac * 100).toFixed(digits)}%`;

function normalizePL(raw: any): PLData {
  return {
    grossIncome: n(raw?.grossIncome),
    productRevenue: n(raw?.productRevenue),
    serviceRevenue: n(raw?.serviceRevenue),
    productCogs: n(raw?.productCogs),
    serviceDirectCosts: n(raw?.serviceDirectCosts),
    grossProfit: n(raw?.grossProfit),
    operatingExpenses: n(raw?.operatingExpenses),
    netProfit: n(raw?.netProfit),
  };
}

// Whole local days via the shared helper — the same bounds the desktop sends.
async function fetchPL(branchId: string, start: string, end: string): Promise<PLData> {
  const { startDate, endDate } = dayBoundsIso(start, end);
  const res: any = await ApiClient.get(
    `/financials/pl?branchId=${encodeURIComponent(branchId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  );
  return normalizePL(res?.data ?? res);
}

// Expenses are stored by calendar date, so plain dates are the right filter here (as on desktop).
async function fetchExpenses(branchId: string, start: string, end: string): Promise<ExpenseSummary> {
  const res: any = await ApiClient.get(
    `/expenses/summary?branchId=${encodeURIComponent(branchId)}&startDate=${start}&endDate=${end}`
  );
  const data = res?.data ?? res;
  const byCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries(data?.byCategory ?? {})) byCategory[k] = n(v);
  return { byCategory, total: n(data?.total) };
}

/**
 * Profit & Loss (admin + manager) — mobile counterpart of the desktop
 * `/admin/financials/pl` report, on the same `/financials/pl` endpoint and the
 * same shared maths (`@jaypos/shared` `derivePL` / `buildInsights`). Always
 * per-branch, because the endpoint requires one. Online-only.
 */
export default function ProfitLossScreen() {
  const navigation = useNavigation<any>();
  const allowed = useIsManagerOrAdmin();
  const online = useIsOnline();
  const user = useSelector((s: RootState) => s.auth.user);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [preset, setPreset] = useState<PLPreset>('month');
  const [compare, setCompare] = useState(true);

  const [cur, setCur] = useState<PLData | null>(null);
  const [prev, setPrev] = useState<PLData | null>(null);
  const [exp, setExp] = useState<ExpenseSummary | null>(null);
  const [expPrev, setExpPrev] = useState<ExpenseSummary | null>(null);
  const [topProducts, setTopProducts] = useState<Array<{ name: string; revenue: number; profit: number }>>([]);
  const [months, setMonths] = useState<MonthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const range = useMemo(() => plPresetRange(preset), [preset]);
  const prevRange = useMemo(() => plPreviousRange(range.start, range.end), [range]);
  const days = plRangeDays(range.start, range.end);

  // Branches: default to the user's home branch, else the first one they can see.
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const res: any = await ApiClient.get('/branches');
        const active: Branch[] = (Array.isArray(res) ? res : res?.data ?? []).filter((b: Branch) => b.is_active);
        setBranches(active);
        setBranchId(prevId => prevId || active.find(b => b.id === user?.branch_id)?.id || active[0]?.id || '');
        if (active.length === 0) { setLoading(false); setError('No branch available for this account.'); }
      } catch {
        setLoading(false);
        setError('Could not load branches — check your connection.');
      }
    })();
  }, [allowed]);

  const load = useCallback(async () => {
    if (!branchId) return;
    const mine = ++seq.current;
    setError(null);
    try {
      // The headline figures first; the extras below must not block or fail the report.
      const [plNow, plPrev] = await Promise.all([
        fetchPL(branchId, range.start, range.end),
        compare ? fetchPL(branchId, prevRange.start, prevRange.end).catch(() => null) : Promise.resolve(null),
      ]);
      if (mine !== seq.current) return;
      setCur(plNow);
      setPrev(plPrev);
      setLoading(false);
      setRefreshing(false);

      const [e1, e2, tp] = await Promise.all([
        fetchExpenses(branchId, range.start, range.end).catch(() => null),
        compare ? fetchExpenses(branchId, prevRange.start, prevRange.end).catch(() => null) : Promise.resolve(null),
        ApiClient.get(`/analytics/top-products?period=monthly&branch_id=${encodeURIComponent(branchId)}`).catch(() => null),
      ]);
      if (mine !== seq.current) return;
      setExp(e1);
      setExpPrev(e2);
      const rows: any[] = Array.isArray(tp) ? tp : (tp as any)?.data ?? [];
      setTopProducts(rows.map(p => ({ name: String(p.name ?? ''), revenue: n(p.total_revenue), profit: n(p.profit) })));
    } catch (e: any) {
      if (mine !== seq.current) return;
      setCur(null);
      setError(e?.response?.data?.message || e?.message || 'Could not load the Profit & Loss report.');
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, range, prevRange, compare]);

  useEffect(() => {
    if (!allowed || !branchId) return;
    setLoading(true);
    load();
  }, [allowed, load, online]);

  // Six-month trend — independent of the selected period, reloaded per branch.
  useEffect(() => {
    if (!allowed || !branchId) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const defs = Array.from({ length: 6 }, (_, k) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - k), 1);
        return {
          label: d.toLocaleDateString(undefined, { month: 'short' }),
          start: ymd(d),
          end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
        };
      });
      try {
        const data = await Promise.all(defs.map(m => fetchPL(branchId, m.start, m.end)));
        if (!cancelled) setMonths(defs.map((m, i) => ({ label: m.label, ...data[i] })));
      } catch {
        if (!cancelled) setMonths([]);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, branchId, online]);

  const der = useMemo(() => (cur ? derivePL(cur) : null), [cur]);
  const prevDer = useMemo(() => (prev ? derivePL(prev) : null), [prev]);

  const expenseDeltas = useMemo(() => {
    if (!exp || !expPrev) return [];
    return Object.entries(exp.byCategory).map(([name, total]) => {
      const before = expPrev.byCategory[name] ?? 0;
      return { name, changeFraction: before ? (total - before) / before : 0 };
    });
  }, [exp, expPrev]);

  const insights: Insight[] = useMemo(
    () => (cur && der
      ? buildInsights({ cur, der, prev, prevDer, topProducts, expenseDeltas, naira: money })
      : []),
    [cur, der, prev, prevDer, topProducts, expenseDeltas]
  );

  if (!allowed) return <PurchasingLocked feature="Profit & Loss" onBack={() => navigation.goBack()} />;

  const branchName = branches.find(b => b.id === branchId)?.name ?? '';
  const isEmpty = !!cur && cur.grossIncome === 0 && cur.operatingExpenses === 0;

  const statement: Array<{ label: string; value: number; prev?: number; strong?: boolean; cost?: boolean }> = cur ? [
    { label: 'Product revenue', value: cur.productRevenue, prev: prev?.productRevenue },
    { label: 'Service revenue', value: cur.serviceRevenue, prev: prev?.serviceRevenue },
    { label: 'Gross income', value: cur.grossIncome, prev: prev?.grossIncome, strong: true },
    { label: 'Product cost of goods', value: -cur.productCogs, prev: prev ? -prev.productCogs : undefined, cost: true },
    { label: 'Service direct costs', value: -cur.serviceDirectCosts, prev: prev ? -prev.serviceDirectCosts : undefined, cost: true },
    { label: 'Gross profit', value: cur.grossProfit, prev: prev?.grossProfit, strong: true },
    { label: 'Operating expenses', value: -cur.operatingExpenses, prev: prev ? -prev.operatingExpenses : undefined, cost: true },
    { label: 'Net profit', value: cur.netProfit, prev: prev?.netProfit, strong: true },
  ] : [];

  const shareReport = async () => {
    if (!cur || !der) return;
    const lines = [
      'PROFIT & LOSS',
      `${branchName} · ${range.start} to ${range.end} (${days} day${days === 1 ? '' : 's'})`,
      '--------------------------------',
      ...statement.map(r => `${r.label}: ${money(r.value)}  (${pct(safeDiv(Math.abs(r.value), cur.grossIncome))})`),
      '--------------------------------',
      `Gross margin: ${pct(der.grossMargin)}`,
      `Net margin: ${pct(der.netMargin)}`,
      `Break-even revenue: ${money(der.breakEven)}`,
    ];
    try { await Share.share({ message: lines.join('\n'), title: 'Profit & Loss' }); } catch {}
  };

  const maxMonth = Math.max(1, ...months.map(m => Math.max(m.grossIncome, Math.abs(m.netProfit))));
  const expenseRows = exp ? Object.entries(exp.byCategory).sort((a, b) => b[1] - a[1]) : [];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Reports"
        title="Profit & Loss"
        onBack={() => navigation.goBack()}
        right={cur && !isEmpty ? (
          <TouchableOpacity style={styles.iconBtn} onPress={shareReport} accessibilityRole="button" accessibilityLabel="Share report">
            <MaterialCommunityIcons name="share-variant-outline" size={20} color={C.accent} />
          </TouchableOpacity>
        ) : undefined}
      />
      {!online && <OfflineBanner message="You're offline. This report needs a connection — figures shown may be out of date." />}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
      >
        {branches.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {branches.map(b => (
              <Chip key={b.id} label={b.name} active={b.id === branchId} onPress={() => setBranchId(b.id)} />
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {PRESETS.map(p => (
            <Chip key={p.key} label={p.label} active={preset === p.key} onPress={() => setPreset(p.key)} />
          ))}
        </ScrollView>

        <View style={styles.compareRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rangeText}>{range.start} – {range.end} · {days} day{days === 1 ? '' : 's'}</Text>
            <Text style={styles.muted}>
              {compare ? `Compared with ${prevRange.start} – ${prevRange.end}` : 'Comparison off'}
            </Text>
          </View>
          <Switch value={compare} onValueChange={setCompare} trackColor={{ true: C.accent }} />
        </View>

        {loading && !cur ? (
          <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
        ) : error || !cur || !der ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={C.muted} />
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>{error ?? 'No data.'}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : isEmpty ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="chart-line" size={40} color={C.muted} />
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
              No sales or expenses recorded for this branch in this period.
            </Text>
          </View>
        ) : (
          <>
            {/* KPIs */}
            <View style={styles.kpiGrid}>
              <Kpi label="Revenue" value={compact(cur.grossIncome)} delta={prev ? pctChange(cur.grossIncome, prev.grossIncome) : undefined} />
              <Kpi label="Gross profit" value={compact(cur.grossProfit)} sub={`${pct(der.grossMargin)} margin`}
                delta={prev ? pctChange(cur.grossProfit, prev.grossProfit) : undefined} />
              <Kpi label="Operating expenses" value={compact(cur.operatingExpenses)} sub={`${pct(der.opexPct)} of revenue`}
                delta={prev ? pctChange(cur.operatingExpenses, prev.operatingExpenses) : undefined} goodWhenDown />
              <Kpi label="Net profit" value={compact(cur.netProfit)} sub={`${pct(der.netMargin)} margin`}
                tone={cur.netProfit < 0 ? C.red : '#047857'}
                delta={prev ? pctChange(cur.netProfit, prev.netProfit) : undefined} />
            </View>

            {/* Insights */}
            {insights.map(i => (
              <View key={i.title} style={styles.card}>
                <View style={[styles.tag, { backgroundColor: i.tag === 'Watch' ? C.amberBg : i.tag === 'Strength' ? C.greenBg : C.violetBg }]}>
                  <Text style={[styles.tagText, { color: i.tag === 'Watch' ? '#B45309' : i.tag === 'Strength' ? '#047857' : C.accent }]}>{i.tag}</Text>
                </View>
                <Text style={styles.insightTitle}>{i.title}</Text>
                <Text style={styles.insightBody}>{i.body}</Text>
              </View>
            ))}

            {/* Statement */}
            <Text style={styles.section}>Statement</Text>
            <View style={[styles.card, { padding: 0 }]}>
              {statement.map((r, idx) => (
                <View key={r.label} style={[styles.stRow, idx < statement.length - 1 && styles.divider, r.strong && styles.stStrong]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.stLabel, r.strong && { fontWeight: '800' }]} numberOfLines={1}>{r.label}</Text>
                    <Text style={styles.muted}>
                      {pct(safeDiv(Math.abs(r.value), cur.grossIncome))} of revenue
                      {r.prev !== undefined ? ` · prev ${money(r.prev)}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.stValue, r.strong && { fontWeight: '800' }, (r.cost || r.value < 0) && { color: C.red }]}>
                    {money(r.value)}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={[styles.muted, { marginTop: 8 }]}>
              Break-even revenue {money(der.breakEven)}
              {der.headroom >= 0 ? ` · ${money(der.headroom)} above it` : ` · ${money(-der.headroom)} short`}
            </Text>

            {/* Revenue mix */}
            <Text style={styles.section}>Revenue mix</Text>
            <View style={styles.card}>
              <View style={styles.mixBar}>
                <View style={{ flex: Math.max(cur.productRevenue, 0.0001), backgroundColor: C.accent }} />
                <View style={{ flex: Math.max(cur.serviceRevenue, 0.0001), backgroundColor: C.green }} />
              </View>
              <Legend color={C.accent} label="Products" value={`${money(cur.productRevenue)} · ${pct(safeDiv(cur.productRevenue, cur.grossIncome), 0)}`} />
              <Legend color={C.green} label="Services" value={`${money(cur.serviceRevenue)} · ${pct(der.servicesRevShare, 0)}`} />
            </View>

            {/* Expense breakdown */}
            <Text style={styles.section}>Operating expenses by category</Text>
            <View style={styles.card}>
              {exp === null ? (
                <Text style={styles.muted}>Loading…</Text>
              ) : expenseRows.length === 0 ? (
                <Text style={styles.muted}>No expenses recorded in this period.</Text>
              ) : expenseRows.map(([name, total]) => {
                const delta = expenseDeltas.find(d => d.name === name)?.changeFraction;
                return (
                  <View key={name} style={{ marginBottom: 10 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.stLabel} numberOfLines={1}>{name}</Text>
                      <Text style={styles.stValue}>
                        {money(total)}
                        {compare && delta ? <Text style={{ color: delta > 0 ? C.red : '#047857', fontSize: 11 }}>  {delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)}%</Text> : null}
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${Math.round(safeDiv(total, exp.total) * 100)}%` as any, backgroundColor: C.rose }]} />
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Six-month trend */}
            {months.length > 0 && (
              <>
                <Text style={styles.section}>Last 6 months</Text>
                <View style={styles.card}>
                  <View style={styles.trend}>
                    {months.map(m => (
                      <View key={m.label} style={styles.trendCol}>
                        <View style={styles.trendBars}>
                          <View style={[styles.trendBar, { height: Math.max(2, (m.grossIncome / maxMonth) * 90), backgroundColor: C.violetBg, borderColor: C.accent, borderWidth: 1 }]} />
                          <View style={[styles.trendBar, { height: Math.max(2, (Math.abs(m.netProfit) / maxMonth) * 90), backgroundColor: m.netProfit < 0 ? C.red : C.green }]} />
                        </View>
                        <Text style={styles.trendLabel}>{m.label}</Text>
                        <Text style={[styles.trendValue, m.netProfit < 0 && { color: C.red }]}>{compact(m.netProfit)}</Text>
                      </View>
                    ))}
                  </View>
                  <Legend color={C.accent} label="Revenue" value="" />
                  <Legend color={C.green} label="Net profit (red = loss)" value="" />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Kpi({
  label, value, sub, delta, tone, goodWhenDown,
}: { label: string; value: string; sub?: string; delta?: number | null; tone?: string; goodWhenDown?: boolean }) {
  const hasDelta = delta !== undefined && delta !== null;
  const good = hasDelta && (goodWhenDown ? delta! <= 0 : delta! >= 0);
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {!!sub && <Text style={styles.muted}>{sub}</Text>}
      {hasDelta && (
        <Text style={[styles.kpiDelta, { color: good ? '#047857' : C.red }]}>
          {delta! >= 0 ? '▲' : '▼'} {Math.abs(delta!).toFixed(1)}% vs previous
        </Text>
      )}
    </View>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={[styles.rowBetween, { marginTop: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
        <Text style={styles.muted}>{label}</Text>
      </View>
      {!!value && <Text style={styles.legendValue}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  muted: { fontSize: 12, color: C.muted },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipRow: { gap: 8, paddingVertical: 5 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 12 },
  rangeText: { fontSize: 13, fontWeight: '700', color: C.ink },
  retry: { marginTop: 12, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  retryText: { fontSize: 13, fontWeight: '700', color: C.ink },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: C.ink, marginTop: 2 },
  kpiDelta: { fontSize: 11, fontWeight: '600', marginTop: 4 },

  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginBottom: 6 },
  tagText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  insightTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  insightBody: { fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 4 },

  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  stRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  stStrong: { backgroundColor: 'rgba(110,86,247,0.04)' },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border },
  stLabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  stValue: { fontSize: 13, fontWeight: '700', color: C.ink },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  legendValue: { fontSize: 12, fontWeight: '700', color: C.ink },
  mixBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: C.border },
  track: { height: 6, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden', marginTop: 5 },
  fill: { height: 6, borderRadius: 3 },

  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  trendCol: { flex: 1, alignItems: 'center' },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 92 },
  trendBar: { width: 10, borderRadius: 3 },
  trendLabel: { fontSize: 10, fontWeight: '700', color: C.muted, marginTop: 4 },
  trendValue: { fontSize: 9, color: C.ink, marginTop: 1 },
});
