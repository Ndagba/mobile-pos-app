import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, RefreshControl,
  KeyboardAvoidingView, Platform, Switch, Share,
} from 'react-native';
import { ActivityIndicator, Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { RootState } from '../redux/store';
import { getReceiptBranding } from '../utils/receiptBranding';
import PurchaseOrderService, { poApiError } from '../services/PurchaseOrderService';
import { C, naira } from '../theme';
import { generateId } from '../utils/generateId';
import {
  PurchaseOrderDetail, ReceiveDraftLine, ReceiveLineInput, buildReceiveLines, isIsoDate, purchaseOrderShareText,
} from '../utils/purchaseOrders';
import {
  OfflineBanner, POStatusBadge, PurchasingHeader, PurchasingLocked,
  fmtDate, fmtQty, useCanPurchase, useIsOnline,
} from '../components/purchasing/PurchasingBits';

const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * Purchase-order detail (mobile counterpart of desktop `/purchasing/[id]`).
 * Drives the lifecycle: draft → submit (ordered) / delete; ordered or partially
 * received → receive goods (the atomic stock-in); cancel while nothing has been
 * received. Lines show ordered / received / outstanding; receipts list below.
 */
export default function PurchaseOrderDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params?.id;
  const canPurchase = useCanPurchase();
  const online = useIsOnline();
  const storeSettings = useSelector((s: RootState) => s.settings.settings);

  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); setLoadError('Purchase order not found.'); return; }
    try {
      setPo(await PurchaseOrderService.get(id));
      setLoadError(null);
    } catch (e) {
      setLoadError(poApiError(e, "Couldn't load this purchase order — check you're online."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    if (canPurchase) load();
  }, [canPurchase, load, online]));

  // Newest receipt first, regardless of the order the API returns them in.
  const receipts = useMemo(() => {
    const t = (r: { created_at?: string; received_date: string }) =>
      new Date(r.created_at ?? r.received_date).getTime() || 0;
    return [...(po?.receipts ?? [])].sort((a, b) => t(b) - t(a));
  }, [po?.receipts]);

  const productById = useMemo(() => {
    const m = new Map<string, { name: string; unit?: string | null }>();
    for (const it of po?.items ?? []) {
      if (it.product?.name) m.set(it.product_id, { name: it.product.name, unit: it.product.unit });
    }
    return m;
  }, [po?.items]);

  if (!canPurchase) return <PurchasingLocked onBack={() => navigation.goBack()} />;

  const run = async (fn: () => Promise<void>, fallback: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      if (after) after(); else await load();
    } catch (e) {
      Alert.alert('Error', poApiError(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const submitOrder = () =>
    Alert.alert('Submit order', 'Mark this purchase order as ordered? Its lines can no longer be changed.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Submit', onPress: () => run(() => PurchaseOrderService.setStatus(id, 'ordered'), 'Could not submit the order.') },
    ]);

  const cancelOrder = () =>
    Alert.alert('Cancel purchase order', "Cancel this purchase order? It can't be received afterwards. This cannot be undone.", [
      { text: 'Keep order', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => run(() => PurchaseOrderService.setStatus(id, 'cancelled'), 'Could not cancel the order.') },
    ]);

  const deleteOrder = () =>
    Alert.alert('Delete purchase order', 'Delete this draft purchase order? This cannot be undone.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => PurchaseOrderService.remove(id), 'Could not delete the order.', () => navigation.goBack()) },
    ]);

  if (loading && !po) {
    return (
      <View style={styles.screen}>
        <PurchasingHeader eyebrow="Purchasing" title="Purchase order" onBack={() => navigation.goBack()} />
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      </View>
    );
  }
  if (!po) {
    return (
      <View style={styles.screen}>
        <PurchasingHeader eyebrow="Purchasing" title="Purchase order" onBack={() => navigation.goBack()} />
        {!online && <OfflineBanner />}
        <View style={styles.center}>
          <Text style={styles.muted}>{loadError ?? "Couldn't load this purchase order."}</Text>
          <Button onPress={() => { setLoading(true); load(); }} style={{ marginTop: 8 }}>Try again</Button>
        </View>
      </View>
    );
  }

  const canReceive = po.status === 'ordered' || po.status === 'partially_received';
  const canSubmit = po.status === 'draft';
  const canDelete = po.status === 'draft';
  // Cancellation is only allowed before any goods are received (backend-enforced).
  const canCancel = (po.status === 'draft' || po.status === 'ordered') && po.receipts.length === 0;
  const hasActions = canReceive || canSubmit || canDelete || canCancel;

  // Mobile stand-in for the desktop "Print purchase order": share it as text.
  const sharePo = async () => {
    try {
      const { headerLines } = await getReceiptBranding(storeSettings);
      await Share.share({ message: purchaseOrderShareText(po, headerLines), title: `Purchase order ${po.po_number}` });
    } catch {}
  };

  return (
    <View style={styles.screen}>
      <PurchasingHeader
        eyebrow={po.supplier?.name ?? 'Purchasing'}
        title={po.po_number}
        onBack={() => navigation.goBack()}
        right={<POStatusBadge status={po.status} />}
      />
      {!online && <OfflineBanner />}

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
      >
        <Text style={styles.muted}>
          {[po.supplier?.phone, `Ordered ${fmtDate(po.order_date)}`, `Expected ${fmtDate(po.expected_date)}`]
            .filter(Boolean).join(' · ')}
        </Text>

        {/* Server-computed totals */}
        <View style={styles.totals}>
          {([['Subtotal', po.subtotal], ['Tax', po.tax_amount], ['Total', po.total_amount]] as const).map(([k, v]) => (
            <View key={k} style={styles.totalCard}>
              <Text style={styles.totalLabel}>{k}</Text>
              <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>{naira(v)}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button mode="outlined" icon="share-variant-outline" onPress={sharePo}>Share order</Button>
        </View>
        {hasActions && (
          <View style={[styles.actions, { marginTop: 8 }]}>
            {canSubmit && (
              <Button mode="contained" buttonColor={C.accent} icon="send" onPress={submitOrder}
                loading={busy} disabled={busy || !online}>Submit order</Button>
            )}
            {canReceive && (
              <Button mode="contained" buttonColor={C.accent} icon="package-down" onPress={() => setReceiveOpen(true)}
                disabled={busy || !online}>Receive goods</Button>
            )}
            {(canCancel || canDelete) && (
              <View style={styles.actionRow}>
                {canCancel && (
                  <Button mode="outlined" onPress={cancelOrder} disabled={busy || !online} style={{ flex: 1 }}>
                    Cancel order
                  </Button>
                )}
                {canDelete && (
                  <Button mode="text" textColor={C.red} onPress={deleteOrder} disabled={busy || !online} style={{ flex: 1 }}>
                    Delete draft
                  </Button>
                )}
              </View>
            )}
          </View>
        )}

        {/* Lines */}
        <Text style={styles.section}>Lines</Text>
        {po.items.map(it => (
          <View key={it.id} style={styles.card}>
            <View style={styles.lineHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lineName} numberOfLines={2}>{it.product?.name ?? 'Product'}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {[it.product?.sku, `@ ${naira(it.unit_cost)}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={styles.lineTotal}>{naira(it.line_total)}</Text>
            </View>
            <View style={styles.qtyRow}>
              <Qty label="Ordered" value={fmtQty(it.quantity_ordered)} />
              <Qty label="Received" value={fmtQty(it.quantity_received)}
                tone={it.quantity_received > it.quantity_ordered ? '#B45309' : undefined} />
              <Qty label="Outstanding" value={fmtQty(it.quantity_outstanding)}
                tone={it.quantity_outstanding > 0 ? '#B45309' : C.muted} />
            </View>
            {it.quantity_received > it.quantity_ordered && (
              <Text style={styles.overNote}>
                Over-received by {fmtQty(it.quantity_received - it.quantity_ordered)}
              </Text>
            )}
          </View>
        ))}
        {!!po.notes && <Text style={[styles.muted, { marginTop: 4 }]}>Notes: {po.notes}</Text>}

        {/* Receipt history */}
        <Text style={styles.section}>Receipts ({receipts.length})</Text>
        {receipts.length === 0 ? (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 22 }]}>
            <Text style={styles.muted}>No goods received yet.</Text>
          </View>
        ) : receipts.map(r => (
          <View key={r.id} style={[styles.card, { padding: 0 }]}>
            <View style={styles.receiptHead}>
              <Text style={styles.receiptTitle}>Received {fmtDate(r.received_date)}</Text>
              {!!r.reference && <Text style={styles.muted}>Ref {r.reference}</Text>}
            </View>
            {r.items.map(line => {
              const p = productById.get(line.product_id);
              const extra = [
                line.batch_number ? `Batch ${line.batch_number}` : null,
                line.expiry_date ? `Exp ${fmtDate(line.expiry_date)}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <View key={line.id} style={styles.receiptLine}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.receiptName} numberOfLines={1}>{p?.name ?? 'Product'}</Text>
                    {!!extra && <Text style={styles.muted} numberOfLines={1}>{extra}</Text>}
                  </View>
                  <Text style={styles.receiptQty}>+{fmtQty(line.quantity_received)}{p?.unit ? ` ${p.unit}` : ''}</Text>
                  <Text style={[styles.muted, { width: 78, textAlign: 'right' }]}>{naira(line.unit_cost)}</Text>
                </View>
              );
            })}
            {!!r.notes && <Text style={[styles.muted, { padding: 12 }]}>{r.notes}</Text>}
          </View>
        ))}
      </ScrollView>

      {receiveOpen && (
        <ReceiveGoodsSheet
          po={po}
          onClose={() => setReceiveOpen(false)}
          onReceived={() => { setReceiveOpen(false); load(); }}
        />
      )}
    </View>
  );
}

