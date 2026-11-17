import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import {
  REMITTANCE_METHOD_LABELS,
  newBarOrderClientRef,
  type BarDashboardRow,
  type CashierRemittance,
  type RemittanceMethod,
} from '@jaypos/shared';

import { RootState } from '../redux/store';
import { barApi, barErrorDetails, barErrorMessage } from '../services/barApi';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { DayPicker } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Record money an Attendant hands to the Bar Controller (Bar/Lounge Phase 3).
 *
 * The server decides everything that matters: it refuses a transfer / POS without a
 * reference, asks for confirmation when the amount is more than is owed (it becomes
 * a credit — D21) or when the same bank reference was already recorded, and keeps
 * the hand-over idempotent on a client_ref generated once per form.
 * Back-dating is shown only to people allowed to do it.
 */
const METHODS: RemittanceMethod[] = ['cash', 'transfer', 'card', 'other'];

export default function BarRemittanceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const online = useIsOnline();
  const me = useSelector((s: RootState) => s.auth.user);
  const settings = useSelector((s: RootState) => s.settings.settings);
  const { can } = useBusinessMode();
  const isSupervisor = me?.role === 'admin' || me?.role === 'manager' || !!me?.is_super_admin;
  const canBackdate = isSupervisor || !!settings?.bar_allow_backdated_remittance;

  const [cashierId, setCashierId] = useState<string | undefined>(route.params?.cashierId);
  const [cashierName, setCashierName] = useState<string | undefined>(route.params?.cashierName);
  const [people, setPeople] = useState<BarDashboardRow[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<RemittanceMethod>('cash');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientRef, setClientRef] = useState<string | null>(null);

  useEffect(() => {
    barApi
      .dashboard()
      .then((d) => {
        setPeople(d.attendants);
        setToday(d.today);
        setDate((x) => x ?? d.today);
      })
      .catch(() => setPeople([]));
    SecureStore.getItemAsync('device_id')
      .then((d) => setClientRef(newBarOrderClientRef(`rem-${d || 'device'}`)))
      .catch(() => setClientRef(newBarOrderClientRef('rem-device')));
  }, []);

  const selected = people?.find((p) => p.cashier_id === cashierId);
  const owed = selected?.outstanding_now;

  const share = (r: CashierRemittance) =>
    Share.share({
      message:
        `JayPOS — money received\n` +
        `${r.cashier.name ?? 'Attendant'} handed over ${naira(r.amount)} (${REMITTANCE_METHOD_LABELS[r.method] ?? r.method})\n` +
        `${r.reference ? `Ref: ${r.reference}\n` : ''}` +
        `Received by ${r.received_by.name ?? '—'} · business day ${r.business_date}\n` +
        `Balance still owed: ${naira(r.outstanding_after ?? 0)}\n` +
        `Receipt ${r.id.slice(0, 8).toUpperCase()}`,
    }).catch(() => {});

  const submit = async (flags: { confirm_overpayment?: boolean; confirm_duplicate?: boolean } = {}) => {
    if (!cashierId || !clientRef) return;
    setBusy(true);
    try {
      const r = await barApi.recordRemittance({
        cashier_user_id: cashierId,
        amount: Number(amount),
        method,
        reference: reference.trim() || undefined,
        narration: narration.trim() || undefined,
        business_date: date && today && date !== today ? date : undefined,
        client_ref: clientRef,
        ...flags,
      });
      Alert.alert(
        'Money recorded',
        `${naira(r.amount)} from ${r.cashier.name ?? 'the Attendant'}. Still owed: ${naira(r.outstanding_after ?? 0)}.`,
        [
          { text: 'Share receipt', onPress: () => share(r) },
          { text: 'Done', onPress: () => navigation.goBack() },
        ]
      );
    } catch (e) {
      const d = barErrorDetails(e);
      if (d?.code === 'OVERPAYMENT') {
        Alert.alert(
          'More than is owed',
          `They owe ${naira(d.outstanding)}. Recording ${naira(Number(amount))} leaves them ${naira(d.excess)} in credit, used against future sales.`,
          [
            { text: 'Change amount', style: 'cancel' },
            { text: 'Record anyway', onPress: () => submit({ ...flags, confirm_overpayment: true }) },
          ]
        );
      } else if (d?.code === 'DUPLICATE_REFERENCE') {
        Alert.alert(
          'Reference already used',
          `${naira(d.existing_amount)} with this reference was recorded on ${d.existing_date}. Is this a different payment?`,
          [
            { text: 'Check again', style: 'cancel' },
            { text: "It's different", onPress: () => submit({ ...flags, confirm_duplicate: true }) },
          ]
        );
      } else {
        Alert.alert('Not recorded', barErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const needsRef = method === 'transfer' || method === 'card';
  const valid = !!cashierId && Number(amount) > 0 && (!needsRef || reference.trim().length > 0);

  if (!can('bar.remittance.record')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Record money" onBack={() => navigation.goBack()} />
        <Text style={[styles.muted, { margin: 16 }]}>Only Bar Controllers and managers record money handed over.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Record money" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Money can't be recorded until you reconnect." />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>From</Text>
          {people === null ? (
            <ActivityIndicator color={C.accent} />
          ) : (
            <View style={styles.chips}>
              {people
                .filter((p) => p.cashier_id !== me?.id)
                .map((p) => {
                  const active = p.cashier_id === cashierId;
                  return (
                    <TouchableOpacity
                      key={p.cashier_id}
                      onPress={() => {
                        setCashierId(p.cashier_id);
                        setCashierName(p.name ?? undefined);
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {p.name ?? 'Attendant'} · {naira(p.outstanding_now)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              {people.length === 0 && <Text style={styles.muted}>No Attendants yet.</Text>}
            </View>
          )}
          {!!cashierId && owed !== undefined && (
            <Text style={[styles.muted, { marginTop: 6 }]}>
              {cashierName ?? 'They'} owe{owed > 0 ? '' : 's'} {naira(owed)} in total.
            </Text>
          )}

          <Text style={styles.section}>Amount</Text>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            mode="outlined"
            left={<TextInput.Affix text="₦" />}
            style={{ backgroundColor: C.card, fontSize: 22 }}
          />
          {!!owed && owed > 0 && (
            <TouchableOpacity onPress={() => setAmount(String(owed))} style={{ marginTop: 6 }}>
              <Text style={{ color: C.accent, fontWeight: '700' }}>Use full balance ({naira(owed)})</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.section}>Paid as</Text>
          <View style={styles.chips}>
            {METHODS.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMethod(m)}
                style={[styles.chip, method === m && styles.chipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m }}
              >
                <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{REMITTANCE_METHOD_LABELS[m]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            label={needsRef ? 'Reference (required — bank narration or POS slip)' : 'Reference (optional)'}
            value={reference}
            onChangeText={setReference}
            mode="outlined"
            dense
            style={{ backgroundColor: C.card, marginTop: 10 }}
          />
          <TextInput
            label="Note (optional)"
            value={narration}
            onChangeText={setNarration}
            mode="outlined"
            dense
            style={{ backgroundColor: C.card, marginTop: 10 }}
          />

          {canBackdate && date && today && (
            <>
              <Text style={styles.section}>Business day</Text>
              <DayPicker date={date} today={today} onChange={setDate} />
              {date !== today && (
                <Text style={[styles.muted, { textAlign: 'center' }]}>Recording for a past day. This is noted in the audit log.</Text>
              )}
            </>
          )}

          <Button
            mode="contained"
            buttonColor={C.accent}
            style={{ marginTop: 20 }}
            contentStyle={{ paddingVertical: 6 }}
            onPress={() => submit()}
            loading={busy}
            disabled={!valid || busy || !online || !clientRef}
          >
            {Number(amount) > 0 ? `Record ${naira(Number(amount))}` : 'Record money'}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  muted: { fontSize: 12, color: C.muted },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: C.ink },
  chipTextActive: { color: C.accentFg },
});
