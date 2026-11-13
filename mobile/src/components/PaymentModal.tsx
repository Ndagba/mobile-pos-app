import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PaymentMethod, SplitPaymentAllocations } from '@jaypos/shared';
import { C, R, S, naira } from '../theme';

/**
 * Payment modal — mobile mirror of desktop `components/pos/PaymentModal.tsx`.
 *
 * Pure UI: it collects the payment method and (for split) the cash/card/transfer
 * allocations, then hands them back via `onConfirm`. CheckoutScreen owns the
 * actual sale (branch resolution, shared `buildTransactionInput`/`createTransaction`,
 * notifications, receipt), so this component never touches the network.
 *
 *  - Cash: amount tendered + quick-amount buttons + live change (tender is display
 *    only; the backend stores no tendered amount).
 *  - Split: ≥2 methods summing to at least the total; any overpay is change.
 */

const TILES: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash',     label: 'Cash',     icon: 'cash'          },
  { value: 'card',     label: 'Card',     icon: 'credit-card'   },
  { value: 'transfer', label: 'Transfer', icon: 'bank-transfer' },
  { value: 'split',    label: 'Split',    icon: 'call-split'    },
];

/** Suggested cash tenders at or above the total (desktop parity). */
function quickAmounts(total: number): number[] {
  const rounded = Math.ceil(total);
  const ups = [500, 1000, 2000, 5000].map((step) => Math.ceil(total / step) * step);
  return Array.from(new Set([rounded, ...ups])).filter((v) => v >= total).slice(0, 4);
}

