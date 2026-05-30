import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert, ScrollView,
  Share, Modal, TouchableOpacity, Platform, TextInput, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootState } from '../redux/store';
import { addItem, removeItem, updateQuantity, clearCart } from '../redux/slices/cartSlice';
import { TransactionService, TransactionInput } from '../services/TransactionService';
import { setSyncMode, addToSyncQueue } from '../redux/slices/syncSlice';
import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import NotificationService from '../services/NotificationService';
import { generateId } from '../utils/generateId';
import { C, R, S, naira } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize } from '../utils/responsiveDesign';
import CustomerSearchModal from '../components/CustomerSearchModal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import type { Customer } from '../redux/slices/customersSlice';

type PaymentMethod = 'cash' | 'card' | 'mobile_wallet';
interface Branch { id: string; name: string; is_active: boolean; }
interface ReceiptData {
  receipt_number: string; transaction_id: string;
  items: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>;
  subtotal: number; tax_amount: number; discount_amount: number; total: number;
  payment_method: string; timestamp: string; branch_name?: string;
}

const PAY_OPTIONS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'cash',          label: 'Cash',     icon: 'cash'           },
  { id: 'card',          label: 'Card',     icon: 'credit-card'    },
  { id: 'mobile_wallet', label: 'Transfer', icon: 'bank-transfer'  },
];

const BRANCH_ALL_ID = '__all__';

// ─── Icon button ──────────────────────────────────────────────
const IconBtn = ({ icon, onPress }: { icon: string; onPress?: () => void }) => (
  <TouchableOpacity onPress={onPress} style={ib.btn} activeOpacity={0.7}>
    <MaterialCommunityIcons name={icon as any} size={20} color={C.ink} />
  </TouchableOpacity>
);
const ib = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: R.sm,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Category tone colour ────────────────────────────────────
const TONES = ['#6E56F7', '#10B981', '#F59E0B', '#FB7185', '#3B82F6'];
const getCategoryTone = (name?: string): string => {
  if (!name) return C.accent;
  const n = name.toLowerCase();
  if (n.includes('electron')) return '#6E56F7';
  if (n.includes('alcohol') || n.includes('beer') || n.includes('wine') || n.includes('lager')) return '#F59E0B';
  if (n.includes('soft') || n.includes('juice') || n.includes('water') || n.includes('drink')) return '#10B981';
  if (n.includes('snack') || n.includes('food') || n.includes('confection')) return '#FB7185';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % TONES.length;
  return TONES[h];
};

// ─── Chip ─────────────────────────────────────────────────────
const Chip = ({ label, icon, active, onPress }: { label: string; icon?: string; active: boolean; onPress: () => void }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.75}
    style={[chip.base, active && chip.active]}
  >
    {icon && <MaterialCommunityIcons name={icon as any} size={13} color={active ? C.accentFg : C.ink} />}
    <Text style={[chip.text, active && chip.textActive]}>{label}</Text>
  </TouchableOpacity>
);
const chip = StyleSheet.create({
  base: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  active: { backgroundColor: C.accent, borderColor: C.accent },
  text: { fontSize: 13, fontWeight: '600', color: C.ink },
  textActive: { color: C.accentFg },
});

