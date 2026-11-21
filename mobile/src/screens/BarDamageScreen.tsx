import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import {
  DAMAGE_REASON_LABELS,
  newBarOrderClientRef,
  type BarDashboardRow,
  type DamageList,
  type DamageReason,
} from '@jaypos/shared';

import ApiClient from '../services/ApiClient';
import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBarCache } from '../hooks/useBarCache';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { ReasonDialog } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Flat / damaged drinks (Bar/Lounge Phase 4) — Bar Controller and managers.
 *
 * Always a HOUSE LOSS (D24): it takes the bottles out of stock and shows up in
 * the damage report, but never adds to what an Attendant owes. Naming the
 * Attendant involved is optional and for analytics only. Today's records are
 * listed below with a reverse action for mistakes.
 */
const REASONS: DamageReason[] = ['flat', 'bad_cap', 'broken', 'expired', 'other'];

type Product = { id: string; name: string; item_type?: string; is_active?: boolean; inventory?: { quantity_on_hand?: number | string } | null };

export default function BarDamageScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { can } = useBusinessMode();

  const [products, setProducts] = useBarCache<Product[]>('damage:products', []);
  const [people, setPeople] = useBarCache<BarDashboardRow[]>('damage:people', []);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState<DamageReason>('flat');
  const [responsible, setResponsible] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientRef, setClientRef] = useState<string | null>(null);
  const [list, setList] = useBarCache<DamageList | null>('damage:list', null);
  const [reverseId, setReverseId] = useState<string | null>(null);

  useEffect(() => {
    ApiClient.get('/products?limit=500')
      .then((res: any) => {
        const l: Product[] = Array.isArray(res) ? res : res?.data ?? [];
        setProducts(l.filter((p) => p.is_active !== false && p.item_type !== 'SERVICE'));
      })
      .catch(() => {});
    barApi.dashboard().then((d) => setPeople(d.attendants)).catch(() => {});
  }, []);

  useEffect(() => {
    if (clientRef) return;
    SecureStore.getItemAsync('device_id')
      .then((d) => setClientRef(newBarOrderClientRef(`dmg-${d || 'device'}`)))
      .catch(() => setClientRef(newBarOrderClientRef('dmg-device')));
  }, [clientRef]);

  const load = useCallback(async () => {
    try {
      setList(await barApi.damages());
    } catch {
      // keep last
    }
  }, [setList]);
  usePolling(load, 30000);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [products, search]);
  const chosen = products.find((p) => p.id === productId);

  const submit = async () => {
    if (!productId || !clientRef) return;
    setBusy(true);
    try {
      const r = await barApi.recordDamage({
        client_ref: clientRef,
        product_id: productId,
        quantity: qty,
        reason_code: reason,
        notes: notes.trim() || undefined,
        responsible_user_id: responsible,
      });
      setClientRef(null);
      setProductId(null);
      setSearch('');
      setQty(1);
      setNotes('');
      setResponsible(null);
      Alert.alert('Recorded', `${r.quantity} × ${r.product_name ?? 'item'} written off (${naira(r.cost_value)} at cost). This is a house loss.`);
      load();
    } catch (e) {
      Alert.alert('Not recorded', barErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reverse = async (why: string) => {
    if (!reverseId) return;
    try {
      await barApi.reverseDamage(reverseId, why);
      load();
    } catch (e) {
      Alert.alert('Not reversed', barErrorMessage(e));
    } finally {
      setReverseId(null);
    }
  };

  if (!can('bar.damage.record')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Flat / damaged" onBack={() => navigation.goBack()} />
        <Text style={[styles.muted, { margin: 16 }]}>Only Bar Controllers and managers record damaged drinks.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Flat / damaged" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Damages can't be recorded until you reconnect." />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.notice}>
            <MaterialCommunityIcons name="information-outline" size={16} color={C.accent} />
            <Text style={[styles.muted, { flex: 1, color: C.ink }]}>Damaged drinks are a house loss. They never add to what an Attendant owes.</Text>
          </View>

          <Text style={styles.section}>Drink</Text>
          {chosen ? (
            <TouchableOpacity style={styles.chosen} onPress={() => setProductId(null)}>
              <Text style={styles.chosenText}>{chosen.name}</Text>
              <Text style={styles.muted}>{Number(chosen.inventory?.quantity_on_hand ?? 0)} in stock · tap to change</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput placeholder="Search drinks" value={search} onChangeText={setSearch} mode="outlined" dense
                left={<TextInput.Icon icon="magnify" />} style={{ backgroundColor: C.card }} />
              {matches.map((p) => (
                <TouchableOpacity key={p.id} style={styles.match} onPress={() => setProductId(p.id)}>
                  <Text style={styles.matchText}>{p.name}</Text>
                  <Text style={styles.muted}>{Number(p.inventory?.quantity_on_hand ?? 0)} in stock</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          <Text style={styles.section}>How many</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.step} onPress={() => setQty((q) => Math.max(1, q - 1))} accessibilityLabel="One fewer">
              <MaterialCommunityIcons name="minus" size={18} color={C.ink} />
            </TouchableOpacity>
            <Text style={styles.qty}>{qty}</Text>
            <TouchableOpacity style={styles.step} onPress={() => setQty((q) => q + 1)} accessibilityLabel="One more">
              <MaterialCommunityIcons name="plus" size={18} color={C.ink} />
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Why</Text>
          <View style={styles.chips}>
            {REASONS.map((r) => (
              <TouchableOpacity key={r} onPress={() => setReason(r)} style={[styles.chip, reason === r && styles.chipActive]}
                accessibilityRole="radio" accessibilityState={{ selected: reason === r }}>
                <Text style={[styles.chipText, reason === r && styles.chipTextActive]}>{DAMAGE_REASON_LABELS[r]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>Attendant involved (optional)</Text>
          <View style={styles.chips}>
            {[{ cashier_id: null as string | null, name: 'House / no one' }, ...people.map((p) => ({ cashier_id: p.cashier_id as string | null, name: p.name ?? 'Attendant' }))].map((p) => (
              <TouchableOpacity key={p.cashier_id ?? 'house'} onPress={() => setResponsible(p.cashier_id)}
                style={[styles.chip, responsible === p.cashier_id && styles.chipActive]}>
                <Text style={[styles.chipText, responsible === p.cashier_id && styles.chipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput label={reason === 'other' ? 'Note (required)' : 'Note (optional)'} value={notes} onChangeText={setNotes}
            mode="outlined" dense style={{ backgroundColor: C.card, marginTop: 12 }} />

          <Button mode="contained" buttonColor={C.red} style={{ marginTop: 16 }} contentStyle={{ paddingVertical: 6 }}
            onPress={submit} loading={busy}
            disabled={!productId || busy || !online || !clientRef || (reason === 'other' && !notes.trim())}>
            Write off {qty} {chosen ? `× ${chosen.name}` : ''}
          </Button>

          {/* Today */}
          <Text style={styles.section}>Today</Text>
          <View style={styles.card}>
            {!list || list.items.length === 0 ? (
              <Text style={styles.muted}>Nothing recorded today.</Text>
            ) : (
              <>
                <Text style={[styles.muted, { marginBottom: 6 }]}>
                  {list.totals.quantity} item(s) · {naira(list.totals.cost_value)} at cost · {naira(list.totals.retail_value)} in lost sales
                </Text>
                {list.items.map((d) => (
                  <View key={d.id} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, d.status === 'reversed' && styles.struck]}>
                        {d.quantity} × {d.product_name ?? 'Item'} · {DAMAGE_REASON_LABELS[d.reason_code] ?? d.reason_code}
                      </Text>
                      <Text style={styles.muted}>
                        {d.responsible?.name ? `${d.responsible.name} · ` : 'House · '}by {d.recorded_by.name ?? '—'}
                        {d.notes ? ` · ${d.notes}` : ''}
                      </Text>
                    </View>
                    {d.status === 'recorded' && (
                      <TouchableOpacity onPress={() => setReverseId(d.id)} style={styles.iconBtn} accessibilityLabel="Reverse this damage">
                        <MaterialCommunityIcons name="undo-variant" size={18} color={C.red} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ReasonDialog
        visible={!!reverseId}
        title="Reverse this damage?"
        message="The bottles go back into stock."
        confirmLabel="Reverse"
        destructive
        onCancel={() => setReverseId(null)}
        onConfirm={reverse}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  muted: { fontSize: 12, color: C.muted },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: C.violetBg },
  chosen: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.accent, backgroundColor: C.card },
  chosenText: { fontSize: 16, fontWeight: '800', color: C.ink },
  match: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card },
  matchText: { fontSize: 14, fontWeight: '700', color: C.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  qty: { fontSize: 22, fontWeight: '800', color: C.ink, minWidth: 30, textAlign: 'center', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: C.ink },
  chipTextActive: { color: C.accentFg },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  struck: { textDecorationLine: 'line-through', color: C.muted },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.redBg },
});
