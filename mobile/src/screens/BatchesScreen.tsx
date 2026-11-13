import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl, Modal,
  KeyboardAvoidingView, Platform, TextInput as RNTextInput,
} from 'react-native';
import { ActivityIndicator, Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import { isIsoDate } from '../utils/purchaseOrders';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, PurchasingLocked, fmtDate, fmtQty,
  useCanPurchase as useIsManagerOrAdmin, useIsOnline,
} from '../components/purchasing/PurchasingBits';

type Status = 'expiring' | 'expired';

interface BatchRow {
  batch_id: string;
  product_name: string;
  sku: string | null;
  batch_number: string | null;
  expiry_date: string;
  quantity: number;
  days_until_expiry: number;
  urgency: string;
}
interface ProductLite { id: string; name: string; sku?: string | null; item_type?: string | null; }

const DAY_OPTIONS = [7, 30, 60, 90] as const;
const OFFLINE_MSG = 'You are offline. Batches need a connection — nothing was saved.';

const num = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const URGENCY: Record<string, { fg: string; bg: string }> = {
  EXPIRED: { fg: C.red, bg: C.redBg },
  CRITICAL: { fg: C.red, bg: C.redBg },
  HIGH: { fg: '#B45309', bg: C.amberBg },
  MEDIUM: { fg: C.muted, bg: 'rgba(113,113,122,0.12)' },
};

/**
 * Batches & expiry (admin + manager) — mobile counterpart of the desktop
 * `/inventory/expiring` page: batches expiring soon or already expired
 * (`GET /inventory/expiring`, scoped to the caller's branches) plus "Add batch"
 * (`POST /inventory/batches`). Online-only.
 */
