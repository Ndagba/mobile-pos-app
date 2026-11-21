import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { OPERATIONAL_PROFILE_LABELS, type CashierSummary } from '@jaypos/shared';

import { RootState } from '../redux/store';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { barApi } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { C, naira } from '../theme';

/**
 * Home tab for cashiers in a Bar / Lounge store (Bar/Lounge planning, Phase 1).
 * Replaces the retail Dashboard, whose "New sale" would bypass the Bar Controller.
 * Shows the cashier's bar duty and the shortcuts for it: orders, balance and
 * remittances, damages, day close and reports (all shipped in Phases 2–5).
 */
const PROFILE_DUTIES = {
  bar_attendant: [
    { icon: 'cart-plus', text: 'Take customer orders and send them to the Bar Controller' },
    { icon: 'progress-clock', text: 'Follow each order until the drinks are released' },
    { icon: 'cash-check', text: 'See your sales, what you have handed over, and what you still owe' },
  ],
  bar_controller: [
    { icon: 'inbox-arrow-down', text: "Receive every Attendant's orders and release the drinks" },
    { icon: 'cash-register', text: 'Record money handed over by each Attendant' },
    { icon: 'bottle-wine-outline', text: 'Record flat or damaged drinks' },
    { icon: 'calendar-check', text: 'Close your day and hand over to the manager' },
  ],
} as const;

export default function BarHomeScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const { profile, canRetailCheckout } = useBusinessMode();
  const name = user?.first_name || 'there';

  // Attendant headline (Phase 3): what they owe right now, refreshed while open.
  const [summary, setSummary] = useState<CashierSummary | null>(null);
  const loadSummary = useCallback(async () => {
    if (profile !== 'bar_attendant') return;
    try {
      setSummary(await barApi.mySummary());
    } catch {
      // offline / not yet available — keep the last figure
    }
  }, [profile]);
  usePolling(loadSummary, 30000);

  // Bar Controller: how many orders are waiting (same "open" set as the queue's Open tab).
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const loadQueueCount = useCallback(async () => {
    if (profile !== 'bar_controller') return;
    try {
      setQueueCount((await barApi.queue()).length);
    } catch {
      // offline: keep the last count
    }
  }, [profile]);
  usePolling(loadQueueCount, 10000);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 150 }]}>
      <Text style={styles.eyebrow}>Bar / Lounge</Text>
      <Text style={styles.title}>Hello, {name}</Text>

      <View style={styles.card}>
        <View style={styles.badgeRow}>
          <MaterialCommunityIcons
            name={profile ? 'badge-account-outline' : 'account-question-outline'}
            size={22}
            color={profile ? C.accent : C.amber}
          />
          <Text style={styles.badgeText}>
            {profile ? OPERATIONAL_PROFILE_LABELS[profile] : 'No bar duty assigned yet'}
          </Text>
        </View>

        {profile ? (
          <>
            <Text style={styles.muted}>Your duty in this store:</Text>
            {PROFILE_DUTIES[profile].map((d) => (
              <View key={d.text} style={styles.dutyRow}>
                <MaterialCommunityIcons name={d.icon as any} size={18} color={C.ink} />
                <Text style={styles.body}>{d.text}</Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.body}>
            Ask your store admin to make you a Bar Controller or an Attendant. Until then you can't sell from this
            device.
          </Text>
        )}
      </View>

      {/* Duty shortcuts */}
      {profile === 'bar_attendant' && summary && (
        <TouchableOpacity style={styles.owedCard} activeOpacity={0.85} onPress={() => navigation.navigate('BarCashier')}>
          <View style={{ flex: 1 }}>
            <Text style={styles.muted}>You owe</Text>
            <Text style={[styles.owedValue, summary.outstanding_now > 0 && { color: C.red }]}>{naira(Math.max(0, summary.outstanding_now))}</Text>
            <Text style={styles.muted}>
              Today: sales {naira(summary.sales)} · handed over {naira(summary.remitted)}
              {summary.brought_forward > 0 ? ` · ${naira(summary.brought_forward)} from earlier days` : ''}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={C.muted} />
        </TouchableOpacity>
      )}
      {profile === 'bar_attendant' && (
        <View style={styles.actions}>
          <ActionTile icon="cart-plus" label="New order" primary onPress={() => navigation.navigate('BarNewOrder')} />
          <ActionTile icon="format-list-checks" label="My orders" onPress={() => navigation.navigate('BarOrders', { mode: 'mine' })} />
          <ActionTile icon="wallet-outline" label="My balance" onPress={() => navigation.navigate('BarCashier')} />
        </View>
      )}
      {profile === 'bar_controller' && (
        <>
          <View style={styles.actions}>
            <ActionTile icon="inbox-arrow-down" label={queueCount != null ? `Order queue (${queueCount})` : 'Order queue'} primary onPress={() => navigation.navigate('BarOrders', { mode: 'queue' })} />
            <ActionTile icon="cash-plus" label="Record money" onPress={() => navigation.navigate('BarRemittance')} />
          </View>
          <View style={styles.actions}>
            <ActionTile icon="account-group-outline" label="Attendants & money" onPress={() => navigation.navigate('BarDashboard')} />
            <ActionTile icon="bottle-wine-outline" label="Flat / damaged" onPress={() => navigation.navigate('BarDamage')} />
          </View>
          <View style={styles.actions}>
            <ActionTile icon="lock-outline" label="Close my day" onPress={() => navigation.navigate('BarDayClose')} />
            <ActionTile icon="chart-box-outline" label="Reports" onPress={() => navigation.navigate('BarReports')} />
          </View>
        </>
      )}

      {canRetailCheckout && (
        <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={() => navigation.navigate('Checkout')}>
          <MaterialCommunityIcons name="cart-outline" size={18} color={C.accentFg} />
          <Text style={styles.ctaText}>Walk-up sale (recorded as your own)</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function ActionTile({ icon, label, primary, onPress }: { icon: string; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.tile, primary && styles.tilePrimary]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon as any} size={24} color={primary ? C.accentFg : C.accent} />
      <Text style={[styles.tileText, primary && { color: C.accentFg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  owedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  owedValue: { fontSize: 30, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  tile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 22, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  tilePrimary: { backgroundColor: C.accent, borderColor: C.accent },
  tileText: { fontSize: 15, fontWeight: '800', color: C.ink },
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.5, marginBottom: 16 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badgeText: { fontSize: 16, fontWeight: '800', color: C.ink, flexShrink: 1 },
  muted: { fontSize: 12, color: C.muted },
  body: { fontSize: 14, lineHeight: 20, color: C.ink, flexShrink: 1 },
  dutyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cta: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: C.accent },
  ctaText: { fontSize: 15, fontWeight: '700', color: C.accentFg },
});
