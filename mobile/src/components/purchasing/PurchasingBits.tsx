import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../../redux/store';
import { C } from '../../theme';
import { POStatus, PO_STATUS_LABEL } from '../../utils/purchaseOrders';

/** Purchasing is admin + manager only (the backend enforces the same on every write). */
export function useCanPurchase(): boolean {
  const role = useSelector((s: RootState) => s.auth.user?.role);
  return role === 'admin' || role === 'manager';
}

export function useIsOnline(): boolean {
  return useSelector((s: RootState) => s.sync.isConnected);
}

const STATUS_TONE: Record<POStatus, { fg: string; bg: string }> = {
  draft: { fg: C.muted, bg: 'rgba(113,113,122,0.12)' },
  ordered: { fg: C.violet, bg: C.violetBg },
  partially_received: { fg: '#B45309', bg: C.amberBg },
  received: { fg: '#047857', bg: C.greenBg },
  cancelled: { fg: C.red, bg: C.redBg },
};

export function POStatusBadge({ status }: { status: POStatus }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.draft;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{PO_STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

export function OfflineBanner({ message }: { message?: string }) {
  return (
    <View style={styles.offline}>
      <MaterialCommunityIcons name="wifi-off" size={16} color="#B45309" />
      <Text style={styles.offlineText}>
        {message ??
          "You're offline. Purchasing needs a connection — orders can't be created, submitted or received until you reconnect. Anything shown may be out of date."}
      </Text>
    </View>
  );
}

export function PurchasingHeader({
  eyebrow,
  title,
  onBack,
  right,
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <MaterialCommunityIcons name="arrow-left" size={22} color={C.ink} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/** Full-screen lock shown if a cashier ever reaches a purchasing route. */
export function PurchasingLocked({ onBack, feature = 'Purchasing' }: { onBack: () => void; feature?: string }) {
  return (
    <View style={styles.locked}>
      <MaterialCommunityIcons name="lock-outline" size={48} color={C.muted} />
      <Text style={styles.lockedText}>{feature} is available to admins and managers only.</Text>
      <TouchableOpacity onPress={onBack} style={styles.lockedBtn}>
        <Text style={styles.lockedBtnText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

export const fmtDate = (s?: string | null): string => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Trim float noise from Decimal(15,4) quantities: 2.5000 → "2.5". */
export const fmtQty = (n: number): string => String(Math.round(n * 10000) / 10000);

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  offline: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    borderRadius: 12, backgroundColor: C.amberBg,
  },
  offlineText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#92400E' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  eyebrow: { fontSize: 12, fontWeight: '500', color: C.muted },
  title: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  locked: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  lockedText: { fontSize: 15, color: C.muted, textAlign: 'center' },
  lockedBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  lockedBtnText: { fontSize: 13, fontWeight: '700', color: C.ink },
});