export default function BatchesScreen() {
  const navigation = useNavigation<any>();
  const allowed = useIsManagerOrAdmin();
  const online = useIsOnline();

  const [status, setStatus] = useState<Status>('expiring');
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res: any = await ApiClient.get(`/inventory/expiring?days=${days}&status=${status}`);
      if (mine !== seq.current) return;
      const list: any[] = Array.isArray(res) ? res : res?.data ?? [];
      setRows(list.map(r => ({
        batch_id: String(r.batch_id),
        product_name: String(r.product_name ?? ''),
        sku: r.sku ?? null,
        batch_number: r.batch_number ?? null,
        expiry_date: String(r.expiry_date ?? ''),
        quantity: num(r.quantity),
        days_until_expiry: num(r.days_until_expiry),
        urgency: String(r.urgency ?? 'MEDIUM'),
      })));
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      setError(e?.response?.data?.message || e?.message || 'Could not load batches.');
    } finally {
      if (mine === seq.current) { setLoading(false); setRefreshing(false); }
    }
  }, [days, status]);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    load();
  }, [allowed, load, online]);

  if (!allowed) return <PurchasingLocked feature="Batch tracking" onBack={() => navigation.goBack()} />;

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Inventory" title="Batches & expiry" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Batches need a connection — the list may be out of date and new batches can't be added." />}

      <View style={styles.segmentBar}>
        {(['expiring', 'expired'] as Status[]).map(s => {
          const active = status === s;
          return (
            <TouchableOpacity key={s} style={[styles.segment, active && styles.segmentActive]} onPress={() => setStatus(s)} activeOpacity={0.8}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {s === 'expiring' ? 'Expiring soon' : 'Expired'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {status === 'expiring' && (
        <View style={styles.chipRow}>
          {DAY_OPTIONS.map(d => {
            const active = days === d;
            return (
              <TouchableOpacity key={d} style={[styles.chip, active && styles.chipActive]} onPress={() => setDays(d)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>Next {d} days</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {loading && rows.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={r => r.batch_id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="calendar-check-outline" size={44} color={C.muted} />
              <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
                {error ?? (status === 'expired' ? 'No expired batches.' : `No batches expiring in the next ${days} days.`)}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const expired = item.urgency === 'EXPIRED' || item.days_until_expiry < 0;
            const tone = URGENCY[expired ? 'EXPIRED' : item.urgency] ?? URGENCY.MEDIUM;
            return (
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.product_name}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {[item.sku, item.batch_number ? `Batch ${item.batch_number}` : null, `${fmtQty(item.quantity)} units`]
                      .filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.muted}>Expires {fmtDate(item.expiry_date)}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>
                    {expired ? 'Expired' : item.days_until_expiry === 0 ? 'Today' : `${item.days_until_expiry}d left`}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, !online && { opacity: 0.5 }]}
        activeOpacity={0.85}
        disabled={!online}
        onPress={() => setAddOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add batch"
      >
        <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
        <Text style={styles.fabLabel}>Add batch</Text>
      </TouchableOpacity>

      {addOpen && (
        <AddBatchSheet
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); setLoading(true); load(); }}
        />
      )}
    </View>
  );
}

/**
 * Add a batch/lot to a stock product. NOTE (backend behaviour, same as desktop):
 * creating a batch ALSO adds its quantity to the product's stock on hand — so
 * this is for stock that is not already counted, not for labelling existing stock.
 */
function AddBatchSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();

  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [mfgDate, setMfgDate] = useState(todayIso());
  const [expiryDate, setExpiryDate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await ApiClient.get('/products?limit=500');
        const list: ProductLite[] = Array.isArray(res) ? res : res?.data ?? [];
        if (!cancelled) setProducts(list.filter(p => p.item_type !== 'SERVICE'));
      } catch {} finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const handleSave = async () => {
    setError(null);
    const qty = Number(quantity);
    if (!product) return setError('Choose a product.');
    if (!batchNumber.trim()) return setError('Enter a batch number.');
    if (!Number.isFinite(qty) || qty <= 0) return setError('Enter a quantity greater than 0.');
    if (!isIsoDate(mfgDate.trim())) return setError('Manufactured date must look like 2026-11-12.');
    if (!isIsoDate(expiryDate.trim())) return setError('Expiry date must look like 2027-06-30.');
    if (expiryDate.trim() <= mfgDate.trim()) return setError('Expiry date must be after the manufactured date.');
    if (!ApiClient.getOnlineStatus()) return setError(OFFLINE_MSG);

    setSaving(true);
    try {
      const res: any = await ApiClient.post('/inventory/batches', {
        product_id: product.id,
        batch_number: batchNumber.trim(),
        manufactured_date: mfgDate.trim(),
        expiry_date: expiryDate.trim(),
        quantity: qty,
        warehouse_location: location.trim() || undefined,
      });
      // ApiClient echoes the request body when offline; a real batch has an id.
      if (!res || !(res.id ?? res?.data?.id)) throw new Error(OFFLINE_MSG);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to create batch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={saving ? undefined : onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Add product batch</Text>
          <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button" accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={C.ink} />
          </TouchableOpacity>
        </View>
        {!online && <OfflineBanner message={OFFLINE_MSG.replace(' — nothing was saved.', '.')} />}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Product *</Text>
            {product ? (
              <View style={styles.picked}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
                  {!!product.sku && <Text style={styles.muted}>{product.sku}</Text>}
                </View>
                <TouchableOpacity onPress={() => setProduct(null)} disabled={saving}>
                  <Text style={styles.change}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.searchBar}>
                  <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
                  <RNTextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search product name or SKU"
                    placeholderTextColor={C.muted}
                    style={styles.searchInput}
                    autoCapitalize="none"
                  />
                  {loadingProducts && <ActivityIndicator size={16} color={C.accent} />}
                </View>
                {search.trim().length > 0 && (
                  <View style={styles.results}>
                    {results.length === 0 ? (
                      <Text style={[styles.muted, { padding: 12 }]}>
                        {loadingProducts ? 'Loading products…' : 'No matching stock products.'}
                      </Text>
                    ) : results.map(p => (
                      <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => { setProduct(p); setSearch(''); }}>
                        <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                        {!!p.sku && <Text style={styles.muted}>{p.sku}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <View style={styles.twoCol}>
              <TextInput label="Batch number *" value={batchNumber} onChangeText={setBatchNumber} mode="outlined" dense
                placeholder="e.g. BATCH001" style={[styles.input, { flex: 1 }]} editable={!saving} autoCapitalize="characters" />
              <TextInput label="Quantity *" value={quantity} onChangeText={setQuantity} mode="outlined" dense
                keyboardType="decimal-pad" style={[styles.input, { flex: 1 }]} editable={!saving} />
            </View>
            <View style={styles.twoCol}>
              <TextInput label="Manufactured *" value={mfgDate} onChangeText={setMfgDate} mode="outlined" dense
                placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1 }]} editable={!saving} />
              <TextInput label="Expiry *" value={expiryDate} onChangeText={setExpiryDate} mode="outlined" dense
                placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1 }]} editable={!saving} />
            </View>
            <TextInput label="Storage location / shelf" value={location} onChangeText={setLocation} mode="outlined" dense
              placeholder="e.g. Shelf A1" style={[styles.input, { marginTop: 12 }]} editable={!saving} />

            <View style={styles.note}>
              <MaterialCommunityIcons name="information-outline" size={16} color="#B45309" />
              <Text style={styles.noteText}>
                Saving a batch also adds its quantity to the product's stock on hand. Use it for stock that
                isn't counted yet — goods received against a purchase order are already in stock.
              </Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {error && <Text style={styles.error}>{error}</Text>}
            <Button mode="contained" buttonColor={C.accent} onPress={handleSave} loading={saving}
              disabled={saving || !online} style={{ marginTop: 6 }}>
              Save batch
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { fontSize: 12, color: C.muted },
  error: { fontSize: 13, color: C.red, marginBottom: 4 },
  segmentBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  segmentActive: { backgroundColor: C.accent, borderColor: C.accent },
  segmentText: { fontSize: 13, fontWeight: '600', color: C.muted },
  segmentTextActive: { color: C.accentFg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },
  listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
  name: { fontSize: 14, fontWeight: '700', color: C.ink },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 20, bottom: 32, backgroundColor: C.accent, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  fabLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6, marginBottom: 8 },
  input: { backgroundColor: C.card },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 12 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 },
  change: { fontSize: 13, fontWeight: '700', color: C.accent },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  results: { marginTop: 6, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  resultRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: C.amberBg },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#92400E' },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
});