export default function PaymentModal({
  visible,
  onClose,
  total,
  processing,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  total: number;
  processing: boolean;
  onConfirm: (method: PaymentMethod, splits?: SplitPaymentAllocations) => void;
}) {
  const insets = useSafeAreaInsets();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitTransfer, setSplitTransfer] = useState('');

  const quick = useMemo(() => quickAmounts(total), [total]);

  const numTendered = Math.max(0, Number(tendered) || 0);
  const cashChange = method === 'cash' ? Math.max(0, +(numTendered - total).toFixed(2)) : 0;
  const cashValid = method !== 'cash' || numTendered === 0 || numTendered >= total;

  const numCash = Math.max(0, Number(splitCash) || 0);
  const numCard = Math.max(0, Number(splitCard) || 0);
  const numTransfer = Math.max(0, Number(splitTransfer) || 0);
  const splitSum = +(numCash + numCard + numTransfer).toFixed(2);
  const splitMethods = [numCash, numCard, numTransfer].filter((n) => n > 0).length;
  const splitRemaining = +(total - splitSum).toFixed(2);
  const splitChange = Math.max(0, +(splitSum - total).toFixed(2));
  const splitValid = method === 'split' ? splitMethods >= 2 && splitSum >= total - 0.01 : true;

  const canComplete = !processing && (method === 'split' ? splitValid : cashValid);

  const reset = () => {
    setMethod('cash'); setTendered('');
    setSplitCash(''); setSplitCard(''); setSplitTransfer('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleComplete = () => {
    if (!canComplete) return;
    const splits: SplitPaymentAllocations | undefined =
      method === 'split' ? { cash: numCash, card: numCard, transfer: numTransfer } : undefined;
    onConfirm(method, splits);
    // CheckoutScreen closes & resets the cart on success; clear local state too.
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.overlay}>
        {/* Bottom padding clears the system nav bar / home indicator — same rule
            as the cart drawer that holds Hold + Charge in CheckoutScreen. */}
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Payment</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Amount due */}
            <View style={s.dueCard}>
              <Text style={s.dueLabel}>AMOUNT DUE</Text>
              <Text style={s.dueValue}>{naira(total)}</Text>
            </View>

            {/* Method tiles */}
            <View style={s.tileRow}>
              {TILES.map((t) => {
                const active = method === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setMethod(t.value)}
                    activeOpacity={0.8}
                    style={[s.tile, active && s.tileActive]}
                  >
                    <MaterialCommunityIcons name={t.icon as any} size={22} color={active ? C.accent : C.ink} />
                    <Text style={[s.tileLabel, active && { color: C.accent }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Cash */}
            {method === 'cash' && (
              <View style={{ gap: S.sm }}>
                <View style={s.inputWrap}>
                  <Text style={s.nairaPrefix}>₦</Text>
                  <TextInput
                    style={s.input}
                    value={tendered}
                    onChangeText={setTendered}
                    placeholder="Amount tendered"
                    placeholderTextColor={C.muted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={s.quickRow}>
                  {quick.map((amt) => (
                    <TouchableOpacity key={amt} style={s.quickBtn} onPress={() => setTendered(String(amt))}>
                      <Text style={s.quickText}>{naira(amt)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.changeRow}>
                  <Text style={s.changeLabel}>Change</Text>
                  <Text style={s.changeValue}>{naira(cashChange)}</Text>
                </View>
              </View>
            )}

            {/* Split */}
            {method === 'split' && (
              <View style={{ gap: S.sm }}>
                {[
                  { label: 'Cash',     value: splitCash,     set: setSplitCash     },
                  { label: 'Card',     value: splitCard,     set: setSplitCard     },
                  { label: 'Transfer', value: splitTransfer, set: setSplitTransfer },
                ].map((row) => (
                  <View key={row.label} style={s.splitRow}>
                    <Text style={s.splitLabel}>{row.label}</Text>
                    <View style={[s.inputWrap, { flex: 1 }]}>
                      <Text style={s.nairaPrefix}>₦</Text>
                      <TextInput
                        style={s.input}
                        value={row.value}
                        onChangeText={row.set}
                        placeholder="0"
                        placeholderTextColor={C.muted}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                ))}
                <View style={s.splitSummary}>
                  <View style={s.splitSummaryRow}>
                    <Text style={s.changeLabel}>Entered</Text>
                    <Text style={s.splitEntered}>{naira(splitSum)}</Text>
                  </View>
                  <View style={s.splitSummaryRow}>
                    <Text style={[s.changeLabel, { color: splitRemaining > 0.01 ? C.amber : C.green, fontWeight: '700' }]}>
                      {splitRemaining > 0.01 ? 'Remaining' : 'Change'}
                    </Text>
                    <Text style={{ color: splitRemaining > 0.01 ? C.amber : C.green, fontWeight: '700' }}>
                      {naira(splitRemaining > 0.01 ? splitRemaining : splitChange)}
                    </Text>
                  </View>
                </View>
                {splitMethods < 2 && (
                  <Text style={s.hint}>Enter amounts for at least two methods.</Text>
                )}
              </View>
            )}
          </ScrollView>

          {/* Complete */}
          <TouchableOpacity
            onPress={handleComplete}
            disabled={!canComplete}
            activeOpacity={0.85}
            style={[s.completeBtn, !canComplete && s.completeBtnDisabled]}
          >
            <MaterialCommunityIcons name="check" size={18} color={canComplete ? C.accentFg : C.muted} />
            <Text style={[s.completeLabel, !canComplete && { color: C.muted }]}>
              {processing ? 'Processing…' : `Complete · ${naira(total)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
    paddingHorizontal: S.xl, paddingTop: S.lg, maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.lg },
  title: { fontSize: 18, fontWeight: '800', color: C.ink },

  dueCard: { backgroundColor: C.card, borderRadius: R.md, paddingVertical: S.lg, alignItems: 'center', marginBottom: S.lg },
  dueLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: C.muted },
  dueValue: { fontSize: 30, fontWeight: '800', color: C.ink, marginTop: 4 },

  tileRow: { flexDirection: 'row', gap: S.sm, marginBottom: S.lg },
  tile: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: S.md,
    borderRadius: R.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  tileActive: { borderColor: C.accent, backgroundColor: C.violetBg },
  tileLabel: { fontSize: 12, fontWeight: '700', color: C.ink },

  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.sm, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md },
  nairaPrefix: { fontSize: 15, color: C.muted, marginRight: 4 },
  input: { flex: 1, height: 46, fontSize: 15, color: C.ink, fontWeight: '600' },

  quickRow: { flexDirection: 'row', gap: S.sm },
  quickBtn: { flex: 1, alignItems: 'center', paddingVertical: S.sm, borderRadius: R.xs, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  quickText: { fontSize: 12, fontWeight: '600', color: C.ink },

  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: S.md },
  changeLabel: { fontSize: 13, color: C.muted },
  changeValue: { fontSize: 15, fontWeight: '700', color: C.green },

  splitRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  splitLabel: { width: 64, fontSize: 13, fontWeight: '700', color: C.ink },
  splitSummary: { backgroundColor: C.card, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: S.md, gap: 6 },
  splitSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  splitEntered: { fontSize: 14, fontWeight: '600', color: C.ink },
  hint: { fontSize: 12, color: C.muted },

  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, borderRadius: R.sm, backgroundColor: C.accent, marginTop: S.lg,
  },
  completeBtnDisabled: { backgroundColor: C.border },
  completeLabel: { fontSize: 15, fontWeight: '700', color: C.accentFg },
});
