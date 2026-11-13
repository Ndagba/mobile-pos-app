import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl,
  TextInput as RNTextInput, Platform,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import ApiClient from '../services/ApiClient';
import PurchaseOrderService, { poApiError } from '../services/PurchaseOrderService';
import { C, naira } from '../theme';
import {
  LowStockItem, POListItem, POStatus, PO_STATUS_LABEL, normalizeLowStock, receivedFraction, reorderBase, suggestedQty,
} from '../utils/purchaseOrders';
import {
  OfflineBanner, POStatusBadge, PurchasingHeader, PurchasingLocked,
  fmtDate, fmtQty, useCanPurchase, useIsOnline,
} from '../components/purchasing/PurchasingBits';

interface Branch { id: string; name: string; is_active: boolean; }

const STATUS_FILTERS: Array<POStatus | 'all'> = [
  'all', 'draft', 'ordered', 'partially_received', 'received', 'cancelled',
];

/**
 * Purchase-order list (admin + manager). Mobile counterpart of the desktop
 * `/purchasing` page, opened from the Suppliers screen. The server scopes the
 * list to the caller's authorized branches; a multi-branch user can narrow it.
 */
export default function PurchasingScreen() {
  const navigation = useNavigation<any>();
  const canPurchase = useCanPurchase();
  const online = useIsOnline();

  const [orders, setOrders] = useState<POListItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [status, setStatus] = useState<POStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);

  // Latest filters for the focus-effect reload (avoids re-subscribing on every change).
  const filtersRef = useRef({ status, branchId });
  filtersRef.current = { status, branchId };
  const requestSeq = useRef(0);

  const load = useCallback(async (s: POStatus | 'all', b: string | null) => {
    const seq = ++requestSeq.current;
    try {
      const rows = await PurchaseOrderService.list({ status: s, branchId: b });
      if (seq !== requestSeq.current) return; // a newer filter change won
      setOrders(rows);
      setError(null);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(poApiError(e, 'Could not load purchase orders.'));
    } finally {
      if (seq === requestSeq.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const loadBranches = async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const all: Branch[] = Array.isArray(res) ? res : res?.data ?? [];
      setBranches(all.filter(b => b.is_active));
    } catch {}
  };

  // Products running low (same source as the desktop "Suggested reorders" card).
  const loadLowStock = async (b: string | null) => {
    try {
      const res: any = await ApiClient.get(`/inventory/low-stock${b ? `?branch_id=${encodeURIComponent(b)}` : ''}`);
      const list: any[] = Array.isArray(res) ? res : res?.data ?? [];
      setLowStock(list.map(normalizeLowStock));
    } catch {
      setLowStock([]);
    }
  };

  useFocusEffect(useCallback(() => {
    if (!canPurchase) return;
    loadBranches();
    load(filtersRef.current.status, filtersRef.current.branchId);
    loadLowStock(filtersRef.current.branchId);
  }, [canPurchase, load, online]));

  const pickStatus = (s: POStatus | 'all') => { setStatus(s); setLoading(true); load(s, branchId); };
  const pickBranch = (b: string | null) => { setBranchId(b); setLoading(true); load(status, b); loadLowStock(b); };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      o.po_number.toLowerCase().includes(q) || (o.supplier?.name ?? '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  const branchName = useMemo(() => {
    const m = new Map(branches.map(b => [b.id, b.name]));
    return (id: string) => m.get(id);
  }, [branches]);

  if (!canPurchase) return <PurchasingLocked onBack={() => navigation.goBack()} />;

  const multiBranch = branches.length > 1;
  // Only on the unfiltered list, so a status filter or search stays focused on orders.
  const showReorders = lowStock.length > 0 && status === 'all' && !search.trim();

  const renderRow = ({ item }: { item: POListItem }) => {
    const frac = receivedFraction(item.items);
    const showProgress = item.status !== 'draft' && item.status !== 'cancelled';
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('PurchaseOrderDetail', { id: item.id })}
      >
        <View style={styles.rowTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.poNumber} numberOfLines={1}>{item.po_number}</Text>
            <Text style={styles.supplier} numberOfLines={1}>{item.supplier?.name ?? 'Unknown supplier'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={styles.total}>{naira(item.total_amount)}</Text>
            <POStatusBadge status={item.status} />
          </View>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {item.items.length} line{item.items.length === 1 ? '' : 's'}
          {' · '}
          {item.order_date ? `Ordered ${fmtDate(item.order_date)}` : `Created ${fmtDate(item.created_at)}`}
          {item.expected_date ? ` · Due ${fmtDate(item.expected_date)}` : ''}
          {multiBranch && branchName(item.branch_id) ? ` · ${branchName(item.branch_id)}` : ''}
        </Text>
        {showProgress && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(frac * 100)}%` as any }]} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <PurchasingHeader eyebrow="Suppliers" title="Purchase orders" onBack={() => navigation.goBack()} />

      {!online && <OfflineBanner />}

      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
        <RNTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search PO number or supplier"
          placeholderTextColor={C.muted}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={16} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {STATUS_FILTERS.map(s => {
          const active = status === s;
          return (
            <TouchableOpacity key={s} style={[styles.chip, active && styles.chipActive]} onPress={() => pickStatus(s)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {s === 'all' ? 'All' : PO_STATUS_LABEL[s]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {multiBranch && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, branchId === null && styles.chipActive]} onPress={() => pickBranch(null)}>
            <Text style={[styles.chipText, branchId === null && styles.chipTextActive]}>All branches</Text>
          </TouchableOpacity>
          {branches.map(b => {
            const active = branchId === b.id;
            return (
              <TouchableOpacity key={b.id} style={[styles.chip, active && styles.chipActive]} onPress={() => pickBranch(b.id)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && orders.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={o => o.id}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListHeaderComponent={showReorders ? (
            <View style={styles.reorderCard}>
              <Text style={styles.reorderTitle}>Suggested reorders</Text>
              {lowStock.slice(0, 5).map((it, idx, arr) => (
                <View key={it.product_id} style={[styles.reorderRow, idx < arr.length - 1 && styles.reorderDivider]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.reorderName} numberOfLines={1}>{it.product_name}</Text>
                    <Text style={styles.meta}>{fmtQty(it.current_quantity)} left · reorder at {fmtQty(reorderBase(it))}</Text>
                  </View>
                  <TouchableOpacity
                    disabled={!online}
                    onPress={() => navigation.navigate('PurchaseOrderNew', {
                      product_id: it.product_id,
                      product_name: it.product_name,
                      quantity: suggestedQty(it),
                      branch_id: branchId ?? undefined,
                    })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Order ${suggestedQty(it)} of ${it.product_name}`}
                  >
                    <Text style={[styles.reorderAction, !online && { opacity: 0.5 }]}>Order {suggestedQty(it)}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {lowStock.length > 5 && (
                <Text style={[styles.meta, { marginTop: 8 }]}>
                  +{lowStock.length - 5} more on Inventory → Low stock
                </Text>
              )}
            </View>
          ) : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(status, branchId); loadLowStock(branchId); }}
              tintColor={C.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={56} color={C.muted} />
              <Text style={styles.emptyTitle}>
                {error ? 'Could not load purchase orders' : 'No purchase orders'}
              </Text>
              <Text style={styles.emptySub}>
                {error
                  ? error
                  : search || status !== 'all'
                    ? 'Nothing matches these filters.'
                    : 'Raise your first order to restock from a supplier.'}
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, !online && { opacity: 0.5 }]}
        activeOpacity={0.85}
        disabled={!online}
        onPress={() => navigation.navigate('PurchaseOrderNew')}
        accessibilityRole="button"
        accessibilityLabel="New purchase order"
      >
        <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
        <Text style={styles.fabLabel}>New order</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  chipScroll: { flexGrow: 0, maxHeight: 46 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 5, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, flexGrow: 1 },
  row: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 8 },
  rowTop: { flexDirection: 'row', gap: 12 },
  poNumber: { fontSize: 15, fontWeight: '800', color: C.ink },
  supplier: { fontSize: 13, color: C.muted, marginTop: 2 },
  total: { fontSize: 15, fontWeight: '800', color: C.ink },
  meta: { fontSize: 12, color: C.muted },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: C.border, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: C.green },
  reorderCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 },
  reorderTitle: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  reorderDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  reorderName: { fontSize: 14, fontWeight: '700', color: C.ink },
  reorderAction: { fontSize: 13, fontWeight: '700', color: C.accent },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 60 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 14 },
  emptySub: { fontSize: 12, color: C.muted, marginTop: 6, textAlign: 'center' },
  fab: {
    position: 'absolute', right: 20, bottom: 32,
    backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  fabLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
