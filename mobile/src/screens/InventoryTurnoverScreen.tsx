import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput as RNTextInput,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { dayBoundsIso, ymd } from '@jaypos/shared';

import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, PurchasingLocked, fmtQty,
  useCanPurchase as useIsManagerOrAdmin, useIsOnline,
} from '../components/purchasing/PurchasingBits';

interface TurnoverRow {
  id: string;
  name: string;
  sku: string | null;
  total_sold: number;
  transaction_count: number;
  /** Null when the product has no average on-hand to divide by. */
  turnover_ratio: number | null;
}

const RANGES = [7, 30, 90] as const;

const num = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * Inventory turnover (admin + manager) — mobile counterpart of the desktop
 * `/inventory/turnover` page on `GET /inventory/turnover`. Store-wide, stock
 * products only (services hold no inventory). Online-only.
 */
export default function InventoryTurnoverScreen() {
  const navigation = useNavigation<any>();
  const allowed = useIsManagerOrAdmin();
  const online = useIsOnline();

  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [rows, setRows] = useState<TurnoverRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
    return { start: ymd(start), end: ymd(now) };
  }, [days]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      // Whole local days, so sales made today are included.
      const { startDate, endDate } = dayBoundsIso(range.start, range.end);
      const res: any = await ApiClient.get(
        `/inventory/turnover?dateFrom=${encodeURIComponent(startDate)}&dateTo=${encodeURIComponent(endDate)}`
      );
      if (mine !== seq.current) return;
      const list: any[] = Array.isArray(res) ? res : res?.data ?? [];
      setRows(list.map(r => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        sku: r.sku ?? null,
        total_sold: num(r.total_sold),
        transaction_count: num(r.transaction_count),
        turnover_ratio: r.turnover_ratio === null || r.turnover_ratio === undefined ? null : num(r.turnover_ratio),
      })));
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load turnover.');
    } finally {
      if (mine === seq.current) { setLoading(false); setRefreshing(false); }
    }
  }, [range]);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    load();
  }, [allowed, load, online]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q) || (r.sku ?? '').toLowerCase().includes(q));
  }, [rows, search]);

  const totalSold = useMemo(() => rows.reduce((s, r) => s + r.total_sold, 0), [rows]);

  if (!allowed) return <PurchasingLocked feature="Inventory turnover" onBack={() => navigation.goBack()} />;

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Inventory" title="Turnover" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. This report needs a connection — figures shown may be out of date." />}

      <View style={styles.chipRow}>
        {RANGES.map(d => {
          const active = days === d;
          return (
            <TouchableOpacity key={d} style={[styles.chip, active && styles.chipActive]} onPress={() => setDays(d)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>Last {d} days</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
        <RNTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search product or SKU"
          placeholderTextColor={C.muted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.summary}>
        {range.start} – {range.end} · {rows.length} product{rows.length === 1 ? '' : 's'} sold · {fmtQty(totalSold)} units
      </Text>

      {loading && rows.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="rotate-3d-variant" size={44} color={C.muted} />
              <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
                {error ?? (search ? 'No products match this search.' : 'No sales in this period.')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[item.sku, `${fmtQty(item.total_sold)} sold`, `${item.transaction_count} sale${item.transaction_count === 1 ? '' : 's'}`]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.ratio}>{item.turnover_ratio === null ? '—' : item.turnover_ratio.toFixed(2)}</Text>
                <Text style={styles.ratioLabel}>turnover</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { fontSize: 12, color: C.muted },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  summary: { fontSize: 12, color: C.muted, paddingHorizontal: 16, paddingVertical: 10 },
  listContent: { paddingHorizontal: 16, paddingBottom: 48, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  name: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 2 },
  ratio: { fontSize: 18, fontWeight: '800', color: C.ink },
  ratioLabel: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
});
