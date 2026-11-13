import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import ApiClient from '../services/ApiClient';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, PurchasingLocked, fmtQty,
  useCanPurchase as useIsManagerOrAdmin, useIsOnline,
} from '../components/purchasing/PurchasingBits';

interface TxItem {
  id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  name: string;
}
interface Tx {
  id: string;
  receipt_number: string | null;
  created_at: string;
  total_amount: number;
  discount_amount: number;
  payment_method: string;
  status: string;
  customer: string | null;
  items: TxItem[];
}

type StatusFilter = 'all' | 'completed' | 'refunded';

const num = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const METHOD: Record<string, string> = { cash: 'Cash', card: 'Card', mobile_wallet: 'Transfer', transfer: 'Transfer', split: 'Split', credit: 'Credit' };
const fmtWhen = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function normalize(raw: any): Tx {
  const c = raw?.customer;
  return {
    id: String(raw.id),
    receipt_number: raw.receipt_number ?? null,
    created_at: String(raw.created_at ?? ''),
    total_amount: num(raw.total_amount),
    discount_amount: num(raw.discount_amount),
    payment_method: String(raw.payment_method ?? ''),
    status: String(raw.status ?? ''),
    customer: c ? [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone || null : null,
    items: (Array.isArray(raw.transaction_items) ? raw.transaction_items : []).map((it: any) => ({
      id: String(it.id),
      quantity: num(it.quantity),
      unit_price: num(it.unit_price),
      line_total: num(it.line_total),
      name: it.product?.name ?? 'Item',
    })),
  };
}

/**
 * One employee's sales for a period (admin + manager) — mobile counterpart of the
 * desktop `/reports/employees/[id]` page, opened by tapping a row on the
 * Analytics → Staff tab. Uses `GET /transactions?userId=&dateFrom=&dateTo=&includeItems=true`.
 */
export default function EmployeeSalesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userId, name, role, dateFrom, dateTo, periodLabel } = route.params ?? {};
  const allowed = useIsManagerOrAdmin();
  const online = useIsOnline();

  const [rows, setRows] = useState<Tx[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!userId || !dateFrom || !dateTo) { setLoading(false); setError('Missing employee or period.'); return; }
    const mine = ++seq.current;
    try {
      const res: any = await ApiClient.get(
        `/transactions?userId=${encodeURIComponent(userId)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&includeItems=true&limit=500`
      );
      if (mine !== seq.current) return;
      const list: any[] = Array.isArray(res) ? res : res?.data ?? [];
      setRows(list.map(normalize));
      setTotal(typeof res?.pagination?.total === 'number' ? res.pagination.total : null);
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load this employee\'s sales.');
    } finally {
      if (mine === seq.current) { setLoading(false); setRefreshing(false); }
    }
  }, [userId, dateFrom, dateTo]);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    load();
  }, [allowed, load, online]);

  const summary = useMemo(() => {
    let sales = 0, salesCount = 0, refunds = 0, refundCount = 0, discounts = 0, items = 0;
    for (const t of rows) {
      if (t.status === 'refunded') { refunds += t.total_amount; refundCount++; continue; }
      if (t.status === 'voided') continue;
      sales += t.total_amount; salesCount++;
      discounts += t.discount_amount;
      items += t.items.reduce((s, i) => s + i.quantity, 0);
    }
    return { sales, salesCount, refunds, refundCount, discounts, items, avg: salesCount ? sales / salesCount : 0 };
  }, [rows]);

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter(t => (filter === 'refunded' ? t.status === 'refunded' : t.status !== 'refunded' && t.status !== 'voided'))),
    [rows, filter]
  );

  if (!allowed) return <PurchasingLocked feature="Employee reports" onBack={() => navigation.goBack()} />;

  const truncated = total !== null && total > rows.length;

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={[role, periodLabel].filter(Boolean).join(' · ') || 'Employee'} title={name || 'Employee'} onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. This report needs a connection — figures shown may be out of date." />}

      {loading && rows.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={t => t.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
          ListHeaderComponent={
            <>
              <View style={styles.kpiGrid}>
                <Kpi label="Sales" value={naira(summary.sales)} sub={`${summary.salesCount} transaction${summary.salesCount === 1 ? '' : 's'}`} />
                <Kpi label="Average sale" value={naira(summary.avg)} sub={`${fmtQty(summary.items)} items sold`} />
                <Kpi label="Refunds" value={naira(summary.refunds)} sub={`${summary.refundCount} refunded`} tone={summary.refundCount ? C.red : undefined} />
                <Kpi label="Discounts given" value={naira(summary.discounts)} />
              </View>
              {truncated && (
                <Text style={[styles.muted, { marginBottom: 8 }]}>
                  Showing the latest {rows.length} of {total} transactions — totals above cover only these.
                </Text>
              )}
              <View style={styles.chipRow}>
                {(['all', 'completed', 'refunded'] as StatusFilter[]).map(f => {
                  const active = filter === f;
                  return (
                    <TouchableOpacity key={f} style={[styles.chip, active && styles.chipActive]} onPress={() => setFilter(f)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {f === 'all' ? 'All' : f === 'completed' ? 'Completed' : 'Refunded'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="receipt-text-outline" size={44} color={C.muted} />
              <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
                {error ?? 'No transactions for this employee in this period.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const open = expanded === item.id;
            const refunded = item.status === 'refunded';
            return (
              <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => setExpanded(open ? null : item.id)}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.receipt_number || `#${item.id.slice(-8).toUpperCase()}`}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {[fmtWhen(item.created_at), METHOD[item.payment_method] ?? item.payment_method, item.customer].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amount, refunded && { color: C.red }]}>{refunded ? '−' : ''}{naira(item.total_amount)}</Text>
                    {(refunded || item.status === 'voided') && <Text style={styles.status}>{item.status}</Text>}
                  </View>
                  <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
                </View>
                {open && (
                  <View style={styles.items}>
                    {item.items.length === 0 ? (
                      <Text style={styles.muted}>No line items.</Text>
                    ) : item.items.map(it => (
                      <View key={it.id} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
                        <Text style={styles.muted}>{fmtQty(it.quantity)} × {naira(it.unit_price)}</Text>
                        <Text style={styles.itemTotal}>{naira(it.line_total)}</Text>
                      </View>
                    ))}
                    {item.discount_amount > 0 && (
                      <Text style={[styles.muted, { marginTop: 4 }]}>Discount −{naira(item.discount_amount)}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {!!sub && <Text style={styles.muted}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { fontSize: 12, color: C.muted },
  listContent: { paddingHorizontal: 16, paddingBottom: 48, flexGrow: 1 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 19, fontWeight: '800', color: C.ink, marginTop: 2 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },
  row: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 2 },
  amount: { fontSize: 14, fontWeight: '800', color: C.ink },
  status: { fontSize: 10, fontWeight: '700', color: C.red, textTransform: 'uppercase' },
  items: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemName: { flex: 1, fontSize: 13, color: C.ink },
  itemTotal: { width: 84, textAlign: 'right', fontSize: 13, fontWeight: '700', color: C.ink },
});
