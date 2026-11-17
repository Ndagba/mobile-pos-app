import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, RefreshControl } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  DAY_CLOSE_STATUS_LABELS,
  dayCloseSummaryText,
  type DayClose,
} from '@jaypos/shared';

import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { ReasonDialog } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Handover inbox (manager / owner, Bar/Lounge Phase 4).
 *
 * Every Bar Controller's day close for the manager's branches. Acknowledge =
 * "I received this cash" (a different amount needs a note). A cash shortage must
 * be settled (D23): absorb it as a house loss, or charge it to the controller's
 * own balance. Reopen (with a reason) unlocks the day for corrections and undoes
 * a shortage charge.
 */
const TABS = [
  { key: 'submitted', label: 'Waiting' },
  { key: 'acknowledged', label: 'Handed over' },
  { key: 'reopened', label: 'Reopened' },
];

export default function BarHandoverScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { can } = useBusinessMode();
  const [tab, setTab] = useState('submitted');
  const [rows, setRows] = useState<DayClose[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ack, setAck] = useState<DayClose | null>(null);
  const [ackAmount, setAckAmount] = useState('');
  const [ackNote, setAckNote] = useState('');
  const [treatment, setTreatment] = useState<'absorb' | 'charge_controller' | null>(null);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await barApi.dayCloses({ status: tab }));
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load handovers.'));
    }
  }, [tab]);
  usePolling(load, 20000);

  const openAck = (c: DayClose) => {
    setAck(c);
    setAckAmount(String(c.counted_cash));
    setAckNote('');
    setTreatment(c.variance < 0 ? null : 'absorb');
  };

  const submitAck = async () => {
    if (!ack) return;
    setBusy(true);
    try {
      await barApi.acknowledgeDayClose(ack.id, {
        acknowledged_amount: Number(ackAmount),
        note: ackNote.trim() || undefined,
        variance_treatment: ack.variance < 0 ? treatment ?? undefined : undefined,
      });
      setAck(null);
      load();
    } catch (e) {
      Alert.alert('Not acknowledged', barErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (reason: string) => {
    if (!reopenId) return;
    try {
      await barApi.reopenDayClose(reopenId, reason);
      load();
    } catch (e) {
      Alert.alert('Not reopened', barErrorMessage(e));
    } finally {
      setReopenId(null);
    }
  };

  if (!can('bar.dayclose.acknowledge')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Day closes" onBack={() => navigation.goBack()} />
        <Text style={[styles.muted, { margin: 16 }]}>Only managers and owners receive handovers.</Text>
      </View>
    );
  }

  const ackDiffers = ack && Math.abs(Number(ackAmount) - ack.counted_cash) > 0.009;

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Day closes" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Handovers can't be acknowledged until you reconnect." />}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} onPress={() => { setTab(t.key); setRows(null); }} style={[styles.tab, tab === t.key && styles.tabActive]}
            accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.accent} />}
      >
        {!!error && <Text style={styles.error}>{error}</Text>}
        {rows?.length === 0 && <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>Nothing here.</Text>}
        {rows?.map((c) => {
          const f = c.snapshot;
          return (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{c.closed_by.name ?? 'Bar Controller'}</Text>
                  <Text style={styles.muted}>{c.business_date} · {DAY_CLOSE_STATUS_LABELS[c.status]}</Text>
                </View>
                <TouchableOpacity onPress={() => Share.share({ message: dayCloseSummaryText(c, naira) }).catch(() => {})} accessibilityLabel="Share summary" style={styles.iconBtn}>
                  <MaterialCommunityIcons name="share-variant-outline" size={18} color={C.accent} />
                </TouchableOpacity>
              </View>
              <Row label="Orders released" value={`${f?.orders_released?.count ?? 0} · ${naira(f?.orders_released?.total ?? 0)}`} />
              <Row label="Transfers / POS (in bank)" value={`${naira(c.expected.transfer)} / ${naira(c.expected.card)}`} />
              <Row label="Cash expected" value={naira(c.expected.cash)} />
              <Row label="Cash counted" value={naira(c.counted_cash)} strong />
              {Math.abs(c.variance) > 0.009 && (
                <Row label={c.variance < 0 ? 'Short' : 'Over'} value={`${naira(Math.abs(c.variance))}${c.variance_reason ? ` — ${c.variance_reason}` : ''}`}
                  color={c.variance < 0 ? C.red : '#B45309'} />
              )}
              <Row label="Damaged / flat" value={`${f?.damages?.quantity ?? 0} · ${naira(f?.damages?.cost_value ?? 0)} at cost`} />
              {!!c.notes && <Row label="Note" value={c.notes} />}
              {c.status === 'acknowledged' && (
                <Row label="You received" value={`${naira(c.acknowledged_amount ?? 0)}${c.variance_treatment === 'charge_controller' ? ' · shortage charged' : c.variance_treatment === 'absorb' ? ' · shortage absorbed' : ''}${c.ack_note ? ` — ${c.ack_note}` : ''}`} />
              )}
              {c.status === 'reopened' && <Row label="Reopened" value={c.reopen_reason ?? ''} />}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {c.status === 'submitted' && (
                  <Button mode="contained" buttonColor={C.accent} style={{ flex: 1 }} disabled={!online} onPress={() => openAck(c)}>
                    Acknowledge
                  </Button>
                )}
                {c.status !== 'reopened' && (
                  <Button mode="outlined" style={{ flex: 1 }} disabled={!online} onPress={() => setReopenId(c.id)}>
                    Reopen
                  </Button>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Portal>
        <Dialog visible={!!ack} onDismiss={() => setAck(null)} style={{ backgroundColor: C.card }}>
          <Dialog.Title>Cash received</Dialog.Title>
          <Dialog.Content style={{ gap: 10 }}>
            <Text style={styles.muted}>{ack?.closed_by.name ?? 'The Bar Controller'} counted {naira(ack?.counted_cash ?? 0)}.</Text>
            <TextInput label="Amount you received (₦)" value={ackAmount} onChangeText={(v) => setAckAmount(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad" mode="outlined" dense style={{ backgroundColor: C.card }} />
            {(ackDiffers || (ack && ack.variance < 0)) && (
              <TextInput label={ackDiffers ? 'Note (required)' : 'Note (optional)'} value={ackNote} onChangeText={setAckNote}
                mode="outlined" dense style={{ backgroundColor: C.card }} />
            )}
            {ack && ack.variance < 0 && (
              <>
                <Text style={styles.label}>Settle the {naira(Math.abs(ack.variance))} shortage</Text>
                {(['absorb', 'charge_controller'] as const).map((t) => (
                  <TouchableOpacity key={t} onPress={() => setTreatment(t)} style={[styles.option, treatment === t && styles.optionActive]}
                    accessibilityRole="radio" accessibilityState={{ selected: treatment === t }}>
                    <MaterialCommunityIcons name={treatment === t ? 'radiobox-marked' : 'radiobox-blank'} size={18} color={treatment === t ? C.accent : C.muted} />
                    <Text style={styles.optionText}>
                      {t === 'absorb' ? 'Absorb it (house loss)' : `Charge it to ${ack.closed_by.name ?? 'the Bar Controller'}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAck(null)}>Back</Button>
            <Button onPress={submitAck} loading={busy}
              disabled={busy || ackAmount === '' || (!!ackDiffers && !ackNote.trim()) || (!!ack && ack.variance < 0 && !treatment)}>
              Acknowledge
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <ReasonDialog
        visible={!!reopenId}
        title="Reopen this day?"
        message="The Bar Controller can correct it and close again. A shortage you charged will be undone."
        confirmLabel="Reopen"
        onCancel={() => setReopenId(null)}
        onConfirm={reopen}
      />
    </View>
  );
}

function Row({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontWeight: '800', fontSize: 15 }, color ? { color } : null]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  error: { color: C.red, marginBottom: 8 },
  muted: { fontSize: 12, color: C.muted },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  tabActive: { backgroundColor: C.ink, borderColor: C.ink },
  tabText: { fontSize: 13, fontWeight: '700', color: C.ink },
  tabTextActive: { color: C.card },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '800', color: C.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  rowValue: { flexShrink: 1, fontSize: 13, color: C.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetBg },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border },
  optionActive: { borderColor: C.accent, backgroundColor: C.violetBg },
  optionText: { fontSize: 13, color: C.ink, flexShrink: 1 },
});
