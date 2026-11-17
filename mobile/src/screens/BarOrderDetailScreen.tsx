import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  BAR_PAYMENT_METHOD_LABELS,
  barOrderAmount,
  previewOrderTotals,
  type BarOrder,
  type BarPaymentMethod,
} from '@jaypos/shared';

import { RootState } from '../redux/store';
import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { BarStatusBadge, ReasonDialog } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * One bar order (planning Phase 2). What you can do depends on who you are:
 *  - Attendant (own order): cancel while waiting; declare how the customer paid.
 *  - Bar Controller: accept, release (optionally fewer items, with a reason),
 *    hand back, reject; correct the payment method.
 *  - Manager/admin: everything a controller can, plus reverse a released order.
 * The server enforces every rule; this screen only shows the actions that apply.
 */

type Dialog = null | 'cancel' | 'reject' | 'reverse' | 'reduce';
const METHODS: BarPaymentMethod[] = ['cash', 'transfer', 'card', 'split'];

export default function BarOrderDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params?.id;
  const online = useIsOnline();
  const me = useSelector((s: RootState) => s.auth.user);
  const { can } = useBusinessMode();
  const isAdmin = me?.role === 'admin' || !!me?.is_super_admin;
  const isSupervisor = isAdmin || me?.role === 'manager';

  const [order, setOrder] = useState<BarOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [release, setRelease] = useState<Record<string, number>>({});
  const [payMethod, setPayMethod] = useState<BarPaymentMethod | null>(null);
  const [split, setSplit] = useState({ cash: '', transfer: '', card: '' });
  const [payRef, setPayRef] = useState('');

  const apply = (o: BarOrder) => {
    setOrder(o);
    setRelease((prev) =>
      Object.keys(prev).length
        ? prev
        : Object.fromEntries(o.items.map((it) => [it.id, it.quantity_fulfilled ?? it.quantity_requested]))
    );
  };

  const load = useCallback(async () => {
    try {
      apply(await barApi.get(id));
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load this order.'));
    }
  }, [id]);

  usePolling(load, 5000);

  const run = async (fn: () => Promise<BarOrder>, done?: string) => {
    setBusy(true);
    try {
      const o = await fn();
      setOrder(o);
      if (done) Alert.alert(done);
    } catch (e) {
      Alert.alert('Not done', barErrorMessage(e));
      load();
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const mine = !!order && order.initiated_by.id === me?.id;
  const open = order?.status === 'submitted' || order?.status === 'accepted';
  const canHandle = can('bar.order.fulfil') && (!mine || isAdmin);
  const claimedByOther =
    order?.status === 'accepted' && order.accepted_by?.id !== me?.id && !isSupervisor;

  const reduced = useMemo(
    () => !!order && order.items.some((it) => (release[it.id] ?? it.quantity_requested) < it.quantity_requested),
    [order, release]
  );
  const releaseTotal = useMemo(
    () =>
      order
        ? previewOrderTotals(
            order.items.map((it) => ({ unit_price: it.unit_price, tax_rate: it.tax_rate, quantity: release[it.id] ?? it.quantity_requested }))
          ).total_amount
        : 0,
    [order, release]
  );

  const doFulfil = (reason?: string) => {
    if (!order) return;
    const lines = order.items.map((it) => ({ item_id: it.id, quantity: release[it.id] ?? it.quantity_requested }));
    run(() => barApi.fulfil(order.id, reduced ? lines : undefined, reason), 'Released — sale recorded for the Attendant');
  };

  const declare = () => {
    if (!order || !payMethod) return;
    if (payMethod === 'split') {
      const s = { cash: Number(split.cash || 0), transfer: Number(split.transfer || 0), card: Number(split.card || 0) };
      run(() => barApi.declarePayment(order.id, 'split', { splits: s, reference: payRef.trim() || undefined }), 'Payment updated');
    } else {
      run(() => barApi.declarePayment(order.id, payMethod, { reference: payRef.trim() || undefined }), 'Payment updated');
    }
  };

  if (!order) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Bar" title="Order" onBack={() => navigation.goBack()} />
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={C.accent} style={{ marginTop: 32 }} />}
      </View>
    );
  }

  const amount = barOrderAmount(order);
  const splitSum = Number(split.cash || 0) + Number(split.transfer || 0) + Number(split.card || 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={`Bar order · ${order.order_number}`} title={naira(amount)} onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Actions are paused until you reconnect." />}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <BarStatusBadge status={order.status} />
            <Text style={styles.muted}>{new Date(order.submitted_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <Detail label="Attendant" value={order.initiated_by.name ?? '—'} />
          {!!order.table_label && <Detail label="Table" value={order.table_label} />}
          {order.accepted_by && <Detail label="Bar Controller" value={order.accepted_by.name ?? '—'} />}
          {order.customer_payment_method && (
            <Detail
              label="Customer paid by"
              value={
                BAR_PAYMENT_METHOD_LABELS[order.customer_payment_method] +
                (order.customer_payment_splits
                  ? ` (cash ${naira(order.customer_payment_splits.cash)}, transfer ${naira(order.customer_payment_splits.transfer)}, POS ${naira(order.customer_payment_splits.card)})`
                  : '')
              }
            />
          )}
          {!!order.transaction?.receipt_number && <Detail label="Receipt" value={order.transaction.receipt_number} />}
          {!!order.closed_reason && <Detail label="Note" value={order.closed_reason} />}
        </View>

        {/* Lines — editable (down only) when a controller is about to release */}
        <Text style={styles.section}>Items</Text>
        <View style={styles.card}>
          {order.items.map((it) => {
            const editing = open && canHandle && !claimedByOther;
            const n = release[it.id] ?? it.quantity_requested;
            return (
              <View key={it.id} style={styles.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{it.product_name ?? 'Item'}</Text>
                  <Text style={styles.muted}>
                    {naira(it.unit_price)} each · ordered {it.quantity_requested}
                    {it.quantity_fulfilled !== null && it.quantity_fulfilled !== it.quantity_requested
                      ? ` · released ${it.quantity_fulfilled}`
                      : ''}
                  </Text>
                </View>
                {editing ? (
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.step}
                      onPress={() => setRelease((m) => ({ ...m, [it.id]: Math.max(0, n - 1) }))}
                      accessibilityLabel={`Release one fewer ${it.product_name}`}
                    >
                      <MaterialCommunityIcons name="minus" size={16} color={C.ink} />
                    </TouchableOpacity>
                    <Text style={[styles.qty, n < it.quantity_requested && { color: C.red }]}>{n}</Text>
                    <TouchableOpacity
                      style={styles.step}
                      disabled={n >= it.quantity_requested}
                      onPress={() => setRelease((m) => ({ ...m, [it.id]: Math.min(it.quantity_requested, n + 1) }))}
                      accessibilityLabel={`Release one more ${it.product_name}`}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color={n >= it.quantity_requested ? C.muted : C.ink} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.qty}>{it.quantity_fulfilled ?? it.quantity_requested}</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* ── Actions ── */}
        {open && canHandle && !claimedByOther && (
          <View style={{ gap: 8, marginTop: 14 }}>
            <Button
              mode="contained"
              buttonColor={C.green}
              onPress={() => (reduced ? setDialog('reduce') : doFulfil())}
              loading={busy}
              disabled={busy || !online || releaseTotal <= 0}
              contentStyle={{ paddingVertical: 6 }}
            >
              {reduced ? `Release fewer items · ${naira(releaseTotal)}` : `Release drinks · ${naira(releaseTotal)}`}
            </Button>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {order.status === 'submitted' ? (
                <Button mode="outlined" style={{ flex: 1 }} disabled={busy || !online} onPress={() => run(() => barApi.accept(order.id))}>
                  I'm preparing it
                </Button>
              ) : (
                <Button mode="outlined" style={{ flex: 1 }} disabled={busy || !online} onPress={() => run(() => barApi.release(order.id))}>
                  Hand back to queue
                </Button>
              )}
              <Button mode="outlined" style={{ flex: 1 }} textColor={C.red} disabled={busy || !online} onPress={() => setDialog('reject')}>
                Reject
              </Button>
            </View>
          </View>
        )}

        {claimedByOther && (
          <Text style={[styles.muted, { marginTop: 12 }]}>
            {order.accepted_by?.name ?? 'Another Bar Controller'} is preparing this order.
          </Text>
        )}

        {mine && order.status === 'submitted' && (
          <Button mode="outlined" textColor={C.red} style={{ marginTop: 14 }} disabled={busy || !online} onPress={() => setDialog('cancel')}>
            Cancel order
          </Button>
        )}
        {mine && order.status === 'accepted' && !canHandle && (
          <Text style={[styles.muted, { marginTop: 12 }]}>
            The Bar Controller is preparing this order. To change it, ask them to reject it and send a new one.
          </Text>
        )}

        {/* Payment declaration: own order or controller, once released */}
        {order.status === 'fulfilled' && (mine || can('bar.order.queue.view')) && can('bar.order.declare_payment') && (
          <>
            <Text style={styles.section}>How did the customer pay?</Text>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {METHODS.map((m) => {
                  const active = (payMethod ?? order.customer_payment_method) === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setPayMethod(m)}
                      style={[styles.chip, active && styles.chipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{BAR_PAYMENT_METHOD_LABELS[m]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {payMethod === 'split' && (
                <View style={{ gap: 8, marginTop: 10 }}>
                  {(['cash', 'transfer', 'card'] as const).map((k) => (
                    <TextInput
                      key={k}
                      label={BAR_PAYMENT_METHOD_LABELS[k]}
                      value={split[k]}
                      onChangeText={(v) => setSplit((s) => ({ ...s, [k]: v.replace(/[^0-9.]/g, '') }))}
                      keyboardType="decimal-pad"
                      mode="outlined"
                      dense
                      style={{ backgroundColor: C.card }}
                    />
                  ))}
                  <Text style={[styles.muted, Math.abs(splitSum - amount) > 0.009 && { color: C.red }]}>
                    {naira(splitSum)} of {naira(amount)}
                  </Text>
                </View>
              )}
              {payMethod && payMethod !== 'cash' && (
                <TextInput
                  label="Reference (transfer narration / POS slip)"
                  value={payRef}
                  onChangeText={setPayRef}
                  mode="outlined"
                  dense
                  style={{ backgroundColor: C.card, marginTop: 10 }}
                />
              )}
              {(payMethod && payMethod !== order.customer_payment_method) || payMethod === 'split' ? (
                <Button
                  mode="contained"
                  buttonColor={C.accent}
                  style={{ marginTop: 10 }}
                  onPress={declare}
                  loading={busy}
                  disabled={busy || !online || (payMethod === 'split' && Math.abs(splitSum - amount) > 0.009)}
                >
                  Save payment
                </Button>
              ) : null}
            </View>
          </>
        )}

        {order.status === 'fulfilled' && isSupervisor && can('bar.reversal.approve') && (
          <Button mode="outlined" textColor={C.red} style={{ marginTop: 16 }} disabled={busy || !online} onPress={() => setDialog('reverse')}>
            Reverse this sale
          </Button>
        )}
      </ScrollView>

      <ReasonDialog
        visible={dialog === 'cancel'}
        title="Cancel this order?"
        message="Use this when the customer changes their mind before the drinks are released."
        confirmLabel="Cancel order"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={(r) => run(() => barApi.cancel(order.id, r))}
      />
      <ReasonDialog
        visible={dialog === 'reject'}
        title="Reject this order?"
        message="The Attendant will see your reason."
        confirmLabel="Reject"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={(r) => run(() => barApi.reject(order.id, r))}
      />
      <ReasonDialog
        visible={dialog === 'reduce'}
        title="Release fewer items?"
        message="Say why — for example, out of stock. The sale is recorded for what you release."
        confirmLabel="Release"
        onCancel={() => setDialog(null)}
        onConfirm={(r) => doFulfil(r)}
      />
      <ReasonDialog
        visible={dialog === 'reverse'}
        title="Reverse this sale?"
        message="Only when the drinks came back unopened. Stock is restored and the sale is voided."
        confirmLabel="Reverse"
        destructive
        onCancel={() => setDialog(null)}
        onConfirm={(r) => run(() => barApi.reverse(order.id, r), 'Sale reversed')}
      />
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  muted: { fontSize: 12, color: C.muted },
  error: { color: C.red, margin: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 5 },
  detailValue: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: C.ink, textAlign: 'right' },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  lineName: { fontSize: 15, fontWeight: '700', color: C.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  qty: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: C.ink },
  chipTextActive: { color: C.accentFg },
});
