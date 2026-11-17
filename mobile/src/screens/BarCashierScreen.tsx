import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Button, TextInput, Dialog, Portal } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  BAR_PAYMENT_METHOD_LABELS,
  DAMAGE_REASON_LABELS,
  LEDGER_ENTRY_LABELS,
  type DamageList,
  REMITTANCE_METHOD_LABELS,
  describeBalance,
  type CashierRemittance,
  type CashierSummary,
  type LedgerEntry,
} from '@jaypos/shared';

import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { DayPicker, Kpi, MixRows, ReasonDialog } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * One Attendant's money (Bar/Lounge Phase 3).
 *  - No `cashierId` param → the signed-in Attendant's own balance ("My balance").
 *  - With `cashierId` → a Bar Controller / manager reconciling that Attendant, with
 *    Record money, reverse a hand-over (controller: own, same day), write off
 *    (manager) and adjust (admin).
 *
 * "Brought forward" is shown apart from the day's figures so an old balance is
 * never mistaken for today's sales. Balances are never reset: they are the sum of
 * every entry in the Attendant's ledger.
 */
export default function BarCashierScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const cashierId: string | undefined = route.params?.cashierId;
  const self = !cashierId;
  const online = useIsOnline();
  const { can } = useBusinessMode();

  const [date, setDate] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<CashierSummary | null>(null);
  const [remits, setRemits] = useState<CashierRemittance[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [money, setMoney] = useState<null | 'write_off' | 'adjust'>(null);
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyReason, setMoneyReason] = useState('');
  const [busy, setBusy] = useState(false);

  const [damages, setDamages] = useState<DamageList | null>(null);

  const load = useCallback(async () => {
    if (self) barApi.myDamages().then(setDamages).catch(() => {}); // information only (D24)
    try {
      const [s, r, l] = self
        ? await Promise.all([barApi.mySummary(date), barApi.myRemittances(), barApi.myLedger()])
        : await Promise.all([barApi.cashierSummary(cashierId!, date), barApi.cashierRemittances(cashierId!), barApi.cashierLedger(cashierId!)]);
      setSummary(s);
      setRemits(r);
      setLedger(l);
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load the balance.'));
    }
  }, [self, cashierId, date]);

  usePolling(load, 15000);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const reverseRemittance = async (reason: string) => {
    if (!reverseId) return;
    setBusy(true);
    try {
      await barApi.reverseRemittance(reverseId, reason);
      await load();
    } catch (e) {
      Alert.alert('Not reversed', barErrorMessage(e));
    } finally {
      setBusy(false);
      setReverseId(null);
    }
  };

  const submitMoney = async () => {
    if (!money || !cashierId) return;
    const amount = Number(moneyAmount);
    setBusy(true);
    try {
      const r = money === 'write_off'
        ? await barApi.writeOff(cashierId, amount, moneyReason.trim())
        : await barApi.adjust(cashierId, amount, moneyReason.trim());
      Alert.alert('Saved', `Balance is now ${naira(r.outstanding_after)}.`);
      setMoney(null);
      setMoneyAmount('');
      setMoneyReason('');
      await load();
    } catch (e) {
      Alert.alert('Not saved', barErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const s = summary;
  const title = self ? 'My balance' : s?.cashier.name ?? 'Attendant';
  const owedTone = s ? describeBalance(s.outstanding_now) : 'settled';

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={self ? 'Bar' : 'Attendant'} title={title} onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Figures may be out of date." />}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {!!error && <Text style={styles.error}>{error}</Text>}
        {s && (
          <>
            {s.cashier.is_active === false && (
              <View style={styles.warn}>
                <MaterialCommunityIcons name="account-off-outline" size={16} color="#B45309" />
                <Text style={styles.warnText}>This person is no longer active. Collect the balance or ask a manager to write it off.</Text>
              </View>
            )}

            {/* Headline: what is owed right now */}
            <View style={styles.headline}>
              <Text style={styles.headLabel}>
                {owedTone === 'credit' ? 'In credit' : owedTone === 'settled' ? 'All settled' : self ? 'You owe' : 'Owes'}
              </Text>
              <Text style={[styles.headValue, owedTone === 'owes' && { color: C.red }, owedTone === 'credit' && { color: '#047857' }]}>
                {naira(Math.abs(s.outstanding_now))}
              </Text>
              <Text style={styles.muted}>across all days, as of now</Text>
            </View>

            <DayPicker date={s.business_date} today={s.today} onChange={setDate} />

            <View style={styles.grid}>
              <Kpi label="Brought forward" value={naira(s.brought_forward)} hint="from earlier days" tone={describeBalance(s.brought_forward) === 'owes' ? 'owes' : 'muted'} />
              <Kpi label="Sales" value={naira(s.sales)} hint={`${s.completed_orders} released`} />
              <Kpi label="Handed over" value={naira(s.remitted)} />
              <Kpi
                label="Closing balance"
                value={naira(s.closing_balance)}
                hint={s.written_off ? `after ${naira(s.written_off)} written off` : undefined}
                tone={describeBalance(s.closing_balance)}
              />
            </View>
            {s.pending_orders > 0 && (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                {s.pending_orders} order{s.pending_orders === 1 ? '' : 's'} still waiting for the Bar Controller.
              </Text>
            )}

            {!self && can('bar.remittance.record') && (
              <Button
                mode="contained"
                buttonColor={C.accent}
                icon="cash-plus"
                style={{ marginTop: 14 }}
                disabled={!online}
                onPress={() => navigation.navigate('BarRemittance', { cashierId, cashierName: s.cashier.name })}
              >
                Record money handed over
              </Button>
            )}

            <View style={styles.twoCol}>
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.cardTitle}>Customers paid by</Text>
                <MixRows mix={s.payment_mix} labels={BAR_PAYMENT_METHOD_LABELS} />
              </View>
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.cardTitle}>Handed over as</Text>
                <MixRows mix={s.remittance_mix} labels={REMITTANCE_METHOD_LABELS} />
              </View>
            </View>
          </>
        )}

        {/* Hand-over history */}
        <Text style={styles.section}>Money handed over</Text>
        <View style={styles.card}>
          {remits.length === 0 && <Text style={styles.muted}>Nothing recorded yet.</Text>}
          {remits.slice(0, 30).map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, r.status === 'reversed' && styles.struck]}>
                  {naira(r.amount)} · {REMITTANCE_METHOD_LABELS[r.method] ?? r.method}
                </Text>
                <Text style={styles.muted}>
                  {r.business_date} · to {r.received_by.name ?? '—'}
                  {r.reference ? ` · ${r.reference}` : ''}
                  {r.status === 'reversed' ? ` · reversed: ${r.reversal_reason ?? ''}` : ''}
                </Text>
              </View>
              {!self && r.status === 'recorded' && can('bar.remittance.record') && (
                <TouchableOpacity onPress={() => setReverseId(r.id)} accessibilityLabel="Reverse this hand-over" style={styles.iconBtn}>
                  <MaterialCommunityIcons name="undo-variant" size={18} color={C.red} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Damages naming me (Phase 4) — information only, never charged */}
        {self && damages && damages.items.length > 0 && (
          <>
            <Text style={styles.section}>Damaged drinks noted with your name</Text>
            <View style={styles.card}>
              <Text style={[styles.muted, { marginBottom: 6 }]}>These are a house loss — they don't change what you owe.</Text>
              {damages.items.slice(0, 20).map((d) => (
                <View key={d.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {d.quantity} × {d.product_name ?? 'Item'} · {DAMAGE_REASON_LABELS[d.reason_code] ?? d.reason_code}
                    </Text>
                    <Text style={styles.muted}>{d.business_date} · recorded by {d.recorded_by.name ?? '—'}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Ledger */}
        <Text style={styles.section}>Every entry</Text>
        <View style={styles.card}>
          {ledger.length === 0 && <Text style={styles.muted}>No entries yet.</Text>}
          {ledger.slice(0, 50).map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{LEDGER_ENTRY_LABELS[e.entry_type] ?? e.entry_type}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {e.business_date}
                  {e.reason ? ` · ${e.reason}` : ''}
                </Text>
              </View>
              <Text style={[styles.amount, { color: e.amount > 0 ? C.ink : '#047857' }]}>
                {e.amount > 0 ? '+' : '−'}
                {naira(Math.abs(e.amount))}
              </Text>
            </View>
          ))}
        </View>

        {!self && (can('bar.ledger.write_off') || can('bar.ledger.adjust')) && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {can('bar.ledger.write_off') && (
              <Button mode="outlined" style={{ flex: 1 }} disabled={!online} onPress={() => setMoney('write_off')}>
                Write off
              </Button>
            )}
            {can('bar.ledger.adjust') && (
              <Button mode="outlined" style={{ flex: 1 }} disabled={!online} onPress={() => setMoney('adjust')}>
                Adjust
              </Button>
            )}
          </View>
        )}
      </ScrollView>

      <ReasonDialog
        visible={!!reverseId}
        title="Reverse this hand-over?"
        message="Use this when an amount was typed wrongly. Record the correct amount afterwards."
        confirmLabel="Reverse"
        destructive
        onCancel={() => setReverseId(null)}
        onConfirm={reverseRemittance}
      />

      <Portal>
        <Dialog visible={!!money} onDismiss={() => setMoney(null)} style={{ backgroundColor: C.card }}>
          <Dialog.Title>{money === 'write_off' ? 'Write off a balance' : 'Adjust a balance'}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text style={styles.muted}>
              {money === 'write_off'
                ? 'Forgive part of what is owed — for example a shortage the business absorbs, or a balance deducted from final pay.'
                : 'A signed correction. Use a minus sign to reduce what is owed.'}
            </Text>
            <TextInput label="Amount (₦)" value={moneyAmount} onChangeText={setMoneyAmount} keyboardType="numbers-and-punctuation" mode="outlined" dense style={{ backgroundColor: C.card }} />
            <TextInput label="Reason" value={moneyReason} onChangeText={setMoneyReason} mode="outlined" dense multiline style={{ backgroundColor: C.card }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setMoney(null)}>Back</Button>
            <Button onPress={submitMoney} loading={busy} disabled={busy || !moneyAmount || moneyReason.trim().length < 3}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  error: { color: C.red, marginBottom: 8 },
  muted: { fontSize: 12, color: C.muted },
  headline: { alignItems: 'center', paddingVertical: 12 },
  headLabel: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  headValue: { fontSize: 36, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 14 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  struck: { textDecorationLine: 'line-through', color: C.muted },
  amount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.redBg },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: C.amberBg, marginBottom: 6 },
  warnText: { flex: 1, fontSize: 12, color: '#92400E' },
});