// ─── Main Screen ──────────────────────────────────────────────
export default function CheckoutScreen() {
  const navigation  = useNavigation();
  const insets      = useSafeAreaInsets();
  const dispatch    = useDispatch();
  const cart        = useSelector((state: RootState) => state.cart);
  const auth        = useSelector((state: RootState) => state.auth);
  const sync        = useSelector((state: RootState) => state.sync);
  const user        = auth.user;
  const isAdmin     = user?.role === 'admin';
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [processing,      setProcessing]      = useState(false);
  const [searchQuery,     setSearchQuery]      = useState('');
  const [products,        setProducts]         = useState<any[]>([]);
  const [receipt,         setReceipt]          = useState<ReceiptData | null>(null);
  const [branches,        setBranches]         = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [cartExpanded,      setCartExpanded]      = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer]  = useState<Customer | null>(null);
  const [scannerOpen,       setScannerOpen]       = useState(false);
  const selectedBranchRef = useRef<string | null>(null);
  const route = useRoute<any>();

  // Pre-select a customer when arriving from the customer sheet's "New sale"
  useEffect(() => {
    const presetCustomer = route.params?.customer as Customer | undefined;
    if (presetCustomer) setSelectedCustomer(presetCustomer);
  }, [route.params?.customer]);

  // Auto-open the scanner when navigated from Dashboard "Scan" quick action
  useEffect(() => {
    if (route.params?.autoScan) setScannerOpen(true);
  }, [route.params?.autoScan]);

  const handleBarcodeScanned = (code: string) => {
    setScannerOpen(false);
    const trimmed = (code || '').toString().trim();
    const product = products.find(
      p => ((p.barcode ?? '') as string).toString().trim() === trimmed
        || ((p.sku ?? '') as string).toString().trim() === trimmed
    );
    if (product) {
      handleAdd(product);
    } else {
      Alert.alert('Product Not Found', `No product matches barcode: ${trimmed}`);
    }
  };

  useFocusEffect(useCallback(() => {
    const init = async () => {
      if (isAdmin) await loadBranches();
      loadProducts(selectedBranchRef.current);
    };
    init();
  }, []));

  const loadBranches = async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const list: Branch[] = Array.isArray(res) ? res : res?.data ?? [];
      setBranches(list.filter((b: Branch) => b.is_active));
    } catch {}
  };

  const loadProducts = async (branchId?: string | null) => {
    try {
      const bp = isAdmin && branchId ? `&branch_id=${encodeURIComponent(branchId)}` : '';
      const response: any = await ApiClient.get(`/products?limit=500${bp}`);
      const list = Array.isArray(response) ? response : response?.data ?? [];
      setProducts(list);
      // Cache the catalog so the cart still works with no connection.
      if (list.length > 0) DatabaseService.saveProducts(list).catch(() => {});
    } catch (e) {
      console.error('Products load error:', e);
      // Offline — fall back to the locally cached catalog.
      try {
        const cached = await DatabaseService.getProducts();
        if (cached && cached.length > 0) setProducts(cached);
      } catch {}
    }
  };

  const handleBranchSelect = (branchId: string | null) => {
    if (cart.items.length > 0 && branchId !== selectedBranchRef.current) {
      Alert.alert('Switch Branch?', 'Switching branch will clear the cart. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch & Clear', style: 'destructive', onPress: () => {
          dispatch(clearCart()); setSelectedPayment(null);
          selectedBranchRef.current = branchId; setSelectedBranchId(branchId);
          loadProducts(branchId);
        }},
      ]);
    } else {
      selectedBranchRef.current = branchId; setSelectedBranchId(branchId); loadProducts(branchId);
    }
  };

  const handleAdd    = (p: any) => {
    if (!p?.id || !p?.name) { Alert.alert('Error', 'Product data missing'); return; }
    dispatch(addItem({ product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.effective_price) || 0, tax_rate: Number(p.tax_rate) || 0 }));
  };
  const handleInc    = (id: string, qty: number) => dispatch(updateQuantity({ product_id: id, quantity: qty + 1 }));
  const handleDec    = (id: string, qty: number) => { if (qty <= 1) dispatch(removeItem(id)); else dispatch(updateQuantity({ product_id: id, quantity: qty - 1 })); };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(false);

    // Check credit limit if customer has one
    if (customer.id && customer.credit_limit) {
      const balance = customer.credit_limit - (customer.total_spent || 0);
      if (balance < cart.total) {
        Alert.alert(
          'Low Balance',
          `${customer.first_name} ${customer.last_name} has ₦${balance.toLocaleString()} credit available. Current sale total is ₦${(Math.round(cart.total * 100) / 100).toLocaleString()}.\n\nProceed anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setSelectedCustomer(null) },
            { text: 'Proceed', style: 'default' },
          ]
        );
      }
    }
  };

  const handleCharge = async () => {
    if (!selectedPayment) { Alert.alert('Select Payment', 'Choose a payment method first'); return; }
    if (cart.items.length === 0) { Alert.alert('Empty Cart', 'Add at least one product'); return; }
    if (isAdmin && !selectedBranchRef.current) { Alert.alert('Select Branch', 'Choose a specific branch before processing.'); return; }
    if (!isAdmin && !user?.branch_id) { Alert.alert('No Branch Assigned', 'Your account has no branch assigned. Please contact your administrator before making a sale.'); return; }

    setProcessing(true);
    try {
      const branchName = isAdmin
        ? branches.find(b => b.id === selectedBranchRef.current)?.name
        : user?.branch_name ?? undefined;

      const input: TransactionInput = {
        store_id: user?.store_id || 'store_001', user_id: user?.id || 'user_123',
        branch_id: isAdmin ? selectedBranchRef.current : (user?.branch_id || undefined),
        customer_id: selectedCustomer?.id || undefined,
        items: cart.items.map(it => ({
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: Number(it.unit_price) || 0,
          tax_amount: Math.round((it.unit_price * it.quantity * (it.tax_rate || 0)) / 100 * 100) / 100,
          line_total: Number(it.unit_price) * it.quantity || 0,
        })),
        subtotal: Math.round(cart.subtotal * 100) / 100,
        tax_amount: Math.round(cart.tax_amount * 100) / 100,
        discount_amount: Math.round(cart.discount_amount * 100) / 100,
        total_amount: Math.round(cart.total * 100) / 100,
        payment_method: selectedPayment,
      };
      const deviceId = (await SecureStore.getItemAsync('device_id')) || 'unknown';
      const isOnline = ApiClient.getOnlineStatus();
      const result   = await TransactionService.createTransaction(input, deviceId, isOnline);

      if (result.success) {
        // Local notifications — fire-and-forget; toggles checked inside the service
        NotificationService.notifySaleCompleted(Math.round(cart.total * 100) / 100);
        cart.items.forEach(it => {
          const product = products.find(p => p.id === it.product_id);
          const onHand = Number(product?.inventory?.quantity_on_hand);
          if (Number.isFinite(onHand)) {
            NotificationService.checkLowStock(it.product_name, onHand - it.quantity);
          }
        });

        if (!isOnline || result.status === 'queued_for_sync') {
          dispatch(addToSyncQueue({ id: generateId(), transaction_id: result.transaction_id, offline_session_hash: `${deviceId}-${result.transaction_id}-${Date.now()}`, status: 'pending', created_at: new Date().toISOString() }));
          dispatch(setSyncMode('OFFLINE'));
        }
        dispatch(clearCart()); setSelectedPayment(null); setSelectedCustomer(null);
        setReceipt({ receipt_number: result.receipt_number || result.transaction_id, transaction_id: result.transaction_id, items: cart.items.map(i => ({ product_name: i.product_name, quantity: i.quantity, unit_price: Number(i.unit_price) || 0, line_total: (Number(i.unit_price) || 0) * i.quantity })), subtotal: Math.round(cart.subtotal * 100) / 100, tax_amount: Math.round(cart.tax_amount * 100) / 100, discount_amount: Math.round(cart.discount_amount * 100) / 100, total: Math.round(cart.total * 100) / 100, payment_method: selectedPayment, timestamp: new Date().toLocaleString(), branch_name: branchName });
      }
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || error?.message || 'Transaction failed');
    } finally { setProcessing(false); }
  };

  const handlePrintReceipt = async () => {
    if (!receipt) return;
    const lines = [
      '================================',
      `       ${user?.first_name ?? 'Mobile POS'}`,
      receipt.branch_name ? `       ${receipt.branch_name}` : '',
      '================================',
      `Receipt: ${receipt.receipt_number}`,
      `Date:    ${receipt.timestamp}`,
      '--------------------------------',
      ...receipt.items.map(i => `${i.product_name}\n  ${i.quantity} x ₦${i.unit_price.toLocaleString()} = ₦${i.line_total.toLocaleString()}`),
      '--------------------------------',
      `Subtotal:  ₦${receipt.subtotal.toLocaleString()}`,
      `VAT:       ₦${receipt.tax_amount.toLocaleString()}`,
      receipt.discount_amount > 0 ? `Discount:  -₦${receipt.discount_amount.toLocaleString()}` : '',
      `TOTAL:     ₦${receipt.total.toLocaleString()}`,
      `Payment:   ${receipt.payment_method === 'mobile_wallet' ? 'TRANSFER' : receipt.payment_method.toUpperCase()}`,
      '================================',
      '   Thank you for your purchase!',
      '================================',
    ].filter(Boolean).join('\n');
    try { await Share.share({ message: lines, title: `Receipt ${receipt.receipt_number}` }); } catch {}
  };

  const filtered   = products.filter(p => !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku?.toLowerCase().includes(searchQuery.toLowerCase()));
  const cartCount  = cart.items.reduce((s, i) => s + i.quantity, 0);
  const activeBranch = isAdmin
    ? (selectedBranchId ? branches.find(b => b.id === selectedBranchId)?.name : null)
    : user?.branch_name ?? null;

  // ── Tablet layout with side-by-side product + cart ────
  if (isTablet) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, flexDirection: 'row' }}>
        {/* ── Product List Side (left) ────────────────────────── */}
        <View style={{ flex: 1, backgroundColor: C.bg, borderRightWidth: 1, borderRightColor: C.border }}>
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 14, borderBottomWidth: 1, borderBottomColor: C.border }]}>
            <IconBtn icon="close" onPress={() => (navigation as any).goBack()} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.headerTitle, { fontSize: fontSize.xl }]}>Products</Text>
              <Text style={[s.headerSub, { fontSize: fontSize.sm }]}>{filtered.length} available</Text>
            </View>
            <IconBtn icon="qrcode-scan" onPress={() => setScannerOpen(true)} />
          </View>

          {/* Search */}
          <View style={[s.searchWrap, { marginHorizontal: spacing.lg, marginVertical: spacing.md }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search by name or SKU"
              placeholderTextColor={C.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialCommunityIcons name="close-circle" size={16} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Product grid */}
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
            columnWrapperStyle={{ gap: spacing.md }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            renderItem={({ item }) => {
              const inCart = cart.items.find(c => c.product_id === item.id);
              const isLow = Number(item.inventory?.quantity_on_hand ?? 0) <= 10;
              const tone = getCategoryTone(item.category?.name);
              return (
                <View style={[s.prodCard, inCart ? { borderColor: tone + '55' } : null]}>
                  <View style={[s.prodEdge, { backgroundColor: tone }]} />
                  <View style={s.prodContent}>
                    <View style={s.prodTopRow}>
                      <Text style={[s.prodCatLabel, { color: tone, fontSize: fontSize.xs }]} numberOfLines={1}>
                        {item.category?.name ?? ''}
                      </Text>
                      {isLow && <View style={s.lowBadge}><Text style={[s.lowText, { fontSize: fontSize.xs }]}>LOW</Text></View>}
                    </View>
                    <Text style={[s.prodName, { fontSize: fontSize.base }]} numberOfLines={2}>{item.name}</Text>
                    <View style={s.prodFoot}>
                      <Text style={[s.prodPrice, { fontSize: fontSize.lg }]}>
                        <Text style={{ color: C.muted }}>₦</Text>
                        {(Number(item.effective_price) || 0).toLocaleString()}
                      </Text>
                      {!inCart ? (
                        <TouchableOpacity onPress={() => handleAdd(item)} style={s.addBtn}>
                          <MaterialCommunityIcons name="plus" size={18} color={C.accentFg} />
                        </TouchableOpacity>
                      ) : (
                        <View style={s.qtyRow}>
                          <TouchableOpacity onPress={() => handleDec(item.id, inCart.quantity)} style={s.qtyBtn}>
                            <MaterialCommunityIcons name="minus" size={14} color={C.accent} />
                          </TouchableOpacity>
                          <Text style={[s.qtyNum, { fontSize: fontSize.sm }]}>{inCart.quantity}</Text>
                          <TouchableOpacity onPress={() => handleInc(item.id, inCart.quantity)} style={s.qtyBtn}>
                            <MaterialCommunityIcons name="plus" size={14} color={C.accent} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={s.empty}>
                <MaterialCommunityIcons name="package-variant-closed" size={36} color={C.border} />
                <Text style={[s.emptyText, { fontSize: fontSize.base }]}>
                  {products.length === 0 ? 'No products — add them in Inventory' : `No results for "${searchQuery}"`}
                </Text>
              </View>
            }
          />
        </View>

        {/* ── Cart Side (right) ────────────────────────────── */}
        <View style={{ width: '35%', backgroundColor: C.card, borderLeftWidth: 1, borderLeftColor: C.border, flexDirection: 'column' }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Cart title */}
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={[s.cartItemCount, { fontSize: fontSize.lg }]}>
                {cartCount === 0 ? 'Cart Empty' : `${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
              </Text>
            </View>

            {/* Cart items */}
            {cartCount > 0 && (
              <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
                {cart.items.map((it, i) => (
                  <View key={it.product_id} style={[i < cart.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: spacing.md }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
                      <View style={[s.cartAvatar, { width: 32, height: 32 }]}>
                        <Text style={[s.cartAvatarLetter, { fontSize: fontSize.base }]}>{it.product_name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cartName, { fontSize: fontSize.sm }]} numberOfLines={1}>{it.product_name}</Text>
                        <Text style={[s.cartSub, { fontSize: fontSize.xs }]}>{it.quantity} × ₦{it.unit_price.toLocaleString()}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => dispatch(removeItem(it.product_id))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="close" size={16} color={C.muted} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[s.cartTotal, { fontSize: fontSize.sm }]}>₦{(it.unit_price * it.quantity).toLocaleString()}</Text>
                      <View style={[s.qtyRow, { gap: spacing.sm }]}>
                        <TouchableOpacity onPress={() => handleDec(it.product_id, it.quantity)} style={[s.qtyBtn, { width: 24, height: 24 }]}>
                          <MaterialCommunityIcons name="minus" size={12} color={C.accent} />
                        </TouchableOpacity>
                        <Text style={[s.qtyNum, { fontSize: fontSize.xs }]}>{it.quantity}</Text>
                        <TouchableOpacity onPress={() => handleInc(it.product_id, it.quantity)} style={[s.qtyBtn, { width: 24, height: 24 }]}>
                          <MaterialCommunityIcons name="plus" size={12} color={C.accent} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Cart actions */}
          {cartCount > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: C.bg }}>
              {/* Branch selector */}
              {isAdmin && (
                <TouchableOpacity
                  onPress={() => setBranchDropdownOpen(true)}
                  style={[s.customerBtn, { marginBottom: spacing.md }]}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="source-branch" size={16} color={selectedBranchId ? C.accent : C.ink} />
                  <Text style={[s.customerBtnText, { fontSize: fontSize.sm }]}>
                    {selectedBranchId
                      ? (branches.find(b => b.id === selectedBranchId)?.name ?? 'All Branches')
                      : 'Select branch'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Customer selector */}
              <TouchableOpacity
                onPress={() => setShowCustomerModal(true)}
                style={[s.customerBtn, { marginBottom: spacing.md }]}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={selectedCustomer ? 'account' : 'account-plus-outline'}
                  size={16}
                  color={selectedCustomer ? C.accent : C.ink}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.customerBtnText, { fontSize: fontSize.sm }]}>
                    {selectedCustomer
                      ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                      : 'Add customer'}
                  </Text>
                  {selectedCustomer && selectedCustomer.credit_limit && (
                    <Text style={[s.customerBtnSub, { fontSize: fontSize.xs }]}>
                      Balance: ₦{((selectedCustomer.credit_limit) - (selectedCustomer.total_spent || 0)).toLocaleString()}
                    </Text>
                  )}
                </View>
                {selectedCustomer && (
                  <TouchableOpacity
                    onPress={() => setSelectedCustomer(null)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialCommunityIcons name="close" size={14} color={C.muted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* Payment methods */}
              <View style={[s.payRow, { marginBottom: spacing.md }]}>
                {PAY_OPTIONS.map(m => (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => setSelectedPayment(m.id)}
                    style={[s.payBtn, { flex: 1 }, selectedPayment === m.id && s.payBtnActive]}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name={m.icon as any} size={14} color={selectedPayment === m.id ? C.accent : C.ink} />
                    <Text style={[s.payLabel, { fontSize: fontSize.xs }, selectedPayment === m.id && { color: C.accent }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cart summary */}
              <View style={{ backgroundColor: C.violetBg, padding: spacing.md, borderRadius: R.sm, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm }]}>Subtotal</Text>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm, fontWeight: '600' }]}>₦{cart.subtotal.toLocaleString()}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm }]}>VAT</Text>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm, fontWeight: '600' }]}>₦{cart.tax_amount.toLocaleString()}</Text>
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm }}>
                  <Text style={[s.cartItemCount, { fontSize: fontSize.base }]}>Total</Text>
                  <Text style={[s.cartTotalBig, { fontSize: fontSize.xxl }]}>₦{(cart.total || 0).toLocaleString()}</Text>
                </View>
              </View>

              {/* Charge button */}
              <TouchableOpacity
                onPress={handleCharge}
                disabled={processing || cartCount === 0 || !selectedPayment || (isAdmin && !selectedBranchId)}
                activeOpacity={0.85}
                style={[s.chargeBtn, (cartCount === 0 || !selectedPayment || (isAdmin && !selectedBranchId)) && s.chargeBtnDisabled]}
              >
                <MaterialCommunityIcons name="check" size={16} color={cartCount > 0 && selectedPayment ? C.accentFg : C.muted} />
                <Text style={[s.chargeLabel, { fontSize: fontSize.sm }, (cartCount === 0 || !selectedPayment) && { color: C.muted }]}>
                  {processing ? 'Processing…' : 'Checkout'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Modals */}
        <Modal
          visible={branchDropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setBranchDropdownOpen(false)}
        >
          <TouchableOpacity
            style={s.branchOverlay}
            activeOpacity={1}
            onPress={() => setBranchDropdownOpen(false)}
          >
            <View style={[s.branchDropdown, { left: 'auto', right: 20 }]}>
              <TouchableOpacity
                style={[s.branchOption, selectedBranchId === null && s.branchOptionActive]}
                onPress={() => { handleBranchSelect(null); setBranchDropdownOpen(false); }}
              >
                <MaterialCommunityIcons name="domain" size={16} color={selectedBranchId === null ? C.accent : C.muted} />
                <Text style={[s.branchOptionText, selectedBranchId === null && { color: C.accent }]}>All Branches</Text>
                {selectedBranchId === null && <MaterialCommunityIcons name="check" size={14} color={C.accent} />}
              </TouchableOpacity>
              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[s.branchOption, selectedBranchId === b.id && s.branchOptionActive]}
                  onPress={() => { handleBranchSelect(b.id); setBranchDropdownOpen(false); }}
                >
                  <MaterialCommunityIcons name="source-branch" size={16} color={selectedBranchId === b.id ? C.accent : C.muted} />
                  <Text style={[s.branchOptionText, selectedBranchId === b.id && { color: C.accent }]}>{b.name}</Text>
                  {selectedBranchId === b.id && <MaterialCommunityIcons name="check" size={14} color={C.accent} />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        <CustomerSearchModal
          visible={showCustomerModal}
          onDismiss={() => setShowCustomerModal(false)}
          onSelect={handleSelectCustomer}
          showNone={true}
        />

        <BarcodeScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScanned={handleBarcodeScanned}
        />

        {/* Receipt Modal */}
        <Modal visible={!!receipt} animationType="slide" onRequestClose={() => setReceipt(null)}>
          <View style={[s.rcptContainer, { backgroundColor: C.bg }]}>
            <View style={[s.rcptHeader, { paddingTop: insets.top + 14 }]}>
              <View style={[s.rcptIconWrap, { backgroundColor: C.violetBg }]}>
                <MaterialCommunityIcons name="check-circle" size={24} color={C.accent} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={s.rcptTitle}>Transaction Complete</Text>
                {receipt?.branch_name && (
                  <Text style={s.rcptBranch}>{receipt.branch_name}</Text>
                )}
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.xl }}>
              <View style={[s.rcptCard, { padding: spacing.lg }]}>
                <Text style={s.rcptMeta}>Receipt: {receipt?.receipt_number}</Text>
                <Text style={s.rcptMeta}>{receipt?.timestamp}</Text>
              </View>

              <Text style={s.rcptSection}>Items Purchased</Text>
              <View style={[s.rcptCard, { padding: spacing.lg }]}>
                {receipt?.items.map((item, i) => (
                  <View key={i}>
                    <View style={s.rcptItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rcptItemName}>{item.product_name ?? 'Unknown'}</Text>
                        <Text style={s.rcptItemSub}>{item.quantity} × ₦{(item.unit_price || 0).toLocaleString()}</Text>
                      </View>
                      <Text style={s.rcptItemTotal}>₦{(item.line_total || 0).toLocaleString()}</Text>
                    </View>
                    {i < (receipt.items.length - 1) && <View style={s.rcptDivider} />}
                  </View>
                ))}
              </View>

              <View style={[s.rcptCard, { marginTop: spacing.md, padding: spacing.lg }]}>
                {[
                  ['Subtotal', receipt?.subtotal ?? 0],
                  ['VAT', receipt?.tax_amount ?? 0],
                  ...(receipt?.discount_amount && receipt.discount_amount > 0 ? [['Discount', -(receipt.discount_amount)]] : []),
                ].map(([label, val]) => (
                  <View key={label as string} style={s.rcptTotalRow}>
                    <Text style={s.rcptTotalLabel}>{label}</Text>
                    <Text style={[(val as number) < 0 ? { color: C.green } : {}, s.rcptTotalVal]}>
                      {(val as number) < 0 ? '-' : ''}₦{Math.abs(val as number || 0).toLocaleString()}
                    </Text>
                  </View>
                ))}
                <View style={[s.rcptTotalRow, s.rcptGrandRow]}>
                  <Text style={s.rcptGrandLabel}>Total Paid</Text>
                  <Text style={s.rcptGrandVal}>₦{(receipt?.total || 0).toLocaleString()}</Text>
                </View>
                <View style={[s.rcptTotalRow, { marginTop: spacing.sm }]}>
                  <Text style={s.rcptMeta}>Payment Method</Text>
                  <Text style={s.rcptMeta}>
                    {receipt?.payment_method === 'mobile_wallet' ? 'TRANSFER' : receipt?.payment_method?.toUpperCase()}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={[s.rcptActions, { paddingBottom: insets.bottom + spacing.lg, paddingHorizontal: spacing.xl }]}>
              <TouchableOpacity onPress={handlePrintReceipt} style={s.rcptBtnOutline} activeOpacity={0.75}>
                <MaterialCommunityIcons name="share-variant" size={16} color={C.accent} />
                <Text style={[s.rcptBtnText, { color: C.accent, fontSize: fontSize.sm }]}>Print / Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setReceipt(null)} style={s.rcptBtnFill} activeOpacity={0.85}>
                <MaterialCommunityIcons name="check" size={16} color={C.accentFg} />
                <Text style={[s.rcptBtnText, { color: C.accentFg, fontSize: fontSize.sm }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Phone layout with floating cart drawer ────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <IconBtn icon="close" onPress={() => (navigation as any).goBack()} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle}>New Sale</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Text style={s.headerSub}>{cartCount} {cartCount === 1 ? 'item' : 'items'}</Text>
            {(isAdmin || activeBranch) && <Text style={s.headerSub}>·</Text>}
            {isAdmin ? (
              <TouchableOpacity
                onPress={() => setBranchDropdownOpen(true)}
                style={s.branchPill}
                activeOpacity={0.7}
              >
                <Text style={s.branchPillText}>
                  {selectedBranchId
                    ? (branches.find(b => b.id === selectedBranchId)?.name ?? 'All Branches')
                    : 'All Branches'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={12} color={C.accent} />
              </TouchableOpacity>
            ) : activeBranch ? (
              <Text style={s.headerSub}>{activeBranch}</Text>
            ) : null}
          </View>
        </View>
        <IconBtn icon="qrcode-scan" onPress={() => setScannerOpen(true)} />
      </View>

      {/* ── Search ─────────────────────────────────────────────── */}
      <View style={s.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search by name or SKU"
          placeholderTextColor={C.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Product grid ───────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: cartCount > 0 ? 260 : 180 }}
        columnWrapperStyle={{ gap: 10 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={
          <View style={s.productsHeader}>
            <Text style={s.productsEyebrow}>{filtered.length} PRODUCTS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialCommunityIcons name="filter-outline" size={12} color={C.muted} />
              <Text style={s.filterBtnText}>All</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const inCart = cart.items.find(c => c.product_id === item.id);
          const isLow  = Number(item.inventory?.quantity_on_hand ?? 0) <= 10;
          const tone   = getCategoryTone(item.category?.name);
          return (
            <View style={[s.prodCard, inCart ? { borderColor: tone + '55' } : null]}>
              {/* 3px coloured left edge */}
              <View style={[s.prodEdge, { backgroundColor: tone }]} />
              <View style={s.prodContent}>
                {/* Category eyebrow + LOW badge */}
                <View style={s.prodTopRow}>
                  <Text style={[s.prodCatLabel, { color: tone }]} numberOfLines={1}>
                    {item.category?.name ?? ''}
                  </Text>
                  {isLow && <View style={s.lowBadge}><Text style={s.lowText}>LOW</Text></View>}
                </View>
                {/* Product name */}
                <Text style={s.prodName} numberOfLines={2}>{item.name}</Text>
                {/* Price + qty controls */}
                <View style={s.prodFoot}>
                  <Text style={s.prodPrice}>
                    <Text style={{ color: C.muted }}>₦</Text>
                    {(Number(item.effective_price) || 0).toLocaleString()}
                  </Text>
                  {!inCart ? (
                    <TouchableOpacity onPress={() => handleAdd(item)} style={s.addBtn}>
                      <MaterialCommunityIcons name="plus" size={16} color={C.accentFg} />
                    </TouchableOpacity>
                  ) : (
                    <View style={s.qtyRow}>
                      <TouchableOpacity onPress={() => handleDec(item.id, inCart.quantity)} style={s.qtyBtn}>
                        <MaterialCommunityIcons name="minus" size={14} color={C.accent} />
                      </TouchableOpacity>
                      <Text style={s.qtyNum}>{inCart.quantity}</Text>
                      <TouchableOpacity onPress={() => handleInc(item.id, inCart.quantity)} style={s.qtyBtn}>
                        <MaterialCommunityIcons name="plus" size={14} color={C.accent} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <MaterialCommunityIcons name="package-variant-closed" size={36} color={C.border} />
            <Text style={s.emptyText}>
              {products.length === 0 ? 'No products — add them in Inventory' : `No results for "${searchQuery}"`}
            </Text>
          </View>
        }
      />

      {/* ── Cart drawer ─────────────────────────────────────────── */}
      <View style={[s.drawer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* handle */}
        <View style={s.handle} />

        {/* Expanded cart items */}
        {cartExpanded && cartCount > 0 && (
          <ScrollView style={{ maxHeight: 200, marginBottom: 12 }} showsVerticalScrollIndicator={false}>
            {cart.items.map(it => (
              <View key={it.product_id} style={s.cartItem}>
                <View style={s.cartAvatar}>
                  <Text style={s.cartAvatarLetter}>{it.product_name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cartName} numberOfLines={1}>{it.product_name}</Text>
                  <Text style={s.cartSub}>₦{it.unit_price.toLocaleString()} each</Text>
                </View>
                <View style={s.qtyRow}>
                  <TouchableOpacity
                    onPress={() => handleDec(it.product_id, it.quantity)}
                    style={s.qtyBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialCommunityIcons name="minus" size={14} color={C.accent} />
                  </TouchableOpacity>
                  <Text style={s.qtyNum}>{it.quantity}</Text>
                  <TouchableOpacity
                    onPress={() => handleInc(it.product_id, it.quantity)}
                    style={s.qtyBtn}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialCommunityIcons name="plus" size={14} color={C.accent} />
                  </TouchableOpacity>
                </View>
                <Text style={s.cartTotal}>₦{(it.unit_price * it.quantity).toLocaleString()}</Text>
                <TouchableOpacity
                  onPress={() => dispatch(removeItem(it.product_id))}
                  style={s.cartRemoveBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="close" size={14} color={C.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Cart summary row */}
        <TouchableOpacity
          onPress={() => cartCount > 0 && setCartExpanded(!cartExpanded)}
          style={s.cartSummary} activeOpacity={cartCount > 0 ? 0.7 : 1}
        >
          <View style={s.cartIconWrap}>
            <MaterialCommunityIcons name="cart-outline" size={18} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cartItemCount}>
              {cartCount === 0 ? 'Cart empty' : `${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
            </Text>
            <Text style={s.cartVat}>
              {cartCount === 0 ? 'Tap a product to add' : `VAT ₦${cart.tax_amount.toLocaleString()}`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={s.cartTotalBig}>
              <Text style={{ color: C.muted }}>₦</Text>
              {(cart.total || 0).toLocaleString()}
            </Text>
            {cartCount > 0 && (
              <MaterialCommunityIcons
                name={cartExpanded ? 'chevron-down' : 'chevron-up'}
                size={18} color={C.muted}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Admin branch warning */}
        {isAdmin && !selectedBranchId && cartCount > 0 && (
          <Text style={s.branchWarn}>⚠  Select a branch before checkout</Text>
        )}

        {/* Customer selector */}
        {cartCount > 0 && (
          <TouchableOpacity
            onPress={() => setShowCustomerModal(true)}
            style={s.customerBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={selectedCustomer ? 'account' : 'account-plus-outline'}
              size={16}
              color={selectedCustomer ? C.accent : C.ink}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.customerBtnText}>
                {selectedCustomer
                  ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
                  : 'Add customer (optional)'}
              </Text>
              {selectedCustomer && selectedCustomer.credit_limit && (
                <Text style={s.customerBtnSub}>
                  Balance: ₦{((selectedCustomer.credit_limit) - (selectedCustomer.total_spent || 0)).toLocaleString()}
                </Text>
              )}
            </View>
            {selectedCustomer && (
              <TouchableOpacity
                onPress={() => setSelectedCustomer(null)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialCommunityIcons name="close" size={14} color={C.muted} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}

        {/* Payment methods */}
        <View style={s.payRow}>
          {PAY_OPTIONS.map(m => (
            <TouchableOpacity
              key={m.id} onPress={() => setSelectedPayment(m.id)}
              style={[s.payBtn, selectedPayment === m.id && s.payBtnActive]}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name={m.icon as any} size={16}
                color={selectedPayment === m.id ? C.accent : C.ink} />
              <Text style={[s.payLabel, selectedPayment === m.id && { color: C.accent }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {sync.mode === 'OFFLINE' && (
          <Text style={s.offlineNote}>⚠  Offline — will sync when connected</Text>
        )}

        {/* Charge button */}
        <TouchableOpacity
          onPress={handleCharge}
          disabled={processing || cartCount === 0 || !selectedPayment}
          activeOpacity={0.85}
          style={[s.chargeBtn, (cartCount === 0 || !selectedPayment) && s.chargeBtnDisabled]}
        >
          <MaterialCommunityIcons name="check" size={18} color={cartCount > 0 && selectedPayment ? C.accentFg : C.muted} />
          <Text style={[s.chargeLabel, (cartCount === 0 || !selectedPayment) && { color: C.muted }]}>
            {processing ? 'Processing…' : `Charge ₦${cart.total.toLocaleString()}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Branch dropdown ───────────────────────────────────── */}
      <Modal
        visible={branchDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBranchDropdownOpen(false)}
      >
        <TouchableOpacity
          style={s.branchOverlay}
          activeOpacity={1}
          onPress={() => setBranchDropdownOpen(false)}
        >
          <View style={s.branchDropdown}>
            <TouchableOpacity
              style={[s.branchOption, selectedBranchId === null && s.branchOptionActive]}
              onPress={() => { handleBranchSelect(null); setBranchDropdownOpen(false); }}
            >
              <MaterialCommunityIcons name="domain" size={16} color={selectedBranchId === null ? C.accent : C.muted} />
              <Text style={[s.branchOptionText, selectedBranchId === null && { color: C.accent }]}>All Branches</Text>
              {selectedBranchId === null && <MaterialCommunityIcons name="check" size={14} color={C.accent} />}
            </TouchableOpacity>
            {branches.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[s.branchOption, selectedBranchId === b.id && s.branchOptionActive]}
                onPress={() => { handleBranchSelect(b.id); setBranchDropdownOpen(false); }}
              >
                <MaterialCommunityIcons name="source-branch" size={16} color={selectedBranchId === b.id ? C.accent : C.muted} />
                <Text style={[s.branchOptionText, selectedBranchId === b.id && { color: C.accent }]}>{b.name}</Text>
                {selectedBranchId === b.id && <MaterialCommunityIcons name="check" size={14} color={C.accent} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Receipt Modal ─────────────────────────────────────── */}
      <Modal visible={!!receipt} animationType="slide" onRequestClose={() => setReceipt(null)}>
        <View style={[s.rcptContainer, { backgroundColor: C.bg }]}>
          <View style={[s.rcptHeader, { paddingTop: insets.top + 14 }]}>
            <View style={[s.rcptIconWrap, { backgroundColor: C.violetBg }]}>
              <MaterialCommunityIcons name="check-circle" size={24} color={C.accent} />
            </View>
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={s.rcptTitle}>Transaction Complete</Text>
              {receipt?.branch_name && (
                <Text style={s.rcptBranch}>{receipt.branch_name}</Text>
              )}
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: S.xl }}>
            <View style={s.rcptCard}>
              <Text style={s.rcptMeta}>Receipt: {receipt?.receipt_number}</Text>
              <Text style={s.rcptMeta}>{receipt?.timestamp}</Text>
            </View>

            <Text style={s.rcptSection}>Items Purchased</Text>
            <View style={s.rcptCard}>
              {receipt?.items.map((item, i) => (
                <View key={i}>
                  <View style={s.rcptItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rcptItemName}>{item.product_name ?? 'Unknown'}</Text>
                      <Text style={s.rcptItemSub}>{item.quantity} × ₦{(item.unit_price || 0).toLocaleString()}</Text>
                    </View>
                    <Text style={s.rcptItemTotal}>₦{(item.line_total || 0).toLocaleString()}</Text>
                  </View>
                  {i < (receipt.items.length - 1) && <View style={s.rcptDivider} />}
                </View>
              ))}
            </View>

            <View style={[s.rcptCard, { marginTop: 12 }]}>
              {[
                ['Subtotal', receipt?.subtotal ?? 0],
                ['VAT', receipt?.tax_amount ?? 0],
                ...(receipt?.discount_amount && receipt.discount_amount > 0 ? [['Discount', -(receipt.discount_amount)]] : []),
              ].map(([label, val]) => (
                <View key={label as string} style={s.rcptTotalRow}>
                  <Text style={s.rcptTotalLabel}>{label}</Text>
                  <Text style={[(val as number) < 0 ? { color: C.green } : {}, s.rcptTotalVal]}>
                    {(val as number) < 0 ? '-' : ''}₦{Math.abs(val as number || 0).toLocaleString()}
                  </Text>
                </View>
              ))}
              <View style={[s.rcptTotalRow, s.rcptGrandRow]}>
                <Text style={s.rcptGrandLabel}>Total Paid</Text>
                <Text style={s.rcptGrandVal}>₦{(receipt?.total || 0).toLocaleString()}</Text>
              </View>
              <View style={[s.rcptTotalRow, { marginTop: 4 }]}>
                <Text style={s.rcptMeta}>Payment Method</Text>
                <Text style={s.rcptMeta}>
                  {receipt?.payment_method === 'mobile_wallet' ? 'TRANSFER' : receipt?.payment_method?.toUpperCase()}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={[s.rcptActions, { paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity onPress={handlePrintReceipt} style={s.rcptBtnOutline} activeOpacity={0.75}>
              <MaterialCommunityIcons name="share-variant" size={18} color={C.accent} />
              <Text style={[s.rcptBtnText, { color: C.accent }]}>Print / Share</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setReceipt(null)} style={s.rcptBtnFill} activeOpacity={0.85}>
              <MaterialCommunityIcons name="check" size={18} color={C.accentFg} />
              <Text style={[s.rcptBtnText, { color: C.accentFg }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Customer Search Modal ───────────────────────────────── */}
      <CustomerSearchModal
        visible={showCustomerModal}
        onDismiss={() => setShowCustomerModal(false)}
        onSelect={handleSelectCustomer}
        showNone={true}
      />

      {/* ── Barcode Scanner ─────────────────────────────────────── */}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={handleBarcodeScanned}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.xl, paddingBottom: 14,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2, color: C.ink },
  headerSub:   { fontSize: 12, color: C.muted },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: R.md, marginHorizontal: S.xl, marginVertical: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },

  // Branch inline pill + dropdown
  branchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(110,86,247,0.08)',
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999,
  },
  branchPillText: { fontSize: 11, fontWeight: '700', color: C.accent },
  branchOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  branchDropdown: {
    position: 'absolute', top: 72, left: 20,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    padding: 4, minWidth: 190,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  branchOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
  },
  branchOptionActive: { backgroundColor: 'rgba(110,86,247,0.08)' },
  branchOptionText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.ink },

  // Products header row
  productsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, marginBottom: 2,
  },
  productsEyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', color: C.muted,
  },
  filterBtnText: { fontSize: 11, fontWeight: '600', color: C.muted },

  // Product card
  prodCard: {
    flex: 1, backgroundColor: C.card, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  prodEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, opacity: 0.85 },
  prodContent: { padding: 10, paddingLeft: 9 },
  prodTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  prodCatLabel: {
    flex: 1, fontSize: 9, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  lowBadge: {
    backgroundColor: 'rgba(251,113,133,0.10)',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: R.xs,
  },
  lowText: { fontSize: 9, fontWeight: '700', color: '#FB7185' },
  prodName: { fontSize: 13, fontWeight: '700', lineHeight: 17, height: 34, color: C.ink },
  prodFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  prodPrice: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700', fontSize: 14, color: C.ink, flex: 1,
  },
  addBtn: {
    width: 30, height: 30, borderRadius: R.xs,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 26, height: 26, borderRadius: R.xs,
    backgroundColor: C.violetBg, alignItems: 'center', justifyContent: 'center',
  },
  qtyNum: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700', fontSize: 13, color: C.accent, minWidth: 12, textAlign: 'center',
  },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: C.muted, textAlign: 'center', paddingHorizontal: 24, fontSize: 13 },

  // Cart drawer
  drawer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.card, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: S.xl, paddingTop: 14,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.06, shadowRadius: 20 },
      android: { elevation: 16 },
    }),
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 10 },

  cartItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  cartAvatar: {
    width: 32, height: 32, borderRadius: R.xs,
    backgroundColor: C.violetBg, alignItems: 'center', justifyContent: 'center',
  },
  cartAvatarLetter: { fontSize: 14, fontWeight: '700', color: C.accent },
  cartName:  { fontSize: 13, fontWeight: '600', color: C.ink },
  cartSub:   { fontSize: 11, color: C.muted },
  cartTotal: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700', fontSize: 13, color: C.ink },
  cartRemoveBtn: {
    width: 24, height: 24, borderRadius: R.xs,
    backgroundColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },

  cartSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cartIconWrap: { width: 36, height: 36, borderRadius: R.sm, backgroundColor: C.violetBg, alignItems: 'center', justifyContent: 'center' },
  cartItemCount: { fontSize: 13, fontWeight: '700', color: C.ink },
  cartVat: { fontSize: 11, color: C.muted },
  cartTotalBig: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '800', fontSize: 22, color: C.ink,
  },

  branchWarn: { fontSize: 11, color: C.amber, fontWeight: '600', marginBottom: 8, textAlign: 'center' },

  customerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: C.bg, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 12,
  },
  customerBtnText: { fontSize: 13, fontWeight: '600', color: C.ink },
  customerBtnSub: { fontSize: 11, color: C.muted, marginTop: 2 },

  payRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  payBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent',
  },
  payBtnActive: { borderColor: C.accent, backgroundColor: C.violetBg },
  payLabel: { fontSize: 13, fontWeight: '600', color: C.ink },

  offlineNote: { fontSize: 11, color: '#e65100', textAlign: 'center', marginBottom: 8 },

  chargeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: R.md,
    backgroundColor: C.accent, marginBottom: 4,
  },
  chargeBtnDisabled: { backgroundColor: C.border },
  chargeLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 15, fontWeight: '700', color: C.accentFg,
  },

  // Receipt modal
  rcptContainer: { flex: 1 },
  rcptHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.xl, paddingBottom: 16,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  rcptIconWrap: { width: 44, height: 44, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },
  rcptTitle:   { fontSize: 18, fontWeight: '700', color: C.ink },
  rcptBranch:  { fontSize: 12, color: C.accent },
  rcptCard:    { backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  rcptMeta:    { fontSize: 12, color: C.muted, marginBottom: 2 },
  rcptSection: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8, marginTop: 4 },
  rcptItem:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rcptItemName:  { fontSize: 14, fontWeight: '600', color: C.ink },
  rcptItemSub:   { fontSize: 12, color: C.muted },
  rcptItemTotal: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700', fontSize: 14, color: C.ink },
  rcptDivider:   { height: 1, backgroundColor: C.border },
  rcptTotalRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rcptTotalLabel:{ fontSize: 13, color: C.muted },
  rcptTotalVal:  { fontSize: 13, fontWeight: '600', color: C.ink },
  rcptGrandRow:  { borderTopWidth: 1, borderTopColor: C.border, marginTop: 6, paddingTop: 6 },
  rcptGrandLabel:{ fontSize: 15, fontWeight: '700', color: C.ink },
  rcptGrandVal:  { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '800', fontSize: 18, color: C.accent },
  rcptActions:   { flexDirection: 'row', gap: 12, padding: S.xl, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  rcptBtnOutline:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: R.md, borderWidth: 1, borderColor: C.accent },
  rcptBtnFill:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: R.md, backgroundColor: C.accent },
  rcptBtnText:   { fontSize: 15, fontWeight: '700' },
});
