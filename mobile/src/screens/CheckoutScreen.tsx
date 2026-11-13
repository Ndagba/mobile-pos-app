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
import { addItem, removeItem, updateQuantity, setDiscount, clearCart } from '../redux/slices/cartSlice';
import { setSyncMode, addToSyncQueue } from '../redux/slices/syncSlice';
import ApiClient, { API_BASE_URL } from '../services/ApiClient';
import { CachedImage } from '../components/ui/CachedImage';
import DatabaseService from '../services/DatabaseService';
import NotificationService from '../services/NotificationService';
import { generateId } from '../utils/generateId';
import { C, R, S, naira } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize } from '../utils/responsiveDesign';
import CustomerSearchModal from '../components/CustomerSearchModal';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import PaymentModal from '../components/PaymentModal';
import { holdSale, listHeldSales, deleteHeldSale, type HeldSale } from '../services/HeldSalesService';
import type { Customer } from '../redux/slices/customersSlice';
import { tracksInventory, getAvailableStock, isOutOfStock, canIncrementQuantity } from '../utils/inventory';
import { buildTransactionInput, createTransaction, cashierDiscountRule, clampDiscount } from '@jaypos/shared';
import { getReceiptBranding } from '../utils/receiptBranding';
import type { PaymentMethod, SplitPaymentAllocations } from '@jaypos/shared';

/** Human label for a payment method on the receipt. */
const paymentLabel = (pm: string): string =>
  pm === 'transfer' ? 'Transfer' : pm === 'card' ? 'Card' : pm === 'split' ? 'Split' : 'Cash';

interface Branch { id: string; name: string; is_active: boolean; }
interface ReceiptData {
  receipt_number: string; transaction_id: string;
  items: Array<{ product_name: string; quantity: number; unit_price: number; line_total: number }>;
  subtotal: number; tax_amount: number; discount_amount: number; total: number;
  payment_method: string; payment_label: string; payment_splits?: SplitPaymentAllocations;
  timestamp: string; branch_name?: string;
}

const BRANCH_ALL_ID = '__all__';