function Qty({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.qtyLabel}>{label}</Text>
      <Text style={[styles.qtyValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

/**
 * Receive goods against a PO — the core stock-in transaction. Each line is
 * prefilled with its outstanding quantity; clear or zero a line to leave it for
 * later (partial receipt). Over-receipt is allowed and flagged. Optional batch +
 * expiry feed batch tracking; an opt-in switch raises an unpaid AP invoice.
 *
 * The sheet is mounted fresh per open, so `receiptHash` is minted once and reused
 * across retries — a double tap or lost response returns the first receipt
 * server-side instead of incrementing stock twice.
 */
function ReceiveGoodsSheet({
  po, onClose, onReceived,
}: { po: PurchaseOrderDetail; onClose: () => void; onReceived: () => void }) {
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const [receiptHash] = useState(() => generateId());
  const [drafts, setDrafts] = useState<Record<string, ReceiveDraftLine>>(() => {
    const initial: Record<string, ReceiveDraftLine> = {};
    for (const it of po.items) {
      initial[it.id] = { qty: it.quantity_outstanding > 0 ? fmtQty(it.quantity_outstanding) : '', batch: '', expiry: '' };
    }
    return initial;
  });
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [createInvoice, setCreateInvoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setLine = (lineId: string, patch: Partial<ReceiveDraftLine>) =>
    setDrafts(prev => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));

  // Preview: Σ receiving-now × unit cost (what an opt-in AP invoice would carry).
  const receiptTotal = useMemo(() => po.items.reduce((sum, it) => {
    const qty = Number(drafts[it.id]?.qty);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty * it.unit_cost : 0);
  }, 0), [po.items, drafts]);

  const send = async (items: ReceiveLineInput[]) => {
    setSaving(true);
    try {
      await PurchaseOrderService.receive(po.id, {
        received_date: receivedDate.trim() || null,
        reference: reference.trim() || null,
        receipt_hash: receiptHash,
        create_invoice: createInvoice,
        notes: notes.trim() || null,
        items,
      });
      onReceived();
    } catch (e) {
      setError(poApiError(e, 'Could not record the receipt.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    setError(null);
    const date = receivedDate.trim();
    if (date && !isIsoDate(date)) return setError('Received date must look like 2026-11-12.');
    const built = buildReceiveLines(po.items, drafts);
    if (built.ok === false) return setError(built.error);

    Alert.alert(
      'Receive goods',
      `Add ${built.items.length} line${built.items.length === 1 ? '' : 's'} (${naira(built.total)}) to stock? This can't be undone.` +
        (built.overReceipt ? '\n\nSome lines are MORE than the outstanding quantity (over-receipt).' : '') +
        (createInvoice ? `\n\nAn unpaid supplier invoice of ${naira(built.total)} will also be created.` : ''),
      [
        { text: 'Review', style: 'cancel' },
        { text: 'Receive', onPress: () => send(built.items) },
      ]
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={saving ? undefined : onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sheetEyebrow}>Receive goods</Text>
            <Text style={styles.sheetTitle} numberOfLines={1}>{po.po_number}</Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button" accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={24} color={C.ink} />
          </TouchableOpacity>
        </View>
        {!online && <OfflineBanner />}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.twoCol}>
              <TextInput label="Received date" value={receivedDate} onChangeText={setReceivedDate} mode="outlined" dense
                placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={[styles.input, { flex: 1 }]} editable={!saving} />
              <TextInput label="Waybill ref" value={reference} onChangeText={setReference} mode="outlined" dense
                placeholder="Optional" style={[styles.input, { flex: 1 }]} editable={!saving} />
            </View>

            <Text style={styles.section}>Receiving now</Text>
            {po.items.map(it => {
              const d = drafts[it.id] ?? { qty: '', batch: '', expiry: '' };
              const qtyNum = Number(d.qty);
              const over = d.qty.trim() !== '' && Number.isFinite(qtyNum) && qtyNum > it.quantity_outstanding;
              return (
                <View key={it.id} style={styles.card}>
                  <Text style={styles.lineName} numberOfLines={2}>{it.product?.name ?? 'Product'}</Text>
                  <Text style={styles.muted}>
                    Ordered {fmtQty(it.quantity_ordered)} · Received {fmtQty(it.quantity_received)} · Outstanding{' '}
                    {fmtQty(it.quantity_outstanding)} · @ {naira(it.unit_cost)}
                  </Text>
                  <TextInput label="Quantity received" value={d.qty} onChangeText={v => setLine(it.id, { qty: v })}
                    mode="outlined" dense keyboardType="decimal-pad" style={[styles.input, { marginTop: 10 }]} editable={!saving} />
                  {over && (
                    <View style={styles.overFlag}>
                      <MaterialCommunityIcons name="alert-outline" size={14} color="#B45309" />
                      <Text style={styles.overFlagText}>
                        Over-receipt: {fmtQty(qtyNum - it.quantity_outstanding)} more than outstanding. Stock rises by the full amount.
                      </Text>
                    </View>
                  )}
                  <View style={styles.twoCol}>
                    <TextInput label="Batch #" value={d.batch} onChangeText={v => setLine(it.id, { batch: v })}
                      mode="outlined" dense style={[styles.input, { flex: 1 }]} editable={!saving} />
                    <TextInput label="Expiry" value={d.expiry} onChangeText={v => setLine(it.id, { expiry: v })}
                      mode="outlined" dense placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation"
                      style={[styles.input, { flex: 1 }]} editable={!saving} />
                  </View>
                </View>
              );
            })}

            <TextInput label="Notes (optional)" value={notes} onChangeText={setNotes} mode="outlined" dense
              style={[styles.input, { marginTop: 4 }]} editable={!saving} />

            <View style={styles.invoiceBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.invoiceTitle}>Create a payable (AP invoice)</Text>
                <Text style={styles.muted}>
                  Adds an unpaid supplier invoice of {naira(receiptTotal)} to the supplier's ledger. Leave off if you
                  record invoices from the supplier's bill separately.
                </Text>
              </View>
              <Switch value={createInvoice} onValueChange={setCreateInvoice} disabled={saving}
                trackColor={{ true: C.accent }} />
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.footerRow}>
              <Text style={styles.muted}>Receiving total</Text>
              <Text style={styles.footerTotal}>{naira(receiptTotal)}</Text>
            </View>
            {error && <Text style={styles.error}>{error}</Text>}
            <Button mode="contained" buttonColor={C.accent} onPress={handleSubmit} loading={saving}
              disabled={saving || !online} style={{ marginTop: 8 }}>
              Receive goods
            </Button>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  muted: { fontSize: 12, color: C.muted },
  error: { fontSize: 13, color: C.red, marginTop: 8 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: C.card },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 10 },

  totals: { flexDirection: 'row', gap: 8, marginTop: 12 },
  totalCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  totalLabel: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 2 },

  actions: { gap: 8, marginTop: 14 },
  actionRow: { flexDirection: 'row', gap: 8 },

  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  lineHead: { flexDirection: 'row', gap: 10 },
  lineName: { fontSize: 14, fontWeight: '700', color: C.ink },
  lineTotal: { fontSize: 14, fontWeight: '800', color: C.ink },
  qtyRow: { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  qtyLabel: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  qtyValue: { fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 2 },
  overNote: { fontSize: 11, fontWeight: '600', color: '#B45309', marginTop: 8 },

  receiptHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  receiptTitle: { fontSize: 13, fontWeight: '700', color: C.ink },
  receiptLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  receiptName: { fontSize: 13, fontWeight: '600', color: C.ink },
  receiptQty: { fontSize: 13, fontWeight: '700', color: '#047857' },

  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sheetEyebrow: { fontSize: 12, fontWeight: '500', color: C.muted },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  overFlag: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: C.amberBg },
  overFlagText: { flex: 1, fontSize: 11, color: '#92400E' },
  invoiceBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 12,
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  invoiceTitle: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 2 },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  footerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  footerTotal: { fontSize: 20, fontWeight: '800', color: C.ink },
});
