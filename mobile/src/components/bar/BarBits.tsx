import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BAR_ORDER_STATUS_LABELS,
  BAR_PAYMENT_METHOD_LABELS,
  barOrderAmount,
  type BarOrder,
  type BarOrderStatus,
} from '@jaypos/shared';
import { C, naira } from '../../theme';

const TONE: Record<BarOrderStatus, { fg: string; bg: string }> = {
  submitted: { fg: '#B45309', bg: C.amberBg },
  accepted: { fg: C.violet, bg: C.violetBg },
  fulfilled: { fg: '#047857', bg: C.greenBg },
  cancelled: { fg: C.muted, bg: 'rgba(113,113,122,0.12)' },
  rejected: { fg: C.red, bg: C.redBg },
  reversed: { fg: C.red, bg: C.redBg },
};

export function BarStatusBadge({ status }: { status: BarOrderStatus }) {
  const tone = TONE[status] ?? TONE.submitted;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{BAR_ORDER_STATUS_LABELS[status] ?? status}</Text>
    </View>
  );
}

const timeAgo = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-NG');
};

export function BarOrderCard({
  order,
  showAttendant,
  onPress,
}: {
  order: BarOrder;
  showAttendant?: boolean;
  onPress: () => void;
}) {
  const lines = order.items.reduce((n, it) => n + (it.quantity_fulfilled ?? it.quantity_requested), 0);
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onPress} accessibilityRole="button">
      <View style={styles.cardTop}>
        <Text style={styles.orderNo}>{order.order_number.split('-').pop()}</Text>
        <BarStatusBadge status={order.status} />
        <View style={{ flex: 1 }} />
        <Text style={styles.amount}>{naira(barOrderAmount(order))}</Text>
      </View>
      <Text style={styles.items} numberOfLines={2}>
        {order.items
          .map((it) => `${it.quantity_fulfilled ?? it.quantity_requested} × ${it.product_name ?? 'Item'}`)
          .join(', ')}
      </Text>
      <View style={styles.cardMeta}>
        {showAttendant && (
          <Text style={styles.meta}>
            <MaterialCommunityIcons name="account-outline" size={12} color={C.muted} /> {order.initiated_by.name ?? 'Attendant'}
          </Text>
        )}
        {!!order.table_label && <Text style={styles.meta}>Table {order.table_label}</Text>}
        <Text style={styles.meta}>{lines} item{lines === 1 ? '' : 's'}</Text>
        {!!order.customer_payment_method && (
          <Text style={styles.meta}>{BAR_PAYMENT_METHOD_LABELS[order.customer_payment_method]}</Text>
        )}
        <View style={{ flex: 1 }} />
        <Text style={styles.meta}>{timeAgo(order.submitted_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** A small dialog that asks for a reason (≥ 3 characters) before a destructive bar action. */
export function ReasonDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);
  const ok = reason.trim().length >= 3;
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} style={{ backgroundColor: C.card }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          {!!message && <Text style={[styles.meta, { marginBottom: 10, fontSize: 13 }]}>{message}</Text>}
          <TextInput
            label="Reason"
            value={reason}
            onChangeText={setReason}
            mode="outlined"
            autoFocus
            multiline
            style={{ backgroundColor: C.card }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel}>Back</Button>
          <Button
            onPress={() => onConfirm(reason.trim())}
            disabled={!ok}
            textColor={destructive ? C.red : C.accent}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderNo: { fontSize: 16, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  amount: { fontSize: 16, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  items: { fontSize: 13, color: C.ink, lineHeight: 18 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: C.muted },
});
