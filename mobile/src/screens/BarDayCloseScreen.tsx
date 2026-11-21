import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Share, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  DAY_CLOSE_STATUS_LABELS,
  REMITTANCE_METHOD_LABELS,
  dayCloseSummaryText,
  type DayClosePreview,
} from '@jaypos/shared';

import { barApi, barErrorDetails, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBarCache } from '../hooks/useBarCache';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { DayPicker, Kpi, MixRows } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Close my day (Bar Controller, Bar/Lounge Phase 4).
 *
 * Shows what THIS controller handled on the business day — money received from
 * Attendants by method, orders released, damages — then asks for the counted
 * cash. A difference needs a reason. Submitting freezes the figures, locks the
 * day for this controller and sends the handover to a manager. Outstanding
 * Attendant balances are not touched: they carry forward on their own.
 */
export default function BarDayCloseScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { can } = useBusinessMode();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [data, setData] = useBarCache<DayClosePreview | null>(`dayclose:${date ?? 'today'}`, null);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await barApi.dayClosePreview(date));
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load your day.'));
    }
  }, [date, setData]);
  usePolling(load, 30000);

  const f = data?.figures;
  const close = data?.close;
  const locked = close && close.status !== 'reopened';
  const expectedCash = f?.handover_cash_expected ?? 0;
  const countedNum = counted === '' ? NaN : Number(counted);
  const variance = Number.isFinite(countedNum) ? Math.round((countedNum - expectedCash) * 100) / 100 : 0;
  const needsReason = Number.isFinite(countedNum) && Math.abs(variance) > 0.009;

  const submit = async () => {
    if (!f) return;
    setBusy(true);
    try {
      const c = await barApi.submitDayClose({
        business_date: f.business_date !== data?.today ? f.business_date : undefined,
        counted_cash: countedNum,
        variance_reason: needsReason ? reason.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert('Day closed', 'Your handover has been sent to the manager.', [
        { text: 'Share summary', onPress: () => Share.share({ message: dayCloseSummaryText(c, naira) }).catch(() => {}) },
        { text: 'Done' },
      ]);
      setCounted('');
      setReason('');
      setNotes('');
      load();
    } catch (e) {
      const d = barErrorDetails(e);
      if (d?.code === 'OPEN_ORDERS') {
        Alert.alert('Orders still in progress', barErrorMessage(e), [
          { text: 'Open queue', onPress: () => navigation.navigate('BarOrders', { mode: 'queue' }) },
          { text: 'OK' },
        ]);
      } else {
        Alert.alert('Not closed', barErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmSubmit = () =>
    Alert.alert(
      'Close your day?',
      `You counted ${naira(countedNum)} cash${needsReason ? ` (${naira(Math.abs(variance))} ${variance < 0 ? 'short' : 'over'})` : ''}. ` +
        "After closing you can't record more money, releases or damages for this day unless a manager reopens it.",
      [{ text: 'Back', style: 'cancel' }, { text: 'Close my day', onPress: submit }]
    );

  if (!can('bar.dayclose.submit')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Close my day" onBack={() => navigation.goBack()} />
        <Text style={[styles.muted, { margin: 16 }]}>Only Bar Controllers and managers close a bar day.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Close my day" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. You can't close your day until you reconnect." />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.accent} />}
        >
          {!!error && <Text style={styles.error}>{error}</Text>}
          {f && data && (
            <>
              <DayPicker date={f.business_date} today={data.today} onChange={setDate} />

              {close && (
                <View style={[styles.status, close.status === 'reopened' ? styles.statusWarn : styles.statusOk]}>
                  <MaterialCommunityIcons name={close.status === 'reopened' ? 'lock-open-outline' : 'lock-outline'} size={18} color={close.status === 'reopened' ? '#B45309' : '#047857'} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statusTitle}>{DAY_CLOSE_STATUS_LABELS[close.status]}</Text>
                    <Text style={styles.muted}>
                      {close.status === 'reopened'
                        ? `Reopened by ${close.reopened_by?.name ?? 'a manager'}: ${close.reopen_reason ?? ''}. Close it again below.`
                        : `Counted ${naira(close.counted_cash)} · expected ${naira(close.expected.cash)}${close.acknowledged_amount !== null ? ` · manager received ${naira(close.acknowledged_amount)}` : ''}`}
                    </Text>
                  </View>
                  {locked && (
                    <Button compact onPress={() => Share.share({ message: dayCloseSummaryText(close, naira) }).catch(() => {})}>Share</Button>
                  )}
                </View>
              )}

              <View style={styles.grid}>
                <Kpi label="Orders released" value={String(f.orders_released.count)} hint={naira(f.orders_released.total)} />
                <Kpi label="Money received" value={naira(f.remittances.total)} hint={`${f.remittances.count} hand-over(s)`} />
                <Kpi label="Damaged / flat" value={String(f.damages.quantity)} hint={`${naira(f.damages.cost_value)} at cost`} tone="muted" />
                <Kpi label="Cash to hand over" value={naira(expectedCash)} hint="transfers & POS are in the bank" />
              </View>

              {(f.open_orders.mine_in_progress > 0 || f.open_orders.unclaimed_in_queue > 0) && !locked && (
                <View style={styles.warn}>
                  <MaterialCommunityIcons name="alert-outline" size={16} color="#B45309" />
                  <Text style={styles.warnText}>
                    {f.open_orders.mine_in_progress > 0
                      ? `You are still preparing ${f.open_orders.mine_in_progress} order(s) — release or hand them back first. `
                      : ''}
                    {f.open_orders.unclaimed_in_queue > 0 ? `${f.open_orders.unclaimed_in_queue} order(s) are waiting in the queue; they stay open for the next shift.` : ''}
                  </Text>
                </View>
              )}

              <View style={styles.twoCol}>
                <View style={[styles.card, { flex: 1 }]}>
                  <Text style={styles.cardTitle}>Received as</Text>
                  <MixRows mix={f.remittances.by_method} labels={REMITTANCE_METHOD_LABELS} />
                </View>
                <View style={[styles.card, { flex: 1 }]}>
                  <Text style={styles.cardTitle}>From</Text>
                  {f.remittances.by_attendant.length === 0 ? (
                    <Text style={styles.muted}>No hand-overs</Text>
                  ) : (
                    f.remittances.by_attendant.map((a) => (
                      <View key={a.cashier_id} style={styles.mixRow}>
                        <Text style={styles.mixLabel} numberOfLines={1}>{a.name ?? 'Attendant'}</Text>
                        <Text style={styles.mixValue}>{naira(a.amount)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </View>

              {!locked && (
                <>
                  <Text style={styles.section}>Cash you counted</Text>
                  <TextInput
                    value={counted}
                    onChangeText={(v) => setCounted(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    mode="outlined"
                    left={<TextInput.Affix text="₦" />}
                    style={{ backgroundColor: C.card, fontSize: 22 }}
                  />
                  {Number.isFinite(countedNum) && (
                    <Text style={[styles.variance, needsReason ? { color: variance < 0 ? C.red : '#B45309' } : { color: '#047857' }]}>
                      {needsReason ? `${naira(Math.abs(variance))} ${variance < 0 ? 'short' : 'over'}` : 'Matches what you received'}
                    </Text>
                  )}
                  {needsReason && (
                    <TextInput label="Why is it different? (required)" value={reason} onChangeText={setReason} mode="outlined" dense multiline
                      style={{ backgroundColor: C.card, marginTop: 8 }} />
                  )}
                  <TextInput label="Note for the manager (optional)" value={notes} onChangeText={setNotes} mode="outlined" dense
                    style={{ backgroundColor: C.card, marginTop: 8 }} />
                  <Button
                    mode="contained"
                    buttonColor={C.accent}
                    style={{ marginTop: 16 }}
                    contentStyle={{ paddingVertical: 6 }}
                    icon="lock-outline"
                    onPress={confirmSubmit}
                    loading={busy}
                    disabled={busy || !online || !Number.isFinite(countedNum) || (needsReason && reason.trim().length < 3) || f.open_orders.mine_in_progress > 0}
                  >
                    Close my day
                  </Button>
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  error: { color: C.red, marginBottom: 8 },
  muted: { fontSize: 12, color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 14 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6 },
  mixRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 3 },
  mixLabel: { fontSize: 13, color: C.ink, flexShrink: 1 },
  mixValue: { fontSize: 13, color: C.ink, fontVariant: ['tabular-nums'] },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  variance: { fontSize: 14, fontWeight: '800', marginTop: 6 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, marginBottom: 8 },
  statusOk: { backgroundColor: C.greenBg },
  statusWarn: { backgroundColor: C.amberBg },
  statusTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: C.amberBg, marginTop: 10 },
  warnText: { flex: 1, fontSize: 12, color: '#92400E' },
});
