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
  reversal_requested: { fg: '#B45309', bg: C.amberBg },
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

// ─── Phase 3: money widgets ───────────────────────────────────

/** A labelled money figure. `tone` colours the value (e.g. red when someone owes). */
export function Kpi({
  label,
  value,
  hint,
  tone,
  wide,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'owes' | 'credit' | 'settled' | 'muted';
  wide?: boolean;
}) {
  const color = tone === 'owes' ? C.red : tone === 'credit' ? '#047857' : tone === 'muted' ? C.muted : C.ink;
  return (
    <View style={[styles.kpi, wide && { flexBasis: '100%' }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!hint && <Text style={styles.kpiHint}>{hint}</Text>}
    </View>
  );
}

/** Method → amount rows, with a total. Empty mix shows a quiet dash. */
export function MixRows({ mix, labels }: { mix: Record<string, number | undefined>; labels: Record<string, string> }) {
  const rows = Object.entries(mix).filter(([, v]) => v);
  if (!rows.length) return <Text style={styles.meta}>Nothing yet</Text>;
  const total = rows.reduce((a, [, v]) => a + (v ?? 0), 0);
  return (
    <View>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.mixRow}>
          <Text style={styles.mixLabel}>{labels[k] ?? k}</Text>
          <Text style={styles.mixValue}>{naira(v ?? 0)}</Text>
        </View>
      ))}
      <View style={[styles.mixRow, { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, paddingTop: 6 }]}>
        <Text style={[styles.mixLabel, { fontWeight: '800' }]}>Total</Text>
        <Text style={[styles.mixValue, { fontWeight: '800' }]}>{naira(total)}</Text>
      </View>
    </View>
  );
}

/** Previous / next business-day picker (never past today). */
export function DayPicker({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  const shift = (days: number) => {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    const next = d.toISOString().slice(0, 10);
    if (next <= today) onChange(next);
  };
  const label =
    date === today
      ? 'Today'
      : new Date(`${date}T12:00:00.000Z`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <View style={styles.dayPicker}>
      <TouchableOpacity onPress={() => shift(-1)} style={styles.dayBtn} accessibilityLabel="Previous day">
        <MaterialCommunityIcons name="chevron-left" size={20} color={C.ink} />
      </TouchableOpacity>
      <Text style={styles.dayLabel}>{label}</Text>
      <TouchableOpacity
        onPress={() => shift(1)}
        style={styles.dayBtn}
        disabled={date >= today}
        accessibilityLabel="Next day"
      >
        <MaterialCommunityIcons name="chevron-right" size={20} color={date >= today ? C.muted : C.ink} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 20, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  kpiHint: { fontSize: 11, color: C.muted, marginTop: 2 },
  mixRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  mixLabel: { fontSize: 13, color: C.ink },
  mixValue: { fontSize: 13, color: C.ink, fontVariant: ['tabular-nums'] },
  dayPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  dayBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  dayLabel: { fontSize: 15, fontWeight: '700', color: C.ink, minWidth: 120, textAlign: 'center' },
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
