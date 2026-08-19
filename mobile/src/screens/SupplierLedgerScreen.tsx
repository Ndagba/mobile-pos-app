import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert, ScrollView,
  TouchableOpacity, Platform, Share, Modal,
} from 'react-native';
import {
  Button, TextInput, Portal, Dialog, Divider, ActivityIndicator,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import { RootState } from '../redux/store';

interface Supplier {
  id: string; name: string; phone?: string; email?: string;
  category?: string; tag?: string; tone?: string;
}

interface PurchaseInvoice {
  id: string; invoice_number?: string; invoice_date: string; due_date?: string;
  amount: number; quantity?: number; unit_price?: number;
  status: 'unpaid' | 'partial' | 'paid'; notes?: string; created_at: string;
}

interface SupplierPayment {
  id: string; amount: number; date: string;
  notes?: string; invoice_id?: string; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  unpaid: '#EF4444', partial: '#F59E0B', paid: '#10B981',
};

function genInvoiceNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `INV-${ymd}-${String(Math.floor(1000+Math.random()*9000))}`;
}

function fmtDate(s: string) {
  try { return new Date(s).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function fmtAmt(n: number) {
  return '\u20a6' + n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function SupplierLedgerScreen() {
  const route      = useRoute();
  const navigation = useNavigation<any>();
  const insets     = useSafeAreaInsets();
  const user       = useSelector((state: RootState) => state.auth.user);

  const supplierId      = (route.params as any)?.supplier_id;
  const initialSupplier = (route.params as any)?.supplier as Supplier | undefined;
  const openInvoiceForm = (route.params as any)?.openInvoiceForm as boolean | undefined;

  const [supplier,  setSupplier]  = useState<Supplier | null>(initialSupplier ?? null);
  const [invoices,  setInvoices]  = useState<PurchaseInvoice[]>([]);
  const [payments,  setPayments]  = useState<SupplierPayment[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');

  // Invoice form
  const [showInvoiceForm,  setShowInvoiceForm]  = useState(false);
  const [invoiceRef,       setInvoiceRef]       = useState('');
  const [invoiceDate,      setInvoiceDate]      = useState(new Date().toISOString().split('T')[0]);
  const [invoiceDue,       setInvoiceDue]       = useState('');
  const [invoiceQty,       setInvoiceQty]       = useState('');
  const [invoiceUnitPrice, setInvoiceUnitPrice] = useState('');
  const [invoiceAmount,    setInvoiceAmount]    = useState('');
  const [invoiceNotes,     setInvoiceNotes]     = useState('');
  const [savingInvoice,    setSavingInvoice]    = useState(false);

  // Invoice detail sheet
  const [detailInvoice,     setDetailInvoice]     = useState<PurchaseInvoice | null>(null);
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);

  // Payment form
  const [showPaymentForm,   setShowPaymentForm]   = useState(false);
  const [paymentAmount,     setPaymentAmount]     = useState('');
  const [paymentDate,       setPaymentDate]       = useState(new Date().toISOString().split('T')[0]);
  const [paymentNotes,      setPaymentNotes]      = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [savingPayment,     setSavingPayment]     = useState(false);

  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);
  const isCashier = user?.role === 'cashier';

  const apiError = (e: any, fb = 'Operation failed') =>
    e?.response?.data?.message || e?.response?.data?.error || e?.message || fb;

  useFocusEffect(useCallback(() => { if (supplierId) loadData(); }, [supplierId]));

  useEffect(() => {
    if (openInvoiceForm && !loading) setShowInvoiceForm(true);
  }, [openInvoiceForm, loading]);

  // Auto-calc total from qty x unit price
  useEffect(() => {
    const q = parseFloat(invoiceQty), p = parseFloat(invoiceUnitPrice);
    if (q > 0 && p > 0) setInvoiceAmount((q * p).toFixed(2));
  }, [invoiceQty, invoiceUnitPrice]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sR, iR, pR]: [any, any, any] = await Promise.all([
        ApiClient.get(`/suppliers/${supplierId}`),
        ApiClient.get(`/suppliers/${supplierId}/invoices`),
        ApiClient.get(`/suppliers/${supplierId}/payments`),
      ]);
      setSupplier(sR?.data ?? sR);
      setInvoices(Array.isArray(iR) ? iR : iR?.data ?? []);
      setPayments(Array.isArray(pR) ? pR : pR?.data ?? []);
    } catch (e) {
      Alert.alert('Error', apiError(e, 'Failed to load supplier data'));
    } finally {
      setLoading(false);
    }
  };

  const totalInvoiced = invoices.reduce((s, i) => s + (parseFloat(i.amount as any) || 0), 0);
  const totalPaid     = payments.reduce((s, p) => s + (parseFloat(p.amount as any) || 0), 0);
  const outstanding   = Math.max(0, totalInvoiced - totalPaid);
  const toneColor     = (supplier as any)?.tone || '#7C3AED';

  const openInvoices = useMemo(() => invoices.filter(i => i.status !== 'paid'), [invoices]);

  const invoiceBalance = (invId: string): number => {
    const inv = invoices.find(i => i.id === invId);
    if (!inv) return 0;
    const paid = payments
      .filter(p => (p as any).invoice_id === invId)
      .reduce((s, p) => s + (parseFloat(p.amount as any) || 0), 0);
    return Math.max(0, (parseFloat(inv.amount as any) || 0) - paid);
  };

  const selectedInvoice = openInvoices.find(i => i.id === selectedInvoiceId) ?? null;

  const resetInvoiceForm = () => {
    setInvoiceRef(genInvoiceNumber());
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setInvoiceDue(''); setInvoiceQty(''); setInvoiceUnitPrice('');
    setInvoiceAmount(''); setInvoiceNotes('');
  };

  const handleSaveInvoice = async () => {
    const amt = parseFloat(invoiceAmount);
    if (!amt || amt <= 0) { Alert.alert('Validation', 'Please enter a valid amount'); return; }
    if (!invoiceDate)     { Alert.alert('Validation', 'Invoice date is required'); return; }
    setSavingInvoice(true);
    try {
      await ApiClient.post(`/suppliers/${supplierId}/invoices`, {
        invoice_number: invoiceRef.trim() || null,
        invoice_date:   invoiceDate,
        due_date:       invoiceDue || null,
        quantity:       invoiceQty ? parseFloat(invoiceQty) : null,
        unit_price:     invoiceUnitPrice ? parseFloat(invoiceUnitPrice) : null,
        amount:         amt,
        notes:          invoiceNotes.trim() || null,
      });
      setShowInvoiceForm(false);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Failed to record invoice'));
    } finally {
      setSavingInvoice(false);
    }
  };

  const shareInvoice = async (inv: PurchaseInvoice) => {
    const qty    = inv.quantity   ? `\nQty:         ${inv.quantity}` : '';
    const uPrice = inv.unit_price ? `\nUnit Price:  ${fmtAmt(parseFloat(inv.unit_price as any))}` : '';
    const text = [
      '===== PURCHASE INVOICE =====',
      `Supplier:    ${supplier?.name ?? ''}`,
      `Invoice #:   ${inv.invoice_number ?? 'N/A'}`,
      `Date:        ${fmtDate(inv.invoice_date)}`,
      inv.due_date ? `Due:         ${fmtDate(inv.due_date)}` : '',
      qty, uPrice,
      `Amount:      ${fmtAmt(parseFloat(inv.amount as any))}`,
      `Status:      ${inv.status.toUpperCase()}`,
      inv.notes ? `\nNotes: ${inv.notes}` : '',
      '============================',
    ].filter(Boolean).join('\n');
    await Share.share({ message: text, title: `Invoice ${inv.invoice_number ?? ''}` });
  };

  const sharePayment = async (pay: SupplierPayment) => {
    try {
      const bizName = await AsyncStorage.getItem('@pos_business_name') || '';
      const footerMsg = await AsyncStorage.getItem('@pos_receipt_footer') || '';
      const text = [
        bizName ? bizName : '',
        '===== PAYMENT RECEIPT =====',
        `Supplier:    ${supplier?.name ?? ''}`,
        `Date:        ${fmtDate(pay.date)}`,
        `Amount Paid: ${fmtAmt(parseFloat(pay.amount as any))}`,
        `Balance:     ${fmtAmt(outstanding)}`,
        pay.notes ? `Notes:       ${pay.notes}` : '',
        '===========================',
        footerMsg ? footerMsg : '',
      ].filter(Boolean).join('\n');
      await Share.share({ message: text, title: 'Payment Receipt' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteInvoice = (id: string) =>
    Alert.alert('Delete Invoice', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await ApiClient.delete(`/suppliers/${supplierId}/invoices/${id}`); await loadData(); }
        catch (e: any) { Alert.alert('Error', apiError(e)); }
      }},
    ]);

  const handleSavePayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { Alert.alert('Validation', 'Please enter a valid amount'); return; }
    if (!selectedInvoiceId)     { Alert.alert('Validation', 'Please select an invoice'); return; }
    const bal = invoiceBalance(selectedInvoiceId);
    if (amount > bal + 0.001)   { Alert.alert('Validation', `Amount (${fmtAmt(amount)}) exceeds invoice balance (${fmtAmt(bal)})`); return; }
    setSavingPayment(true);
    try {
      await ApiClient.post(`/suppliers/${supplierId}/payments`, {
        amount, date: paymentDate,
        notes: paymentNotes.trim() || null,
        invoice_id: selectedInvoiceId,
      });
      setShowPaymentForm(false);
      setPaymentAmount(''); setPaymentDate(new Date().toISOString().split('T')[0]);
      setPaymentNotes(''); setSelectedInvoiceId(null);
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Failed to record payment'));
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = (id: string) =>
    Alert.alert('Delete Payment', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await ApiClient.delete(`/suppliers/${supplierId}/payments/${id}`); await loadData(); }
        catch (e: any) { Alert.alert('Error', apiError(e)); }
      }},
    ]);

  const handleUpdateInvoiceStatus = async (invoiceId: string, newStatus: 'unpaid' | 'partial' | 'paid') => {
    setUpdatingInvoiceId(invoiceId);
    try {
      await ApiClient.patch(`/suppliers/${supplierId}/invoices/${invoiceId}`, { status: newStatus });
      await loadData();
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Failed to update status'));
    } finally {
      setUpdatingInvoiceId(null);
    }
  };

  const showStatusPicker = (item: PurchaseInvoice) => {
    const ALL: Array<'unpaid' | 'partial' | 'paid'> = ['unpaid', 'partial', 'paid'];
    const labels: Record<string, string> = { unpaid: 'Mark Unpaid', partial: 'Mark Partial', paid: 'Mark Paid' };
    Alert.alert('Update Status', `Current: ${item.status.toUpperCase()}`, [
      ...ALL.filter(s => s !== item.status).map(s => ({ text: labels[s], onPress: () => handleUpdateInvoiceStatus(item.id, s) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const renderInvoice = ({ item }: { item: PurchaseInvoice }) => {
    const sc     = STATUS_COLOR[item.status] ?? C.muted;
    const amount = parseFloat(item.amount as any) || 0;
    const isUpd  = updatingInvoiceId === item.id;
    return (
      <TouchableOpacity
        style={st.ledgerRow}
        onPress={() => { setDetailInvoice(item); setShowInvoiceDetail(true); }}
        activeOpacity={0.75}
      >
        <View style={st.ledgerIconWrap}>
          <MaterialCommunityIcons name="receipt" size={16} color={toneColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={st.ledgerTitle} numberOfLines={1}>
              {item.invoice_number ? `#${item.invoice_number}` : 'Invoice'}
            </Text>
            <TouchableOpacity
              onPress={() => !isCashier && !isUpd && showStatusPicker(item)}
              disabled={isCashier || isUpd}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={isCashier ? 1 : 0.7}
            >
              <View style={[st.statusBadge, { backgroundColor: sc + '20', flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                {isUpd
                  ? <ActivityIndicator size={9} color={sc} />
                  : <Text style={[st.statusText, { color: sc }]}>{item.status.toUpperCase()}</Text>
                }
                {!isCashier && !isUpd && <MaterialCommunityIcons name="chevron-down" size={10} color={sc} />}
              </View>
            </TouchableOpacity>
          </View>
          <Text style={st.ledgerDate}>
            {fmtDate(item.invoice_date)}{item.due_date ? ` \u00b7 Due ${fmtDate(item.due_date)}` : ''}
          </Text>
          {item.quantity ? (
            <Text style={st.ledgerNotes}>
              Qty: {item.quantity}{item.unit_price ? ` \u00d7 ${fmtAmt(parseFloat(item.unit_price as any))}` : ''}
            </Text>
          ) : null}
          {item.notes ? <Text style={st.ledgerNotes} numberOfLines={1}>{item.notes}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={st.ledgerAmount}>{fmtAmt(amount)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => shareInvoice(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="share-outline" size={14} color={C.muted} />
            </TouchableOpacity>
            {!isCashier && (
              <TouchableOpacity onPress={() => handleDeleteInvoice(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={14} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPayment = ({ item }: { item: SupplierPayment }) => {
    const amount = parseFloat(item.amount as any) || 0;
    return (
      <View style={st.ledgerRow}>
        <View style={[st.ledgerIconWrap, { backgroundColor: '#10B98120' }]}>
          <MaterialCommunityIcons name="cash-check" size={16} color="#10B981" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.ledgerTitle}>Payment</Text>
          <Text style={st.ledgerDate}>{fmtDate(item.date)}</Text>
          {item.notes ? <Text style={st.ledgerNotes} numberOfLines={1}>{item.notes}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[st.ledgerAmount, { color: '#10B981' }]}>{`\u2212${fmtAmt(amount)}`}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => sharePayment(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="share-outline" size={14} color={C.muted} />
            </TouchableOpacity>
            {!isCashier && (
              <TouchableOpacity onPress={() => handleDeletePayment(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={14} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) return (
    <View style={[st.screen, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      {/* Back header */}
      <View style={st.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.ink} />
        </TouchableOpacity>
        <Text style={st.topBarTitle} numberOfLines={1}>{supplier?.name ?? 'Supplier'}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Hero */}
      <LinearGradient colors={['#7C3AED', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.heroBar}>
        <View style={st.heroStat}><Text style={st.heroStatLabel}>INVOICED</Text><Text style={st.heroStatValue}>{fmtAmt(totalInvoiced)}</Text></View>
        <View style={st.heroDivider} />
        <View style={st.heroStat}><Text style={st.heroStatLabel}>PAID</Text><Text style={st.heroStatValue}>{fmtAmt(totalPaid)}</Text></View>
        <View style={st.heroDivider} />
        <View style={st.heroStat}>
          <Text style={st.heroStatLabel}>OWING</Text>
          <Text style={[st.heroStatValue, outstanding > 0 && { color: '#FCA5A5' }]}>{fmtAmt(outstanding)}</Text>
        </View>
      </LinearGradient>

      {/* Sub-header */}
      {(supplier?.category || supplier?.phone || supplier?.email) && (
        <View style={st.subHeader}>
          {supplier.category && <View style={st.subTag}><MaterialCommunityIcons name="tag-outline" size={12} color={C.muted} /><Text style={st.subTagText}>{supplier.category}</Text></View>}
          {supplier.phone    && <View style={st.subTag}><MaterialCommunityIcons name="phone-outline" size={12} color={C.muted} /><Text style={st.subTagText}>{supplier.phone}</Text></View>}
        </View>
      )}

      {/* Tabs */}
      <View style={st.tabs}>
        {(['invoices', 'payments'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[st.tab, activeTab === tab && st.tabActive]} onPress={() => setActiveTab(tab)} activeOpacity={0.7}>
            <MaterialCommunityIcons name={tab === 'invoices' ? 'receipt' : 'cash-check'} size={14} color={activeTab === tab ? '#7C3AED' : C.muted} />
            <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>
              {tab === 'invoices' ? `Invoices (${invoices.length})` : `Payments (${payments.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Divider />

      {/* List */}
      {activeTab === 'invoices' ? (
        <FlatList
          data={invoices} keyExtractor={i => i.id} renderItem={renderInvoice}
          contentContainerStyle={st.listContent}
          ListEmptyComponent={
            <View style={st.emptyList}>
              <MaterialCommunityIcons name="receipt-text-outline" size={40} color={C.muted} />
              <Text style={st.emptyText}>No invoices yet</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={payments} keyExtractor={p => p.id} renderItem={renderPayment}
          contentContainerStyle={st.listContent}
          ListEmptyComponent={
            <View style={st.emptyList}>
              <MaterialCommunityIcons name="cash-off" size={40} color={C.muted} />
              <Text style={st.emptyText}>No payments recorded yet</Text>
            </View>
          }
        />
      )}

      {/* FABs */}
      {!isCashier && (
        <>
          {activeTab === 'invoices' && (
            <TouchableOpacity
              style={[st.fab, { bottom: 100 }]}
              onPress={() => { resetInvoiceForm(); setShowInvoiceForm(true); }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#FFF" />
              <Text style={st.fabLabel}>Record Invoice</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'payments' && (
            <TouchableOpacity
              style={[st.fab, { bottom: 100, backgroundColor: '#10B981' }]}
              onPress={() => {
                if (openInvoices.length === 0) {
                  Alert.alert('No Open Invoices', 'All invoices are fully paid. Record a new invoice first.');
                  return;
                }
                setShowPaymentForm(true);
              }}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="plus" size={16} color="#FFF" />
              <Text style={st.fabLabel}>Record Payment</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Invoice Detail Sheet */}
      <Modal visible={showInvoiceDetail} transparent animationType="slide" onRequestClose={() => setShowInvoiceDetail(false)}>
        <View style={st.sheetOverlay}>
          <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={st.sheetHandle} />
            {detailInvoice && (() => {
              const inv    = detailInvoice;
              const amount = parseFloat(inv.amount as any) || 0;
              const sc     = STATUS_COLOR[inv.status] ?? C.muted;
              return (
                <>
                  <View style={st.sheetTitleRow}>
                    <Text style={st.sheetTitle}>{inv.invoice_number ? `#${inv.invoice_number}` : 'Invoice Detail'}</Text>
                    <TouchableOpacity onPress={() => setShowInvoiceDetail(false)} style={st.sheetClose}>
                      <MaterialCommunityIcons name="close" size={18} color={C.ink} />
                    </TouchableOpacity>
                  </View>
                  <LinearGradient colors={['#7C3AED', '#4F46E5']} style={st.sheetHero}>
                    <Text style={st.sheetHeroLabel}>TOTAL AMOUNT</Text>
                    <Text style={st.sheetHeroAmt}>{fmtAmt(amount)}</Text>
                    <View style={[st.sheetPill, { backgroundColor: sc + '33', borderColor: sc + '66' }]}>
                      <View style={[st.sheetDot, { backgroundColor: sc }]} />
                      <Text style={[st.sheetPillText, { color: sc }]}>{inv.status.toUpperCase()}</Text>
                    </View>
                  </LinearGradient>
                  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
                    {[
                      { label: 'Supplier',     value: supplier?.name ?? '' },
                      { label: 'Invoice #',    value: inv.invoice_number ?? 'N/A' },
                      { label: 'Invoice Date', value: fmtDate(inv.invoice_date) },
                      { label: 'Due Date',     value: inv.due_date ? fmtDate(inv.due_date) : '\u2014' },
                      ...(inv.quantity   ? [{ label: 'Quantity',   value: String(inv.quantity) }] : []),
                      ...(inv.unit_price ? [{ label: 'Unit Price', value: fmtAmt(parseFloat(inv.unit_price as any)) }] : []),
                      { label: 'Amount',       value: fmtAmt(amount) },
                      ...(inv.notes ? [{ label: 'Notes', value: inv.notes }] : []),
                    ].map((r, i) => (
                      <View key={i} style={st.sheetMetaRow}>
                        <Text style={st.sheetMetaLabel}>{r.label}</Text>
                        <Text style={st.sheetMetaValue}>{r.value}</Text>
                      </View>
                    ))}
                  </ScrollView>
                  <View style={st.sheetActions}>
                    <TouchableOpacity style={st.shareBtn} onPress={() => shareInvoice(inv)}>
                      <MaterialCommunityIcons name="share-outline" size={16} color="#7C3AED" />
                      <Text style={st.shareBtnText}>Share / Print</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.closeBtn} onPress={() => setShowInvoiceDetail(false)}>
                      <Text style={st.closeBtnText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Record Invoice Form */}
      <Portal>
        <Dialog visible={showInvoiceForm} onDismiss={() => setShowInvoiceForm(false)}>
          <Dialog.Title>Record Invoice</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 500 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8 }}>
              <View style={st.formContainer}>
                <TextInput
                  label="Invoice # (auto-generated, editable)"
                  value={invoiceRef} onChangeText={setInvoiceRef}
                  mode="outlined" editable={!savingInvoice}
                  outlineColor={C.border} activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />
                <TextInput
                  label="Invoice Date * (YYYY-MM-DD)"
                  value={invoiceDate} onChangeText={setInvoiceDate}
                  mode="outlined" editable={!savingInvoice}
                  outlineColor={C.border} activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />
                <TextInput
                  label="Due Date (optional YYYY-MM-DD)"
                  value={invoiceDue} onChangeText={setInvoiceDue}
                  mode="outlined" editable={!savingInvoice}
                  outlineColor={C.border} activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      label="Qty" value={invoiceQty} onChangeText={setInvoiceQty}
                      mode="outlined" keyboardType="decimal-pad" editable={!savingInvoice}
                      outlineColor={C.border} activeOutlineColor="#7C3AED"
                      theme={{ colors: { background: C.card } }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      label="Unit Price" value={invoiceUnitPrice} onChangeText={setInvoiceUnitPrice}
                      mode="outlined" keyboardType="decimal-pad" editable={!savingInvoice}
                      outlineColor={C.border} activeOutlineColor="#7C3AED"
                      theme={{ colors: { background: C.card } }}
                    />
                  </View>
                </View>
                <TextInput
                  label="Total Amount * (₦)"
                  value={invoiceAmount} onChangeText={setInvoiceAmount}
                  mode="outlined" keyboardType="decimal-pad" editable={!savingInvoice}
                  outlineColor={C.border} activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />
                <TextInput
                  label="Notes (optional)"
                  value={invoiceNotes} onChangeText={setInvoiceNotes}
                  mode="outlined" multiline numberOfLines={3} editable={!savingInvoice}
                  outlineColor={C.border} activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowInvoiceForm(false)} disabled={savingInvoice}>Cancel</Button>
            <Button onPress={handleSaveInvoice} loading={savingInvoice} disabled={savingInvoice} mode="contained">Record</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Record Payment Form */}
      <Portal>
        <Dialog visible={showPaymentForm} onDismiss={() => setShowPaymentForm(false)}>
          <Dialog.Title>Record Payment</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 480 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8 }}>
              <View style={st.formContainer}>
                <View style={st.balanceBanner}>
                  <Text style={st.balanceBannerText}>
                    Outstanding: <Text style={{ fontWeight: '800', color: outstanding > 0 ? '#EF4444' : '#10B981' }}>{fmtAmt(outstanding)}</Text>
                  </Text>
                </View>
                <View>
                  <Text style={st.fieldLabel}>Select Invoice *</Text>
                  <TouchableOpacity style={st.dropdownTrigger} onPress={() => setShowInvoicePicker(true)} activeOpacity={0.7}>
                    <Text style={[st.dropdownText, !selectedInvoice && { color: C.muted }]}>
                      {selectedInvoice
                        ? `${selectedInvoice.invoice_number ? '#' + selectedInvoice.invoice_number : 'Invoice'} \u2014 Bal: ${fmtAmt(invoiceBalance(selectedInvoice.id))}`
                        : 'Choose an unpaid invoice\u2026'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color={C.muted} />
                  </TouchableOpacity>
                </View>
                {selectedInvoice && (
                  <View style={[st.balanceBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40' }]}>
                    <Text style={[st.balanceBannerText, { color: '#92400E' }]}>
                      Invoice balance: <Text style={{ fontWeight: '800' }}>{fmtAmt(invoiceBalance(selectedInvoice.id))}</Text>
                    </Text>
                  </View>
                )}
                <TextInput
                  label="Amount * (₦)" value={paymentAmount} onChangeText={setPaymentAmount}
                  mode="outlined" keyboardType="decimal-pad" editable={!savingPayment}
                  outlineColor={C.border} activeOutlineColor="#10B981"
                  theme={{ colors: { background: C.card } }}
                />
                <TextInput
                  label="Payment Date * (YYYY-MM-DD)" value={paymentDate} onChangeText={setPaymentDate}
                  mode="outlined" editable={!savingPayment}
                  outlineColor={C.border} activeOutlineColor="#10B981"
                  theme={{ colors: { background: C.card } }}
                />
                <TextInput
                  label="Notes (optional)" value={paymentNotes} onChangeText={setPaymentNotes}
                  mode="outlined" multiline numberOfLines={2} editable={!savingPayment}
                  outlineColor={C.border} activeOutlineColor="#10B981"
                  theme={{ colors: { background: C.card } }}
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowPaymentForm(false)} disabled={savingPayment}>Cancel</Button>
            <Button onPress={handleSavePayment} loading={savingPayment} disabled={savingPayment} mode="contained">Record</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Invoice Picker */}
      <Portal>
        <Dialog visible={showInvoicePicker} onDismiss={() => setShowInvoicePicker(false)}>
          <Dialog.Title>Select Invoice</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 380 }}>
            <ScrollView>
              {openInvoices.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: C.muted, fontSize: 13 }}>No unpaid or partial invoices</Text>
                </View>
              ) : openInvoices.map(inv => {
                const bal = invoiceBalance(inv.id);
                const sc  = STATUS_COLOR[inv.status] ?? C.muted;
                return (
                  <TouchableOpacity
                    key={inv.id}
                    style={[st.pickerRow, selectedInvoiceId === inv.id && st.pickerRowActive]}
                    onPress={() => { setSelectedInvoiceId(inv.id); setShowInvoicePicker(false); setPaymentAmount(bal.toFixed(2)); }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.pickerLabel}>
                        {inv.invoice_number ? `#${inv.invoice_number}` : 'Invoice'} \u2014 {fmtDate(inv.invoice_date)}
                      </Text>
                      <Text style={[st.pickerSub, { color: sc }]}>{inv.status.toUpperCase()} \u00b7 Balance: {fmtAmt(bal)}</Text>
                    </View>
                    {selectedInvoiceId === inv.id && <MaterialCommunityIcons name="check" size={16} color="#7C3AED" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowInvoicePicker(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const st = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: C.bg },
  topBar:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topBarTitle:     { fontSize: 16, fontWeight: '700', color: C.ink, flex: 1, textAlign: 'center' },
  heroBar:         { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, marginHorizontal: 16, borderRadius: 16, marginBottom: 10 },
  heroStat:        { flex: 1, alignItems: 'center' },
  heroStatLabel:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.08, textTransform: 'uppercase', marginBottom: 3 },
  heroStatValue:   { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  heroDivider:     { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'stretch' },
  subHeader:       { flexDirection: 'row', gap: 10, flexWrap: 'wrap', paddingHorizontal: 20, marginBottom: 10 },
  subTag:          { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subTagText:      { fontSize: 12, color: C.muted },
  tabs:            { flexDirection: 'row', paddingHorizontal: 16, gap: 4, marginBottom: 6 },
  tab:             { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  tabActive:       { borderColor: '#7C3AED', backgroundColor: '#7C3AED15' },
  tabText:         { fontSize: 12, fontWeight: '600', color: C.muted },
  tabTextActive:   { color: '#7C3AED', fontWeight: '700' },
  listContent:     { paddingHorizontal: 16, paddingBottom: 160, paddingTop: 8 },
  ledgerRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  ledgerIconWrap:  { width: 32, height: 32, borderRadius: 10, backgroundColor: '#7C3AED20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ledgerTitle:     { fontSize: 13, fontWeight: '700', color: C.ink },
  ledgerDate:      { fontSize: 11, color: C.muted, marginTop: 2 },
  ledgerNotes:     { fontSize: 11, color: C.muted, marginTop: 2, fontStyle: 'italic' },
  ledgerAmount:    { fontSize: 14, fontWeight: '800', color: C.ink },
  statusBadge:     { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  statusText:      { fontSize: 9, fontWeight: '700', letterSpacing: 0.05 },
  emptyList:       { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText:       { fontSize: 13, color: C.muted, fontWeight: '500' },
  formContainer:   { gap: 12, paddingTop: 4 },
  fieldLabel:      { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, marginLeft: 4 },
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: C.card },
  dropdownText:    { fontSize: 14, color: C.ink, flex: 1 },
  balanceBanner:   { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10 },
  balanceBannerText: { fontSize: 13, color: C.ink },
  pickerRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowActive: { backgroundColor: '#7C3AED10' },
  pickerLabel:     { fontSize: 13, fontWeight: '700', color: C.ink },
  pickerSub:       { fontSize: 11, marginTop: 2 },
  fab:             { position: 'absolute', right: 20, backgroundColor: '#7C3AED', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6, ...Platform.select({ ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 }, android: { elevation: 8 } }) },
  fabLabel:        { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  sheetOverlay:    { flex: 1, backgroundColor: 'rgba(14,14,16,0.55)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', shadowColor: '#000', shadowOffset: { width: 0, height: -20 }, shadowOpacity: 0.25, shadowRadius: 60, elevation: 24 },
  sheetHandle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  sheetTitleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  sheetTitle:      { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  sheetClose:      { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
  sheetHero:       { borderRadius: 16, marginHorizontal: 20, marginBottom: 14, padding: 18 },
  sheetHeroLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1, opacity: 0.8, color: '#fff', textTransform: 'uppercase' },
  sheetHeroAmt:    { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 4 },
  sheetPill:       { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  sheetDot:        { width: 6, height: 6, borderRadius: 3 },
  sheetPillText:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  sheetMetaRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'space-between' },
  sheetMetaLabel:  { fontSize: 12, fontWeight: '600', color: C.muted },
  sheetMetaValue:  { fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'right', flexShrink: 1, marginLeft: 12 },
  sheetActions:    { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  shareBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: '#7C3AED15', borderWidth: 1, borderColor: 'rgba(110,86,247,0.22)' },
  shareBtnText:    { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
  closeBtn:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  closeBtnText:    { fontSize: 14, fontWeight: '700', color: C.ink },
});
