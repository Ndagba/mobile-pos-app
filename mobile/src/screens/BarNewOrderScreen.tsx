import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import {
  BAR_PAYMENT_METHOD_LABELS,
  newBarOrderClientRef,
  previewOrderTotals,
} from '@jaypos/shared';

import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import { barApi, barErrorMessage } from '../services/barApi';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * New bar order (Attendant / Cashier Two) — planning Phase 2.
 *
 * Pick drinks and quantities, say how the customer is paying, submit. The order
 * goes to the Bar Controller; nothing is sold or deducted until they release it.
 * Prices shown are a preview — the server prices the order from the catalog.
 * The client_ref is generated once per draft so a retried submit cannot
 * create a second order.
 */

type Product = {
  id: string;
  name: string;
  effective_price: number | string;
  tax_rate?: number | string | null;
  item_type?: string;
  is_active?: boolean;
  inventory?: { quantity_on_hand?: number | string; quantity_reserved?: number | string } | null;
};

const METHODS = ['cash', 'transfer', 'card'] as const;
type Method = (typeof METHODS)[number];

export default function BarNewOrderScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { can } = useBusinessMode();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [table, setTable] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [clientRef, setClientRef] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res: any = await ApiClient.get('/products?limit=500');
      const list: Product[] = Array.isArray(res) ? res : res?.data ?? [];
      setProducts(list.filter((p) => p.is_active !== false));
      if (list.length) DatabaseService.saveProducts(list).catch(() => {});
    } catch {
      const cached = await DatabaseService.getProducts().catch(() => []);
      setProducts(cached);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // One idempotency key per draft; a new one only after a successful submit.
  useEffect(() => {
    if (clientRef) return;
    SecureStore.getItemAsync('device_id')
      .then((d) => setClientRef(newBarOrderClientRef(d || 'device')))
      .catch(() => setClientRef(newBarOrderClientRef('device')));
  }, [clientRef]);

  const available = (p: Product) =>
    p.item_type === 'SERVICE'
      ? Infinity
      : Number(p.inventory?.quantity_on_hand ?? 0) - Number(p.inventory?.quantity_reserved ?? 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [products, search]);

  const lines = useMemo(
    () =>
      (products ?? [])
        .filter((p) => (qty[p.id] ?? 0) > 0)
        .map((p) => ({
          product: p,
          quantity: qty[p.id],
          unit_price: Number(p.effective_price) || 0,
          tax_rate: Number(p.tax_rate ?? 0) || 0,
        })),
    [products, qty]
  );
  const totals = previewOrderTotals(lines);
  const count = lines.reduce((n, l) => n + l.quantity, 0);

  const bump = (id: string, d: number) =>
    setQty((m) => {
      const next = Math.max(0, (m[id] ?? 0) + d);
      const out = { ...m };
      if (next === 0) delete out[id];
      else out[id] = next;
      return out;
    });

  const submit = async () => {
    if (!lines.length || !clientRef || submitting) return;
    setSubmitting(true);
    try {
      const order = await barApi.submit({
        client_ref: clientRef,
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        table_label: table.trim() || undefined,
        customer_payment_method: method,
      });
      setQty({});
      setTable('');
      setClientRef(null); // next draft gets a fresh key
      const short = order.stock_warnings ?? [];
      const go = () => navigation.replace('BarOrderDetail', { id: order.id, preview: order });
      if (short.length) {
        Alert.alert(
          `Order ${order.order_number.split('-').pop()} sent`,
          `The bar may be short of: ${short.map((s) => `${s.product_name} (${s.available} left)`).join(', ')}. ` +
            'The Bar Controller will confirm what they can release.',
          [{ text: 'OK', onPress: go }]
        );
      } else {
        go();
      }
    } catch (e) {
      Alert.alert('Order not sent', barErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!can('bar.order.create')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="New order" onBack={() => navigation.goBack()} />
        <View style={[styles.card, { margin: 16 }]}>
          <Text style={styles.body}>Only Attendants (and managers) can place bar orders.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="New order" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Orders can't be sent to the Bar Controller until you reconnect." />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.searchWrap}>
          <TextInput
            placeholder="Search drinks"
            value={search}
            onChangeText={setSearch}
            mode="outlined"
            dense
            left={<TextInput.Icon icon="magnify" />}
            style={{ backgroundColor: C.card }}
          />
        </View>

        {products === null ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>No products found.</Text>}
            renderItem={({ item: p }) => {
              const n = qty[p.id] ?? 0;
              const left = available(p);
              const short = Number.isFinite(left) && n > left;
              return (
                <View style={[styles.row, n > 0 && styles.rowActive]}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => bump(p.id, 1)} accessibilityLabel={`Add ${p.name}`}>
                    <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.muted, short && { color: C.red }]}>
                      {naira(Number(p.effective_price) || 0)}
                      {Number.isFinite(left) ? ` · ${left} in stock` : ''}
                    </Text>
                  </TouchableOpacity>
                  {n > 0 && (
                    <TouchableOpacity onPress={() => bump(p.id, -1)} style={styles.step} accessibilityLabel={`Remove one ${p.name}`}>
                      <MaterialCommunityIcons name="minus" size={18} color={C.ink} />
                    </TouchableOpacity>
                  )}
                  {n > 0 && <Text style={styles.qty}>{n}</Text>}
                  <TouchableOpacity onPress={() => bump(p.id, 1)} style={[styles.step, styles.stepAdd]} accessibilityLabel={`Add one ${p.name}`}>
                    <MaterialCommunityIcons name="plus" size={18} color={C.accentFg} />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}

        {/* Footer: table, payment method, total, submit */}
        <View style={styles.footer}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              placeholder="Table (optional)"
              value={table}
              onChangeText={setTable}
              mode="outlined"
              dense
              style={{ flex: 1, backgroundColor: C.card }}
            />
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMethod(m)}
                style={[styles.chip, method === m && styles.chipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m }}
              >
                <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{BAR_PAYMENT_METHOD_LABELS[m]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Button
            mode="contained"
            buttonColor={C.accent}
            onPress={submit}
            loading={submitting}
            disabled={!count || submitting || !online || !clientRef}
            style={{ marginTop: 10 }}
            contentStyle={{ paddingVertical: 6 }}
          >
            {count ? `Send ${count} item${count === 1 ? '' : 's'} · ${naira(totals.total_amount)}` : 'Add drinks to the order'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  body: { fontSize: 14, lineHeight: 20, color: C.ink },
  muted: { fontSize: 12, color: C.muted },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8 },
  rowActive: { borderColor: C.accent },
  name: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 2 },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  stepAdd: { backgroundColor: C.accent },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  footer: { padding: 16, paddingBottom: 28, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 12, fontWeight: '700', color: C.ink },
  chipTextActive: { color: C.accentFg },
});
