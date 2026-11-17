import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  COMMISSION_STATUS_LABELS,
  REMITTANCE_METHOD_LABELS,
  reportRangePresets,
  type CommissionLine,
  type CommissionRun,
  type RemittanceMethod,
} from '@jaypos/shared';

import { RootState } from '../redux/store';
import { barApi, barErrorDetails, barErrorMessage } from '../services/barApi';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { DayPicker, Kpi, ReasonDialog } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Attendant commission (manager / owner, Bar/Lounge Phase 5).
 *
 *  - New run: pick a period → a DRAFT preview of rate × each Attendant's total
 *    sales (D27). Attendants already paid for an overlapping period are skipped.
 *  - Post: figures are recomputed and each Attendant's commission becomes ONE
 *    expense under "Cashier Commission" (it shows in Expenses and the P&L).
 *  - Mark paid: per Attendant, with method and reference.
 *  - Cancel: discard a draft, or undo a posted run that has nothing paid yet.
 */
const PAY: RemittanceMethod[] = ['cash', 'transfer', 'card', 'other'];

export default function BarCommissionScreen() {
  const route = useRoute<any>();
  return route.params?.runId ? <RunDetail runId={route.params.runId} /> : <RunList />;
}

function RunList() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { can } = useBusinessMode();
  const settings = useSelector((s: RootState) => s.settings.settings);
  const [runs, setRuns] = useState<CommissionRun[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRuns(await barApi.commissionRuns());
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => {
    load();
    barApi.dashboard().then((d) => {
      setToday(d.today);
      const p = reportRangePresets(d.today).find((x) => x.key === '7d')!;
      setStart(p.from);
      setEnd(p.to);
    }).catch(() => {});
  }, [load]);

  const presets = useMemo(() => (today ? reportRangePresets(today).filter((p) => p.key !== 'today') : []), [today]);

  const draft = async () => {
    if (!start || !end) return;
    setBusy(true);
    try {
      const run = await barApi.draftCommission({ period_start: start, period_end: end });
      if (run.skipped_already_posted?.length) {
        Alert.alert('Some Attendants skipped', `${run.skipped_already_posted.length} Attendant(s) already have posted commission for part of this period.`);
      }
      navigation.push('BarCommission', { runId: run.id });
      load();
    } catch (e) {
      const d = barErrorDetails(e);
      Alert.alert(d?.code === 'COMMISSION_DISABLED' ? 'Commission is off' : 'No run created', barErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!can('bar.commission.manage')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Commission" onBack={() => navigation.goBack()} />
        <Text style={[styles.muted, { margin: 16 }]}>Only managers and owners manage commission.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Commission" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Commission can't be calculated until you reconnect." />}
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.accent} />}>
        {!settings?.commission_enabled ? (
          <View style={styles.warn}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#B45309" />
            <Text style={styles.warnText}>Commission is off. Turn it on and set a rate in Bar / Lounge setup.</Text>
          </View>
        ) : (
          <Text style={styles.muted}>
            Rate {settings.commission_rate ?? 0}% × each Attendant's total sales (after reversals). Posting adds one expense per Attendant.
          </Text>
        )}

        <Text style={styles.section}>New run</Text>
        <View style={styles.card}>
          <View style={styles.chips}>
            {presets.map((p) => (
              <TouchableOpacity key={p.key} onPress={() => { setStart(p.from); setEnd(p.to); }} style={[styles.chip, start === p.from && end === p.to && styles.chipActive]}>
                <Text style={[styles.chipText, start === p.from && end === p.to && styles.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {start && end && today && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rangeLabel}>From</Text>
                <DayPicker date={start} today={end} onChange={setStart} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rangeLabel}>To</Text>
                <DayPicker date={end} today={today} onChange={setEnd} />
              </View>
            </View>
          )}
          <Button mode="contained" buttonColor={C.accent} onPress={draft} loading={busy} disabled={busy || !online || !start || !settings?.commission_enabled} style={{ marginTop: 8 }}>
            Calculate (draft)
          </Button>
        </View>

        <Text style={styles.section}>Runs</Text>
        {runs?.length === 0 && <Text style={styles.muted}>No runs yet.</Text>}
        {runs?.map((r) => (
          <TouchableOpacity key={r.id} style={styles.item} onPress={() => navigation.push('BarCommission', { runId: r.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{r.period_start} – {r.period_end}</Text>
              <Text style={styles.muted}>
                {COMMISSION_STATUS_LABELS[r.status]} · {r.lines.length} Attendant(s) · {r.rate}%
                {r.status === 'posted' ? ` · paid ${naira(r.totals.paid)}` : ''}
              </Text>
            </View>
            <Text style={styles.amount}>{naira(r.totals.commission)}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={C.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const [run, setRun] = useState<CommissionRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [payLine, setPayLine] = useState<CommissionLine | null>(null);
  const [payMethod, setPayMethod] = useState<RemittanceMethod>('cash');
  const [payRef, setPayRef] = useState('');

  const load = useCallback(async () => {
    try {
      setRun(await barApi.commissionRun(runId));
    } catch (e) {
      Alert.alert('Could not load', barErrorMessage(e));
    }
  }, [runId]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<CommissionRun>, done?: string) => {
    setBusy(true);
    try {
      setRun(await fn());
      if (done) Alert.alert(done);
    } catch (e) {
      Alert.alert('Not done', barErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPost = () =>
    Alert.alert(
      'Post this commission?',
      `Figures are recalculated now, and ${naira(run?.totals.commission ?? 0)} becomes expenses under "Cashier Commission". You can still undo it while nothing is paid.`,
      [{ text: 'Back', style: 'cancel' }, { text: 'Post', onPress: () => act(() => barApi.postCommission(runId), 'Posted to expenses') }]
    );

  if (!run) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Commission" title="Run" onBack={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={`Commission · ${COMMISSION_STATUS_LABELS[run.status]}`} title={`${run.period_start} – ${run.period_end}`} onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline." />}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          <Kpi label="Total sales" value={naira(run.totals.eligible_sales)} hint={`at ${run.rate}%`} />
          <Kpi label="Commission" value={naira(run.totals.commission)} />
          {run.status === 'posted' && <Kpi label="Paid" value={naira(run.totals.paid)} tone={run.totals.paid >= run.totals.commission ? 'credit' : 'muted'} />}
        </View>
        {run.status === 'cancelled' && !!run.cancelled_reason && <Text style={[styles.muted, { marginTop: 8 }]}>Cancelled: {run.cancelled_reason}</Text>}

        <Text style={styles.section}>Attendants</Text>
        <View style={styles.card}>
          {run.lines.map((l) => (
            <View key={l.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{l.cashier.name ?? 'Attendant'}</Text>
                <Text style={styles.muted}>
                  Sales {naira(l.gross_sales)}
                  {l.reversals ? ` − reversed ${naira(Math.abs(l.reversals))}` : ''} = {naira(l.eligible_sales)}
                  {l.payment_status === 'paid' ? ` · paid (${REMITTANCE_METHOD_LABELS[l.paid_method as RemittanceMethod] ?? l.paid_method})` : ''}
                </Text>
              </View>
              <Text style={styles.amount}>{naira(l.commission_amount)}</Text>
              {run.status === 'posted' && l.payment_status === 'unpaid' && l.commission_amount > 0 && (
                <Button compact mode="outlined" disabled={!online} onPress={() => { setPayLine(l); setPayMethod('cash'); setPayRef(''); }}>Pay</Button>
              )}
            </View>
          ))}
        </View>

        {run.status === 'draft' && (
          <Button mode="contained" buttonColor={C.accent} icon="check" style={{ marginTop: 16 }} onPress={confirmPost} loading={busy} disabled={busy || !online}>
            Post to expenses
          </Button>
        )}
        {run.status !== 'cancelled' && !run.lines.some((l) => l.payment_status === 'paid') && (
          <Button mode="outlined" textColor={C.red} style={{ marginTop: 8 }} disabled={busy || !online} onPress={() => setCancelOpen(true)}>
            {run.status === 'draft' ? 'Discard draft' : 'Undo posting'}
          </Button>
        )}
      </ScrollView>

      <ReasonDialog
        visible={cancelOpen}
        title={run.status === 'draft' ? 'Discard this draft?' : 'Undo this posting?'}
        message={run.status === 'posted' ? 'Its expenses are voided.' : undefined}
        confirmLabel={run.status === 'draft' ? 'Discard' : 'Undo'}
        destructive
        onCancel={() => setCancelOpen(false)}
        onConfirm={(r) => { setCancelOpen(false); act(() => barApi.cancelCommission(runId, r)); }}
      />

      <Portal>
        <Dialog visible={!!payLine} onDismiss={() => setPayLine(null)} style={{ backgroundColor: C.card }}>
          <Dialog.Title>Pay {payLine?.cashier.name ?? 'Attendant'} {naira(payLine?.commission_amount ?? 0)}</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <View style={styles.chips}>
              {PAY.map((m) => (
                <TouchableOpacity key={m} onPress={() => setPayMethod(m)} style={[styles.chip, payMethod === m && styles.chipActive]}>
                  <Text style={[styles.chipText, payMethod === m && styles.chipTextActive]}>{REMITTANCE_METHOD_LABELS[m]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput label="Reference (optional)" value={payRef} onChangeText={setPayRef} mode="outlined" dense style={{ backgroundColor: C.card }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPayLine(null)}>Back</Button>
            <Button
              loading={busy}
              disabled={busy}
              onPress={() => {
                const l = payLine!;
                setPayLine(null);
                act(() => barApi.payCommissionLine(l.id, payMethod, payRef.trim() || undefined), 'Payment recorded');
              }}
            >
              Record payment
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
  muted: { fontSize: 12, color: C.muted, lineHeight: 17 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 12, fontWeight: '700', color: C.ink },
  chipTextActive: { color: C.accentFg },
  rangeLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center', textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  amount: { fontSize: 15, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: C.amberBg },
  warnText: { flex: 1, fontSize: 12, color: '#92400E' },
});
