import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {
  BAR_PAYMENT_METHOD_LABELS,
  REMITTANCE_METHOD_LABELS,
  describeBalance,
  type BarDashboard,
} from '@jaypos/shared';

import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { DayPicker, Kpi, MixRows } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Bar Controller / manager overview (Bar/Lounge Phase 3): the day's sales and
 * money across every Attendant, what each one still owes (brought forward kept
 * apart from today), customer payment mix vs. what was actually handed over, and
 * pending orders / reversal requests. Refreshes every 15 s while open.
 */
export default function BarDashboardScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { can } = useBusinessMode();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [data, setData] = useState<BarDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await barApi.dashboard(date));
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load the dashboard.'));
    }
  }, [date]);

  usePolling(load, 15000);

  if (!can('bar.ledger.view_all')) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Attendants & money" onBack={() => navigation.goBack()} />
        <Text style={[styles.muted, { margin: 16 }]}>Only Bar Controllers and managers can see this.</Text>
      </View>
    );
  }

  const t = data?.totals;
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Attendants & money" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Figures may be out of date." />}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={C.accent}
          />
        }
      >
        {!!error && <Text style={styles.error}>{error}</Text>}
        {data && t && (
          <>
            <DayPicker date={data.business_date} today={data.today} onChange={setDate} />
            <View style={styles.grid}>
              <Kpi label="Sales" value={naira(t.sales)} hint={`${t.completed_orders} orders released`} />
              <Kpi label="Handed over" value={naira(t.remitted)} />
              <Kpi label="Brought forward" value={naira(t.brought_forward)} hint="owed from earlier days" tone="muted" />
              <Kpi label="Still owed now" value={naira(t.outstanding_now)} tone={describeBalance(t.outstanding_now)} />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {can('bar.remittance.record') && (
                <Button mode="contained" buttonColor={C.accent} icon="cash-plus" style={{ flex: 1 }} disabled={!online}
                  onPress={() => navigation.navigate('BarRemittance')}>
                  Record money
                </Button>
              )}
              <Button mode="outlined" icon="inbox-arrow-down" style={{ flex: 1 }}
                onPress={() => navigation.navigate('BarOrders', { mode: 'queue' })}>
                Queue{t.pending_orders ? ` (${t.pending_orders})` : ''}
              </Button>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {can('bar.damage.record') && (
                <Button mode="outlined" icon="bottle-wine-outline" style={{ flex: 1 }} onPress={() => navigation.navigate('BarDamage')}>
                  Flat / damaged
                </Button>
              )}
              {can('bar.dayclose.acknowledge') ? (
                <Button mode="outlined" icon="inbox-full-outline" style={{ flex: 1 }} onPress={() => navigation.navigate('BarHandover')}>
                  Day closes
                </Button>
              ) : can('bar.dayclose.submit') ? (
                <Button mode="outlined" icon="lock-outline" style={{ flex: 1 }} onPress={() => navigation.navigate('BarDayClose')}>
                  Close my day
                </Button>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button mode="outlined" icon="chart-box-outline" style={{ flex: 1 }} onPress={() => navigation.navigate('BarReports')}>
                Reports
              </Button>
              {can('bar.commission.manage') && (
                <Button mode="outlined" icon="percent-outline" style={{ flex: 1 }} onPress={() => navigation.navigate('BarCommission')}>
                  Commission
                </Button>
              )}
            </View>
            {t.reversal_requests > 0 && can('bar.reversal.approve') && (
              <TouchableOpacity style={styles.notice} onPress={() => navigation.navigate('BarOrders', { mode: 'queue', tab: 'reversals' })}>
                <MaterialCommunityIcons name="undo-variant" size={18} color="#B45309" />
                <Text style={styles.noticeText}>
                  {t.reversal_requests} reversal request{t.reversal_requests === 1 ? '' : 's'} waiting for you
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#B45309" />
              </TouchableOpacity>
            )}
            {t.inactive_with_balance > 0 && (
              <Text style={[styles.muted, { marginTop: 8, color: '#B45309' }]}>
                {t.inactive_with_balance} former staff member{t.inactive_with_balance === 1 ? '' : 's'} still owe money.
              </Text>
            )}

            <Text style={styles.section}>Attendants</Text>
            <View style={styles.card}>
              {data.attendants.length === 0 && <Text style={styles.muted}>No Attendants yet. Assign profiles in Bar / Lounge setup.</Text>}
              {data.attendants.map((a) => (
                <TouchableOpacity
                  key={a.cashier_id}
                  style={styles.row}
                  onPress={() => navigation.navigate('BarCashier', { cashierId: a.cashier_id })}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>
                      {a.name ?? 'Attendant'}
                      {!a.is_active ? '  (inactive)' : ''}
                    </Text>
                    <Text style={styles.muted}>
                      Sales {naira(a.sales)} · handed {naira(a.remitted)}
                      {a.brought_forward ? ` · b/f ${naira(a.brought_forward)}` : ''}
                      {a.pending_orders ? ` · ${a.pending_orders} waiting` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.owed, describeBalance(a.outstanding_now) === 'owes' && { color: C.red }, describeBalance(a.outstanding_now) === 'credit' && { color: '#047857' }]}>
                    {naira(a.outstanding_now)}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={C.muted} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.twoCol}>
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.cardTitle}>Customers paid by</Text>
                <MixRows mix={data.payment_mix} labels={BAR_PAYMENT_METHOD_LABELS} />
              </View>
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.cardTitle}>Handed over as</Text>
                <MixRows mix={data.remittance_mix} labels={REMITTANCE_METHOD_LABELS} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  error: { color: C.red, marginBottom: 8 },
  muted: { fontSize: 12, color: C.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 14 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  rowTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  owed: { fontSize: 15, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: C.amberBg },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#92400E' },
});