type ItemTypeFilter = 'ALL' | 'PRODUCT' | 'SERVICE';
const TYPE_FILTERS: { key: ItemTypeFilter; label: string }[] = [
  { key: 'ALL',     label: 'All'      },
  { key: 'PRODUCT', label: 'Products' },
  { key: 'SERVICE', label: 'Services' },
];

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
  const settings    = useSelector((state: RootState) => state.settings.settings);
  const user        = auth.user;
  const isAdmin     = ['admin', 'manager'].includes(user?.role ?? '');
  const isCustomerEnabled = settings?.customer_menu_enabled ?? true;
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  const [payOpen,         setPayOpen]          = useState(false);
  const [discountInput,   setDiscountInput]     = useState('');
  const [heldOpen,        setHeldOpen]          = useState(false);
  const [held,            setHeld]              = useState<HeldSale[]>([]);
  const [processing,      setProcessing]      = useState(false);
  const [searchQuery,     setSearchQuery]      = useState('');
  const [typeFilter,      setTypeFilter]        = useState<ItemTypeFilter>('ALL');
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
      listHeldSales().then(setHeld).catch(() => {});
    };
    init();
  }, []));

  const loadBranches = async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const list: Branch[] = Array.isArray(res) ? res : res?.data ?? [];
      const activeBranches = list.filter((b: Branch) => b.is_active);
      setBranches(activeBranches);
      if (activeBranches.length === 1) {
        selectedBranchRef.current = activeBranches[0].id;
        setSelectedBranchId(activeBranches[0].id);
      }
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
          dispatch(clearCart()); setDiscountInput('');
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
    // Eligibility is based on item type + stock-tracking capability, not raw stock:
    // a service (which has no inventory row) is always sellable.
    if (isOutOfStock(p)) {
      Alert.alert('Out of Stock', `${p.name} is out of stock`);
      return;
    }
    const inCart = cart.items.find(c => c.product_id === p.id);
    if (inCart && !canIncrementQuantity(p, inCart.quantity)) {
      Alert.alert('Limit Reached', `Only ${getAvailableStock(p)} units available in stock`);
      return;
    }
    dispatch(addItem({ product_id: p.id, product_name: p.name, quantity: 1, unit_price: Number(p.effective_price) || 0, tax_rate: Number(p.tax_rate) || 0, item_type: tracksInventory(p) ? 'PRODUCT' : 'SERVICE' }));
  };
  const handleInc    = (id: string, qty: number) => {
    const product = products.find(p => p.id === id);
    if (!canIncrementQuantity(product, qty)) {
      Alert.alert('Limit Reached', `Only ${getAvailableStock(product)} units available in stock`);
      return;
    }
    dispatch(updateQuantity({ product_id: id, quantity: qty + 1 }));
  };
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

  // ── Discount (store-level, applied after tax) ──────────────────
  // Cashiers can be blocked from discounting (`allow_cashier_discount`) or capped
  // to a share of the subtotal (`max_discount_percent`) by the store settings;
  // admins/managers are never limited. Same shared rule the desktop applies.
  const discountRule = cashierDiscountRule(user, settings, cart.subtotal);
  const applyDiscount = (raw: string) => {
    const requested = Math.max(0, Number(raw) || 0);
    const clamped = clampDiscount(requested, discountRule);
    // Show the capped figure when the cap bites; otherwise keep what was typed ("12.").
    setDiscountInput(clamped !== requested ? String(clamped) : raw);
    dispatch(setDiscount(clamped));
  };

  // Keep an existing discount inside the cap when the cart shrinks, a held sale
  // is resumed, or the store settings change underneath it.
  useEffect(() => {
    const clamped = clampDiscount(cart.discount_amount, discountRule);
    if (clamped !== cart.discount_amount) {
      dispatch(setDiscount(clamped));
      setDiscountInput(clamped ? String(clamped) : '');
    }
  }, [cart.discount_amount, discountRule.allowed, discountRule.cap]);

  const discountHint = !discountRule.allowed
    ? 'Disabled for cashiers'
    : discountRule.maxPercent != null
      ? `max ${discountRule.maxPercent}%`
      : null;

  // ── Hold / Resume parked sales ─────────────────────────────────
  const refreshHeld = useCallback(() => {
    listHeldSales().then(setHeld).catch(() => {});
  }, []);

  const handleHold = () => {
    if (cart.items.length === 0) return;
    holdSale({ items: cart.items, discount_amount: cart.discount_amount, customer: selectedCustomer })
      .then(() => {
        dispatch(clearCart());
        setSelectedCustomer(null);
        setDiscountInput('');
        refreshHeld();
        Alert.alert('Sale held', 'The sale was parked. Resume it from Held.');
      })
      .catch(() => Alert.alert('Error', 'Could not hold the sale'));
  };

  const resumeHeld = async (sale: HeldSale) => {
    dispatch(clearCart());
    sale.items.forEach(it => dispatch(addItem(it)));
    dispatch(setDiscount(sale.discount_amount || 0));
    setDiscountInput(sale.discount_amount ? String(sale.discount_amount) : '');
    setSelectedCustomer(sale.customer ?? null);
    await deleteHeldSale(sale.id);
    refreshHeld();
    setHeldOpen(false);
  };

  // Validate branch + cart, then open the payment sheet.
  const openPayment = () => {
    if (cart.items.length === 0) { Alert.alert('Empty Cart', 'Add at least one product'); return; }
    let finalBranchId = selectedBranchRef.current;
    if (isAdmin && !finalBranchId && branches.length === 1) finalBranchId = branches[0].id;
    if (isAdmin && !finalBranchId) { Alert.alert('Select Branch', 'Choose a specific branch before processing.'); return; }
    if (!isAdmin && !user?.branch_id) { Alert.alert('No Branch Assigned', 'Your account has no branch assigned. Please contact your administrator before making a sale.'); return; }
    setPayOpen(true);
  };

  // Finalize the sale via the shared build + create path (desktop parity:
  // identical totals, byte-identical offline_session_hash, payment_splits).
  const completeSale = async (method: PaymentMethod, splits?: SplitPaymentAllocations) => {
    let finalBranchId = selectedBranchRef.current;
    if (isAdmin && !finalBranchId && branches.length === 1) finalBranchId = branches[0].id;
    const branchId = isAdmin ? finalBranchId : (user?.branch_id || undefined);
    if (!branchId) { Alert.alert('Select Branch', 'Choose a specific branch before processing.'); return; }

    setProcessing(true);
    try {
      const branchName = isAdmin
        ? branches.find(b => b.id === finalBranchId)?.name
        : user?.branch_name ?? undefined;

      const draft = buildTransactionInput(cart.items, {
        store_id: user?.store_id || 'store_001',
        branch_id: branchId,
        customer_id: selectedCustomer?.id || undefined,
        discount_amount: cart.discount_amount,
        payment_method: method,
        payment_splits: splits,
      });

      const deviceId = (await SecureStore.getItemAsync('device_id')) || 'unknown';
      const isOnline = ApiClient.getOnlineStatus();
      const result = await createTransaction(draft, {
        api: ApiClient,
        store: DatabaseService,
        deviceId,
        isOnline,
      });

      // Snapshot the cart BEFORE clearing so the receipt + alerts stay accurate.
      const soldItems = cart.items;
      NotificationService.notifySaleCompleted(draft.total_amount);
      soldItems.forEach(it => {
        const product = products.find(p => p.id === it.product_id);
        const onHand = Number(product?.inventory?.quantity_on_hand);
        if (tracksInventory(product) && Number.isFinite(onHand)) {
          NotificationService.checkLowStock(it.product_name, onHand - it.quantity);
        }
      });

      if (result.status === 'queued_for_sync' || result.status === 'offline') {
        dispatch(addToSyncQueue({ id: generateId(), transaction_id: result.transaction_id, offline_session_hash: result.offline_session_hash, status: 'pending', created_at: new Date().toISOString() }));
        dispatch(setSyncMode('OFFLINE'));
      }

      dispatch(clearCart());
      setSelectedCustomer(null);
      setDiscountInput('');
      setPayOpen(false);
      setReceipt({
        receipt_number: result.receipt_number || result.transaction_id,
        transaction_id: result.transaction_id,
        items: soldItems.map(i => ({ product_name: i.product_name, quantity: i.quantity, unit_price: Number(i.unit_price) || 0, line_total: (Number(i.unit_price) || 0) * i.quantity })),
        subtotal: draft.subtotal,
        tax_amount: draft.tax_amount,
        discount_amount: draft.discount_amount,
        total: draft.total_amount,
        payment_method: method,
        payment_label: paymentLabel(method),
        payment_splits: splits,
        timestamp: new Date().toLocaleString(),
        branch_name: branchName,
      });
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || error?.message || 'Transaction failed');
    } finally { setProcessing(false); }
  };

  const handlePrintReceipt = async () => {
    if (!receipt) return;
    try {
      // Business name / RC number / address / footer from the store settings
      // (same as the desktop receipt), falling back to legacy device-local text.
      const { headerLines, footer: footerMsg } = await getReceiptBranding(settings, 'Thank you for your purchase!');
      const lines = [
        ...headerLines,
        '===== RECEIPT =====',
        receipt.branch_name ? `Branch:  ${receipt.branch_name}` : '',
        `Receipt: ${receipt.receipt_number}`,
        `Date:    ${receipt.timestamp}`,
        '--------------------------------',
        ...receipt.items.map(i => `${i.product_name}\n  ${i.quantity} x ₦${i.unit_price.toLocaleString()} = ₦${i.line_total.toLocaleString()}`),
        '--------------------------------',
        `Subtotal:  ₦${receipt.subtotal.toLocaleString()}`,
        `VAT:       ₦${receipt.tax_amount.toLocaleString()}`,
        receipt.discount_amount > 0 ? `Discount:  -₦${receipt.discount_amount.toLocaleString()}` : '',
        `TOTAL:     ₦${receipt.total.toLocaleString()}`,
        `Payment:   ${receipt.payment_label.toUpperCase()}`,
        ...(receipt.payment_splits
          ? [
              `  Cash:     ₦${Number(receipt.payment_splits.cash || 0).toLocaleString()}`,
              `  Card:     ₦${Number(receipt.payment_splits.card || 0).toLocaleString()}`,
              `  Transfer: ₦${Number(receipt.payment_splits.transfer || 0).toLocaleString()}`,
            ]
          : []),
        '================================',
        footerMsg ? footerMsg : '',
      ].filter(Boolean).join('\n');
      await Share.share({ message: lines, title: `Receipt ${receipt.receipt_number}` });
    } catch (e) {
      console.error(e);
    }
  };

  const searchFiltered = products.filter(p => !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku?.toLowerCase().includes(searchQuery.toLowerCase()));
  const productCount = searchFiltered.filter(p => tracksInventory(p)).length;
  const serviceCount = searchFiltered.length - productCount;
  const typeCounts: Record<ItemTypeFilter, number> = { ALL: searchFiltered.length, PRODUCT: productCount, SERVICE: serviceCount };
  const filtered   = typeFilter === 'ALL'
    ? searchFiltered
    : searchFiltered.filter(p => typeFilter === 'PRODUCT' ? tracksInventory(p) : !tracksInventory(p));
  const cartCount  = cart.items.reduce((s, i) => s + i.quantity, 0);
  const emptyMessage =
    products.length === 0    ? 'No products — add them in Inventory'
    : searchQuery            ? `No results for "${searchQuery}"`
    : typeFilter === 'SERVICE' ? 'No services yet'
    : typeFilter === 'PRODUCT' ? 'No products yet'
    : 'No items';
  const activeBranch = branches.length === 1
    ? branches[0].name
    : (isAdmin
        ? (selectedBranchId ? branches.find(b => b.id === selectedBranchId)?.name : null)
        : user?.branch_name ?? null
      );

  // Item-type filter bar (All / Products / Services) with live counts —
  // shared by the tablet and phone layouts as the product grid's list header.
  const renderTypeFilter = () => (
    <View style={s.typeFilterRow}>
      {TYPE_FILTERS.map(f => {
        const active = typeFilter === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            onPress={() => setTypeFilter(f.key)}
            activeOpacity={0.75}
            style={[s.typeChip, active && s.typeChipActive]}
          >
            <Text style={[s.typeChipCount, active && s.typeChipCountActive]}>{typeCounts[f.key]}</Text>
            <Text style={[s.typeChipLabel, active && s.typeChipLabelActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // Held (parked) sales list — shared by the tablet and phone layouts.
  const renderHeldModal = () => (
    <Modal visible={heldOpen} transparent animationType="fade" onRequestClose={() => setHeldOpen(false)}>
      <TouchableOpacity style={s.heldOverlay} activeOpacity={1} onPress={() => setHeldOpen(false)}>
        <View style={s.heldSheet}>
          <View style={s.heldHeader}>
            <Text style={s.heldTitle}>Held sales</Text>
            <TouchableOpacity onPress={() => setHeldOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>
          {held.length === 0 ? (
            <Text style={s.heldEmpty}>No held sales</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {held.map(h => (
                <View key={h.id} style={s.heldItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.heldItemLabel} numberOfLines={1}>{h.label}</Text>
                    <Text style={s.heldItemSub}>
                      {h.items.length} item{h.items.length === 1 ? '' : 's'} · {new Date(h.created_at).toLocaleTimeString()}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => resumeHeld(h)} style={s.heldResumeBtn} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="restore" size={14} color={C.accent} />
                    <Text style={s.heldResumeText}>Resume</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteHeldSale(h.id).then(refreshHeld)} style={{ padding: 6 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.muted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

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
            ListHeaderComponent={renderTypeFilter()}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            renderItem={({ item }) => {
              const inCart = cart.items.find(c => c.product_id === item.id);
              const isService = !tracksInventory(item);
              const stock = getAvailableStock(item);
              const outOfStock = isOutOfStock(item);
              const isLow = stock <= 10;
              const tone = getCategoryTone(item.category?.name);
              return (
                <View style={[s.prodCard, inCart ? { borderColor: tone + '55' } : null]}>
                  <View style={[s.prodEdge, { backgroundColor: tone }]} />
                  <View style={s.prodContent}>
                    <View style={s.prodTopRow}>
                      <Text style={[s.prodCatLabel, { color: tone, fontSize: fontSize.xs }]} numberOfLines={1}>
                        {item.category?.name ?? ''}
                      </Text>
                      {isService ? <View style={s.lowBadge}><Text style={[s.lowText, { fontSize: fontSize.xs }]}>SERVICE</Text></View> : isLow && stock > 0 && <View style={s.lowBadge}><Text style={[s.lowText, { fontSize: fontSize.xs }]}>LOW</Text></View>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 50 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.prodName, { fontSize: fontSize.base }]} numberOfLines={2}>{item.name}</Text>
                        {!isService && item.location?.name && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 }}>
                            <MaterialCommunityIcons name="map-marker-outline" size={11} color={C.muted} />
                            <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{item.location.name}</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: 11, color: stock > 0 ? C.muted : '#FB7185', fontWeight: stock > 0 ? 'normal' : '700', marginTop: 4 }}>
                          {isService ? 'Service' : stock > 0 ? `Stock: ${stock}` : 'Out of Stock'}
                        </Text>
                      </View>
                      {item.image_url && (
                        <CachedImage
                          source={`${API_BASE_URL.replace('/v1', '')}${item.image_url}`}
                          style={{ width: 50, height: 50, borderRadius: 8, backgroundColor: C.border }}
                        />
                      )}
                    </View>
                    <View style={s.prodFoot}>
                      <Text style={[s.prodPrice, { fontSize: fontSize.lg }]}>
                        <Text style={{ color: C.muted }}>₦</Text>
                        {(Number(item.effective_price) || 0).toLocaleString()}
                      </Text>
                      {!inCart ? (
                        <TouchableOpacity
                          onPress={() => handleAdd(item)}
                          style={[s.addBtn, outOfStock ? { backgroundColor: C.border } : null]}
                          disabled={outOfStock}
                        >
                          <MaterialCommunityIcons name="plus" size={18} color={outOfStock ? C.muted : C.accentFg} />
                        </TouchableOpacity>
                      ) : (
                        <View style={s.qtyRow}>
                          <TouchableOpacity onPress={() => handleDec(item.id, inCart.quantity)} style={s.qtyBtn}>
                            <MaterialCommunityIcons name="minus" size={14} color={C.accent} />
                          </TouchableOpacity>
                          <Text style={[s.qtyNum, { fontSize: fontSize.sm }]}>{inCart.quantity}</Text>
                          <TouchableOpacity
                            onPress={() => handleInc(item.id, inCart.quantity)}
                            style={[s.qtyBtn, !canIncrementQuantity(item, inCart.quantity) ? { opacity: 0.5 } : null]}
                            disabled={!canIncrementQuantity(item, inCart.quantity)}
                          >
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
                  {emptyMessage}
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
                {cart.items.map((it, i) => {
                  const product = products.find(p => p.id === it.product_id);
                  // A service line stays incrementable even when the catalog isn't loaded
                  // (branch filter / offline) — fall back to the cart item's own item_type.
                  const isService = product ? !tracksInventory(product) : !tracksInventory(it);
                  const cannotInc = !isService && it.quantity >= getAvailableStock(product);
                  return (
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
                          <TouchableOpacity 
                            onPress={() => handleInc(it.product_id, it.quantity)} 
                            style={[s.qtyBtn, { width: 24, height: 24 }, cannotInc ? { opacity: 0.5 } : null]}
                            disabled={cannotInc}
                          >
                            <MaterialCommunityIcons name="plus" size={12} color={C.accent} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Cart actions */}
          {cartCount > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: C.bg }}>
              {/* Branch selector */}
              {isAdmin && branches.length > 1 && (
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
                style={[
                  s.customerBtn,
                  { marginBottom: spacing.md },
                  (!isCustomerEnabled && user?.role === 'cashier') && { opacity: 0.5 }
                ]}
                activeOpacity={(!isCustomerEnabled && user?.role === 'cashier') ? 1 : 0.7}
                disabled={!isCustomerEnabled && user?.role === 'cashier'}
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
                      : (!isCustomerEnabled && user?.role === 'cashier')
                        ? 'Customer selection disabled'
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

              {/* Resume held */}
              {held.length > 0 && (
                <TouchableOpacity onPress={() => setHeldOpen(true)} style={[s.heldTrigger, { marginBottom: spacing.md }]} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="clock-outline" size={15} color={C.accent} />
                  <Text style={s.heldTriggerText}>Resume held ({held.length})</Text>
                </TouchableOpacity>
              )}

              {/* Discount */}
              <View style={[s.discountRow, { marginBottom: spacing.md }]}>
                <MaterialCommunityIcons name="tag-outline" size={16} color={C.muted} />
                <Text style={[s.discountLabel, { fontSize: fontSize.sm }]}>
                  Discount{discountHint ? <Text style={s.discountHint}>  {discountHint}</Text> : null}
                </Text>
                <View style={[s.discountInputWrap, !discountRule.allowed && { opacity: 0.45 }]}>
                  <Text style={s.discountNaira}>₦</Text>
                  <TextInput
                    style={[s.discountInput, { fontSize: fontSize.sm }]}
                    value={discountInput}
                    onChangeText={applyDiscount}
                    editable={discountRule.allowed}
                    placeholder={discountRule.allowed ? '0' : '—'}
                    placeholderTextColor={C.muted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Cart summary */}
              <View style={{ backgroundColor: C.violetBg, padding: spacing.md, borderRadius: R.sm, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm }]}>Subtotal</Text>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm, fontWeight: '600' }]}>₦{cart.subtotal.toLocaleString()}</Text>
                </View>
                {cart.discount_amount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                    <Text style={[s.cartVat, { fontSize: fontSize.sm }]}>Discount</Text>
                    <Text style={[s.cartVat, { fontSize: fontSize.sm, fontWeight: '600', color: C.green }]}>− ₦{cart.discount_amount.toLocaleString()}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm }]}>VAT</Text>
                  <Text style={[s.cartVat, { fontSize: fontSize.sm, fontWeight: '600' }]}>₦{cart.tax_amount.toLocaleString()}</Text>
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm }}>
                  <Text style={[s.cartItemCount, { fontSize: fontSize.base }]}>Total</Text>
                  <Text style={[s.cartTotalBig, { fontSize: fontSize.xxl }]}>₦{(cart.total || 0).toLocaleString()}</Text>
                </View>
              </View>

              {/* Hold + Charge */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TouchableOpacity
                  onPress={handleHold}
                  disabled={cartCount === 0}
                  activeOpacity={0.85}
                  style={[s.holdBtn, cartCount === 0 && { opacity: 0.4 }]}
                >
                  <MaterialCommunityIcons name="pause" size={16} color={C.ink} />
                  <Text style={[s.holdLabel, { fontSize: fontSize.sm }]}>Hold</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={openPayment}
                  disabled={processing || cartCount === 0 || (isAdmin && !selectedBranchId)}
                  activeOpacity={0.85}
                  style={[s.chargeBtn, { flex: 1 }, (cartCount === 0 || (isAdmin && !selectedBranchId)) && s.chargeBtnDisabled]}
                >
                  <MaterialCommunityIcons name="credit-card-outline" size={16} color={cartCount > 0 ? C.accentFg : C.muted} />
                  <Text style={[s.chargeLabel, { fontSize: fontSize.sm }, cartCount === 0 && { color: C.muted }]}>
                    {processing ? 'Processing…' : `Charge ₦${(cart.total || 0).toLocaleString()}`}
                  </Text>
                </TouchableOpacity>
              </View>
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
                  <Text style={s.rcptMeta}>{receipt?.payment_label?.toUpperCase()}</Text>
                </View>
                {receipt?.payment_splits && (
                  <View style={{ marginTop: 4 }}>
                    {([['Cash', receipt.payment_splits.cash], ['Card', receipt.payment_splits.card], ['Transfer', receipt.payment_splits.transfer]] as [string, number][])
                      .filter(([, v]) => Number(v) > 0)
                      .map(([label, v]) => (
                        <View key={label} style={s.rcptTotalRow}>
                          <Text style={s.rcptMeta}>  {label}</Text>
                          <Text style={s.rcptMeta}>₦{Number(v || 0).toLocaleString()}</Text>
                        </View>
                      ))}
                  </View>
                )}
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

        <PaymentModal
          visible={payOpen}
          onClose={() => setPayOpen(false)}
          total={cart.total || 0}
          processing={processing}
          onConfirm={completeSale}
        />

        {renderHeldModal()}
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
            {isAdmin && branches.length > 1 ? (
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
        ListHeaderComponent={renderTypeFilter()}
        renderItem={({ item }) => {
          const inCart = cart.items.find(c => c.product_id === item.id);
          const isService = !tracksInventory(item);
          const stock = getAvailableStock(item);
          const outOfStock = isOutOfStock(item);
          const isLow  = stock <= 10;
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
                  {isService ? <View style={s.lowBadge}><Text style={s.lowText}>SERVICE</Text></View> : isLow && stock > 0 && <View style={s.lowBadge}><Text style={s.lowText}>LOW</Text></View>}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 50 }}>
                  <View style={{ flex: 1 }}>
                    {/* Product name */}
                    <Text style={s.prodName} numberOfLines={2}>{item.name}</Text>
                    {!isService && item.location?.name && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 }}>
                        <MaterialCommunityIcons name="map-marker-outline" size={11} color={C.muted} />
                        <Text style={{ fontSize: 11, color: C.muted }} numberOfLines={1}>{item.location.name}</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 11, color: stock > 0 ? C.muted : '#FB7185', fontWeight: stock > 0 ? 'normal' : '700', marginTop: 4 }}>
                      {isService ? 'Service' : stock > 0 ? `Stock: ${stock}` : 'Out of Stock'}
                    </Text>
                  </View>
                  {item.image_url && (
                    <CachedImage
                      source={`${API_BASE_URL.replace('/v1', '')}${item.image_url}`}
                      style={{ width: 50, height: 50, borderRadius: 8, backgroundColor: C.border }}
                    />
                  )}
                </View>
                {/* Price + qty controls */}
                <View style={s.prodFoot}>
                  <Text style={s.prodPrice}>
                    <Text style={{ color: C.muted }}>₦</Text>
                    {(Number(item.effective_price) || 0).toLocaleString()}
                  </Text>
                  {!inCart ? (
                    <TouchableOpacity
                      onPress={() => handleAdd(item)}
                      style={[s.addBtn, outOfStock ? { backgroundColor: C.border } : null]}
                      disabled={outOfStock}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color={outOfStock ? C.muted : C.accentFg} />
                    </TouchableOpacity>
                  ) : (
                    <View style={s.qtyRow}>
                      <TouchableOpacity onPress={() => handleDec(item.id, inCart.quantity)} style={s.qtyBtn}>
                        <MaterialCommunityIcons name="minus" size={14} color={C.accent} />
                      </TouchableOpacity>
                      <Text style={s.qtyNum}>{inCart.quantity}</Text>
                      <TouchableOpacity
                        onPress={() => handleInc(item.id, inCart.quantity)}
                        style={[s.qtyBtn, !canIncrementQuantity(item, inCart.quantity) ? { opacity: 0.5 } : null]}
                        disabled={!canIncrementQuantity(item, inCart.quantity)}
                      >
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
              {emptyMessage}
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
            {cart.items.map(it => {
              const product = products.find(p => p.id === it.product_id);
              // A service line stays incrementable even when the catalog isn't loaded
              // (branch filter / offline) — fall back to the cart item's own item_type.
              const isService = product ? !tracksInventory(product) : !tracksInventory(it);
              const cannotInc = !isService && it.quantity >= getAvailableStock(product);
              return (
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
                      style={[s.qtyBtn, cannotInc ? { opacity: 0.5 } : null]}
                      disabled={cannotInc}
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
            );
            })}
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
            style={[
              s.customerBtn,
              (!isCustomerEnabled && user?.role === 'cashier') && { opacity: 0.5 }
            ]}
            activeOpacity={(!isCustomerEnabled && user?.role === 'cashier') ? 1 : 0.7}
            disabled={!isCustomerEnabled && user?.role === 'cashier'}
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
                  : (!isCustomerEnabled && user?.role === 'cashier')
                    ? 'Customer selection disabled'
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

        {/* Discount + Resume held */}
        {cartCount > 0 && (
          <View style={s.discountRow}>
            <MaterialCommunityIcons name="tag-outline" size={16} color={C.muted} />
            <Text style={s.discountLabel}>
              Discount{discountHint ? <Text style={s.discountHint}>  {discountHint}</Text> : null}
            </Text>
            <View style={[s.discountInputWrap, !discountRule.allowed && { opacity: 0.45 }]}>
              <Text style={s.discountNaira}>₦</Text>
              <TextInput
                style={s.discountInput}
                value={discountInput}
                onChangeText={applyDiscount}
                editable={discountRule.allowed}
                placeholder={discountRule.allowed ? '0' : '—'}
                placeholderTextColor={C.muted}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        )}
        {held.length > 0 && (
          <TouchableOpacity onPress={() => setHeldOpen(true)} style={s.heldTrigger} activeOpacity={0.8}>
            <MaterialCommunityIcons name="clock-outline" size={15} color={C.accent} />
            <Text style={s.heldTriggerText}>Resume held ({held.length})</Text>
          </TouchableOpacity>
        )}

        {sync.mode === 'OFFLINE' && (
          <Text style={s.offlineNote}>⚠  Offline — will sync when connected</Text>
        )}

        {/* Hold + Charge */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            onPress={handleHold}
            disabled={cartCount === 0}
            activeOpacity={0.85}
            style={[s.holdBtn, cartCount === 0 && { opacity: 0.4 }]}
          >
            <MaterialCommunityIcons name="pause" size={18} color={C.ink} />
            <Text style={s.holdLabel}>Hold</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openPayment}
            disabled={processing || cartCount === 0}
            activeOpacity={0.85}
            style={[s.chargeBtn, { flex: 1 }, cartCount === 0 && s.chargeBtnDisabled]}
          >
            <MaterialCommunityIcons name="credit-card-outline" size={18} color={cartCount > 0 ? C.accentFg : C.muted} />
            <Text style={[s.chargeLabel, cartCount === 0 && { color: C.muted }]}>
              {processing ? 'Processing…' : `Charge ₦${cart.total.toLocaleString()}`}
            </Text>
          </TouchableOpacity>
        </View>
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
                <Text style={s.rcptMeta}>{receipt?.payment_label?.toUpperCase()}</Text>
              </View>
              {receipt?.payment_splits && (
                <View style={{ marginTop: 4 }}>
                  {([['Cash', receipt.payment_splits.cash], ['Card', receipt.payment_splits.card], ['Transfer', receipt.payment_splits.transfer]] as [string, number][])
                    .filter(([, v]) => Number(v) > 0)
                    .map(([label, v]) => (
                      <View key={label} style={s.rcptTotalRow}>
                        <Text style={s.rcptMeta}>  {label}</Text>
                        <Text style={s.rcptMeta}>₦{Number(v || 0).toLocaleString()}</Text>
                      </View>
                    ))}
                </View>
              )}
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

      <PaymentModal
        visible={payOpen}
        onClose={() => setPayOpen(false)}
        total={cart.total || 0}
        processing={processing}
        onConfirm={completeSale}
      />

      {renderHeldModal()}
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

  // Item-type filter bar (All / Products / Services)
  typeFilterRow: {
    flexDirection: 'row', gap: 8,
    paddingVertical: 10, marginBottom: 2,
  },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  typeChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  typeChipCount: { fontSize: 13, fontWeight: '800', color: C.accent },
  typeChipCountActive: { color: C.accentFg },
  typeChipLabel: { fontSize: 13, fontWeight: '600', color: C.ink },
  typeChipLabelActive: { color: C.accentFg },

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

  // Discount control
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  discountLabel: { fontSize: 13, fontWeight: '600', color: C.ink, flex: 1 },
  discountHint: { fontSize: 11, fontWeight: '500', color: C.muted },
  discountInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 12, height: 40, minWidth: 120,
    backgroundColor: C.card, borderRadius: R.sm, borderWidth: 1, borderColor: C.border,
  },
  discountNaira: { fontSize: 14, color: C.muted },
  discountInput: { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink, textAlign: 'right', paddingVertical: 0 },

  // Hold button
  holdBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 15, paddingHorizontal: 18, borderRadius: R.md,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  holdLabel: { fontSize: 14, fontWeight: '700', color: C.ink },

  // Resume-held trigger
  heldTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginBottom: 8 },
  heldTriggerText: { fontSize: 13, fontWeight: '600', color: C.accent },

  // Held sales modal
  heldOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: S.xl },
  heldSheet: { backgroundColor: C.bg, borderRadius: R.lg, padding: S.lg, maxHeight: '70%' },
  heldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.md },
  heldTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  heldEmpty: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 24 },
  heldItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  heldItemLabel: { fontSize: 14, fontWeight: '600', color: C.ink },
  heldItemSub: { fontSize: 11, color: C.muted, marginTop: 2 },
  heldResumeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.sm, borderWidth: 1, borderColor: C.accent },
  heldResumeText: { fontSize: 12, fontWeight: '700', color: C.accent },
});
