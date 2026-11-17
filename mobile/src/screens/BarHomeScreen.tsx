import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { OPERATIONAL_PROFILE_LABELS } from '@jaypos/shared';

import { RootState } from '../redux/store';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { C } from '../theme';

/**
 * Home tab for cashiers in a Bar / Lounge store (Bar/Lounge planning, Phase 1).
 * Replaces the retail Dashboard, whose "New sale" would bypass the Bar Controller.
 * The order queue, attendant dashboard and remittances arrive in Phases 2–3; for
 * now this shows the cashier's bar duty and what it will let them do.
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}>
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
            <View style={styles.notice}>
              <MaterialCommunityIcons name="rocket-launch-outline" size={16} color={C.accent} />
              <Text style={[styles.body, { flex: 1 }]}>
                Payments, balances and day close arrive in the next app updates.
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.body}>
            Ask your store admin to make you a Bar Controller or an Attendant. Until then you can't sell from this
            device.
          </Text>
        )}
      </View>

      {/* Phase 2 actions */}
      {profile === 'bar_attendant' && (
        <View style={styles.actions}>
          <ActionTile icon="cart-plus" label="New order" primary onPress={() => navigation.navigate('BarNewOrder')} />
          <ActionTile icon="format-list-checks" label="My orders" onPress={() => navigation.navigate('BarOrders', { mode: 'mine' })} />
        </View>
      )}
      {profile === 'bar_controller' && (
        <View style={styles.actions}>
          <ActionTile icon="inbox-arrow-down" label="Order queue" primary onPress={() => navigation.navigate('BarOrders', { mode: 'queue' })} />
        </View>
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
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, padding: 10, borderRadius: 12, backgroundColor: C.violetBg },
  cta: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: C.accent },
  ctaText: { fontSize: 15, fontWeight: '700', color: C.accentFg },
});
