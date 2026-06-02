import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert, ScrollView, Modal,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  TextInput as RNTextInput, useWindowDimensions,
} from 'react-native';
import {
  Button, TextInput, Portal, Dialog, Divider,
  ActivityIndicator, IconButton, Surface, HelperText,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { setLowStockAlerts } from '../redux/slices/inventorySlice';
import ApiClient from '../services/ApiClient';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { C, R, S, naira } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize, responsiveGridColumns, responsiveMinTouchTarget } from '../utils/responsiveDesign';

// ─── Types ────────────────────────────────────────────────────
type TabKey = 'products' | 'categories' | 'low-stock';

interface Branch { id: string; name: string; is_active: boolean; }
interface Category { id: string; name: string; description?: string; branch_id?: string; }
interface Product {
  id: string; name: string; sku: string; barcode?: string | null;
  marked_price: number; effective_price: number; cost_price?: number;
  tax_rate: number; category_id?: string; category?: Category;
  description?: string; branch_id?: string; unit?: string;
  inventory?: { quantity_on_hand: number; low_stock_threshold: number };
}

const UNIT_OPTIONS = ['piece', 'kg', 'g', 'liter', 'ml', 'pack', 'carton', 'bottle'] as const;

// ─── Category tone colour (shared with CheckoutScreen) ────────
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

// ─── Stock sparkbars (placeholder 7-day trend) ───────────────
const STOCK_BARS = [42, 38, 50, 46, 58, 52, 64];

function SparkBars({ data, color, height = 36 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: (v / max) * height,
            backgroundColor: color,
            borderRadius: 3,
            opacity: 0.35 + (v / max) * 0.65,
          }}
        />
      ))}
    </View>
  );
}

const EMPTY_PRODUCT = {
  name: '', sku: '', barcode: '', marked_price: '', effective_price: '',
  cost_price: '', tax_rate: '7.5', category_id: '',
  quantity: '', description: '', low_stock_threshold: '10',
  branch_id: '', unit: 'piece',
};
const EMPTY_CATEGORY = { name: '', description: '', branch_id: '' };

// AsyncStorage key for an in-progress "New Product" draft.
const PRODUCT_DRAFT_KEY = '@pos_product_draft';

// ─── Category Dropdown ────────────────────────────────────────
function CategoryDropdown({
  categories, value, onChange, onAddNew,
}: {
  categories: Category[]; value: string;
  onChange: (id: string) => void; onAddNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find(c => c.id === value);

  return (
    <>
      <TouchableOpacity style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={[styles.dropdownText, !selected && styles.dropdownPlaceholder]}>
          {selected ? selected.name : 'Select category *'}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={C.muted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>Select Category</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.dropdownItem, value === cat.id && styles.dropdownItemSelected]}
                  onPress={() => { onChange(cat.id); setOpen(false); }}
                >
                  <Text style={{ color: value === cat.id ? C.accent : C.ink, fontWeight: value === cat.id ? '700' : '400' }}>
                    {cat.name}
                  </Text>
                  {value === cat.id && <MaterialCommunityIcons name="check" size={18} color={C.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Divider />
            <TouchableOpacity style={styles.dropdownItem} onPress={() => { setOpen(false); onAddNew(); }}>
              <MaterialCommunityIcons name="plus" size={18} color={C.accent} />
              <Text style={{ color: C.accent, marginLeft: 6, fontWeight: '600' }}>Create new category</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const inventory = useSelector((state: RootState) => state.inventory);
  const user = useSelector((state: RootState) => state.auth.user);
  const isAdmin = user?.role === 'admin';
  const canManage = ['admin', 'manager'].includes(user?.role ?? '');
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);
  const gridColumns = responsiveGridColumns(deviceType);
  const minTouchTarget = responsiveMinTouchTarget(deviceType);

  const [activeTab, setActiveTab] = useState<TabKey>('products');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const selectedBranchRef = useRef<string | null>(null);

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<RNTextInput>(null);

  const toggleSearch = () => {
    if (showSearch) {
      setShowSearch(false);
      setSearchQuery('');
    } else {
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  };

  // Modals
  const [showProductForm, setShowProductForm] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showStockAdjust, setShowStockAdjust] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockDelta, setStockDelta] = useState('');
  const [stockReason, setStockReason] = useState('restock');
  const [stockThreshold, setStockThreshold] = useState('');

  // Forms
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [saving, setSaving] = useState(false);

  // ── Load on screen focus ──────────────────────────────────
  useFocusEffect(useCallback(() => {
    const init = async () => {
      setLoading(true);
      if (isAdmin) await loadBranches();
      await Promise.all([
        loadProducts(selectedBranchRef.current),
        loadCategories(selectedBranchRef.current),
        loadLowStock(selectedBranchRef.current),
      ]);
      setLoading(false);
    };
    init();
  }, []));

  // ── Data loaders ──────────────────────────────────────────
  const loadBranches = async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const list: Branch[] = Array.isArray(res) ? res : res?.data ?? [];
      setBranches(list.filter((b: Branch) => b.is_active));
    } catch {}
  };

  const loadProducts = async (branchId?: string | null) => {
    try {
      const branchParam = isAdmin && branchId
        ? `&branch_id=${encodeURIComponent(branchId)}` : '';
      const res: any = await ApiClient.get(`/products?limit=500${branchParam}`);
      setProducts(Array.isArray(res) ? res : res?.data ?? []);
    } catch {}
  };

  const loadCategories = async (branchId?: string | null) => {
    try {
      const branchParam = isAdmin && branchId
        ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      const res: any = await ApiClient.get(`/categories${branchParam}`);
      setCategories(Array.isArray(res) ? res : res?.data ?? []);
    } catch {}
  };

  const loadLowStock = async (branchId?: string | null) => {
    try {
      const branchParam = isAdmin && branchId
        ? `?branch_id=${encodeURIComponent(branchId)}` : '';
      const res: any = await ApiClient.get(`/inventory/low-stock${branchParam}`);
      dispatch(setLowStockAlerts(Array.isArray(res) ? res : res?.data ?? []));
    } catch {}
  };

  const loadAll = async (branchId: string | null = selectedBranchRef.current) => {
    setLoading(true);
    await Promise.all([loadProducts(branchId), loadCategories(branchId), loadLowStock(branchId)]);
    setLoading(false);
  };

  // ── Branch filter ─────────────────────────────────────────
  const handleBranchSelect = (branchId: string | null) => {
    selectedBranchRef.current = branchId;
    setSelectedBranchId(branchId);
    setFilterCategoryId(null);
    loadAll(branchId);
  };

  // ── Helpers ───────────────────────────────────────────────
  const apiError = (error: any, fallback = 'Operation failed') =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message || fallback;

  const getBranchName = (branchId?: string | null): string => {
    if (!branchId) return '';
    return branches.find(b => b.id === branchId)?.name ?? 'Unknown Branch';
  };

  // ─── Category CRUD ────────────────────────────────────────
  const openNewCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ ...EMPTY_CATEGORY, branch_id: selectedBranchRef.current ?? '' });
    setShowCategoryForm(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({
      name: cat.name,
      description: cat.description ?? '',
      branch_id: cat.branch_id ?? '',
    });
    setShowCategoryForm(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    if (!editingCategory && isAdmin && !categoryForm.branch_id) {
      Alert.alert(
        'Branch Required',
        'Select a specific branch using the filter chips above, then try creating a category again.'
      );
      return;
    }
    setSaving(true);
    try {
      if (editingCategory) {
        await ApiClient.patch(`/categories/${editingCategory.id}`, {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || undefined,
        });
        Alert.alert('Updated', `"${categoryForm.name}" updated`);
      } else {
        await ApiClient.post('/categories', {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || undefined,
          ...(categoryForm.branch_id && { branch_id: categoryForm.branch_id }),
        });
        Alert.alert('Created', `"${categoryForm.name}" created`);
      }
      setShowCategoryForm(false);
      loadCategories(selectedBranchRef.current);
    } catch (e: any) {
      Alert.alert('Error', apiError(e));
    } finally { setSaving(false); }
  };

  const handleDeleteCategory = (cat: Category) => {
    Alert.alert(
      'Delete Category',
      `Delete "${cat.name}"? Products in this category will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await (ApiClient as any).delete(`/categories/${cat.id}`);
              if (filterCategoryId === cat.id) setFilterCategoryId(null);
              loadCategories(selectedBranchRef.current);
            } catch (e: any) {
              Alert.alert('Error', apiError(e));
            }
          },
        },
      ]
    );
  };

  const handleViewCategoryProducts = (cat: Category) => {
    setFilterCategoryId(cat.id);
    setActiveTab('products');
  };

  // ─── Product CRUD ─────────────────────────────────────────
  const openNewProduct = async () => {
    setEditingProduct(null);
    const storedThreshold = await AsyncStorage.getItem('@pos_low_stock_threshold');

    // Restore a previously saved draft if one exists, so "Save draft" actually
    // brings the work back. The branch always follows the current selection.
    let draft: Partial<typeof EMPTY_PRODUCT> | null = null;
    try {
      const raw = await AsyncStorage.getItem(PRODUCT_DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch {}

    setProductForm({
      ...EMPTY_PRODUCT,
      low_stock_threshold: storedThreshold ?? '10',
      ...(draft ?? {}),
      branch_id: selectedBranchRef.current ?? draft?.branch_id ?? '',
    });
    setShowProductForm(true);
  };

  // Persist the in-progress product form so the user can resume later. Empty
  // forms are treated as "nothing to save" and just close the modal.
  const persistDraft = async (): Promise<boolean> => {
    const hasContent =
      productForm.name.trim() ||
      productForm.sku.trim() ||
      productForm.marked_price.trim() ||
      productForm.barcode.trim();
    if (!hasContent) return false;
    try {
      await AsyncStorage.setItem(PRODUCT_DRAFT_KEY, JSON.stringify(productForm));
      return true;
    } catch {
      return false;
    }
  };

  const handleSaveDraft = async () => {
    const saved = await persistDraft();
    setShowProductForm(false);
    if (saved) {
      Alert.alert(
        'Draft Saved',
        'Your product draft was saved. Reopen "New Product" to continue where you left off.'
      );
    }
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? '',
      marked_price: String(p.marked_price ?? ''),
      effective_price: p.effective_price !== p.marked_price ? String(p.effective_price) : '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      tax_rate: String(p.tax_rate ?? '0'),
      category_id: p.category_id ?? '',
      quantity: '',
      description: p.description ?? '',
      low_stock_threshold: String(p.inventory?.low_stock_threshold ?? 10),
      branch_id: p.branch_id ?? '',
      unit: p.unit ?? 'piece',
    });
    setShowProductForm(true);
  };

  const handleSaveProduct = async () => {
    const errs: string[] = [];
    if (!productForm.name.trim()) errs.push('Name is required');
    if (!productForm.sku.trim()) errs.push('SKU is required');
    if (!productForm.marked_price || isNaN(+productForm.marked_price)) errs.push('Valid selling price required');
    if (!editingProduct && !productForm.category_id) errs.push('Category is required');
    if (!editingProduct && isAdmin && !productForm.branch_id) {
      errs.push('Branch is required — select a branch from the filter chips above');
    }
    if (errs.length) { Alert.alert('Validation', errs.join('\n')); return; }

    const markedPrice = parseFloat(productForm.marked_price);
    const effectivePrice = productForm.effective_price ? parseFloat(productForm.effective_price) : markedPrice;
    const costPrice = productForm.cost_price ? parseFloat(productForm.cost_price) : undefined;

    setSaving(true);
    try {
      const payload: any = {
        name: productForm.name.trim(),
        sku: productForm.sku.trim(),
        barcode: productForm.barcode.trim() || undefined,
        marked_price: markedPrice,
        effective_price: effectivePrice,
        cost_price: costPrice,
        tax_rate: parseFloat(productForm.tax_rate || '0'),
        category_id: productForm.category_id || undefined,
        description: productForm.description.trim() || undefined,
        unit: productForm.unit || 'piece',
      };

      if (editingProduct) {
        await ApiClient.patch(`/products/${editingProduct.id}`, payload);
        const threshold = parseInt(productForm.low_stock_threshold || '0', 10);
        if (!isNaN(threshold) && threshold > 0) {
          try {
            await ApiClient.patch(`/inventory/${editingProduct.id}`, { low_stock_threshold: threshold });
          } catch {}
        }
        Alert.alert('Updated', `"${productForm.name}" updated`);
      } else {
        payload.initial_quantity = parseInt(productForm.quantity || '0', 10);
        payload.low_stock_threshold = Math.max(1, parseInt(productForm.low_stock_threshold || '10', 10));
        if (productForm.branch_id) payload.branch_id = productForm.branch_id;
        await ApiClient.post('/products', payload);
        // Product saved for real — discard any lingering draft.
        try { await AsyncStorage.removeItem(PRODUCT_DRAFT_KEY); } catch {}
        Alert.alert('Created', `"${productForm.name}" created`);
      }
      setShowProductForm(false);
      loadProducts(selectedBranchRef.current);
    } catch (e: any) {
      Alert.alert('Error', apiError(e));
    } finally { setSaving(false); }
  };

  const handleDeleteProduct = (p: Product) => {
    Alert.alert(
      'Delete Product',
      `Delete "${p.name}"?\n\nThis will hide it from the POS but sales history is preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await (ApiClient as any).delete(`/products/${p.id}`);
              loadProducts(selectedBranchRef.current);
            } catch (e: any) {
              Alert.alert('Error', apiError(e));
            }
          },
        },
      ]
    );
  };

  // ─── Stock adjustment ─────────────────────────────────────
  const openStockAdjust = (product: Product) => {
    setStockProduct(product);
    setStockDelta('');
    setStockReason('restock');
    setStockThreshold(String(product.inventory?.low_stock_threshold ?? 10));
    setShowStockAdjust(true);
  };

  const handleStockAdjust = async () => {
    const hasStockChange  = stockDelta !== '' && !isNaN(+stockDelta);
    const hasThreshChange = stockThreshold !== '' && !isNaN(+stockThreshold) && +stockThreshold >= 1;

    if (!hasStockChange && !hasThreshChange) {
      Alert.alert('Nothing to update', 'Enter a stock adjustment or a new alert threshold.');
      return;
    }
    if (hasStockChange && !stockReason) {
      Alert.alert('Validation', 'Reason is required when adjusting stock');
      return;
    }

    setSaving(true);
    try {
      const body: any = {};
      if (hasStockChange) {
        body.quantity = parseInt(stockDelta, 10);
        body.reason   = stockReason;
      }
      if (hasThreshChange) {
        body.low_stock_threshold = parseInt(stockThreshold, 10);
      }
      await ApiClient.patch(`/inventory/${stockProduct!.id}`, body);
      Alert.alert('Updated', 'Inventory settings saved');
      setShowStockAdjust(false);
      loadAll();
    } catch (e: any) {
      Alert.alert('Error', apiError(e));
    } finally { setSaving(false); }
  };

  const handleQuickRestock = async (productId: string, qty: number, reason = 'restock') => {
    try {
      await ApiClient.patch(`/inventory/${productId}`, { quantity: qty, reason });
      Alert.alert('Updated', 'Stock updated');
      loadAll();
    } catch { Alert.alert('Error', 'Failed to update stock'); }
  };

  // ─── FAB press ────────────────────────────────────────────
  const handleFabPress = () => {
    if (activeTab === 'low-stock') { loadAll(); return; }
    if (isAdmin && !selectedBranchRef.current) {
      Alert.alert(
        'Select a Branch First',
        `Choose a specific branch from the filter bar above, then tap the button again to create a new ${activeTab === 'categories' ? 'category' : 'product'}.`
      );
      return;
    }
    if (activeTab === 'categories') openNewCategory();
    else openNewProduct();
  };

  // ─── Computed ─────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();

  const displayedProducts = (() => {
    let list = filterCategoryId
      ? products.filter(p => p.category_id === filterCategoryId)
      : products;
    if (q) list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.category?.name ?? '').toLowerCase().includes(q),
    );
    return list;
  })();

  const filteredCategories = q
    ? categories.filter(c => c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
    : categories;

  const filteredLowStock = q
    ? inventory.lowStockAlerts.filter((a: any) =>
        (a.product_name ?? a.name ?? '').toLowerCase().includes(q),
      )
    : inventory.lowStockAlerts;

  const filterCategoryName: string | null = filterCategoryId
    ? (categories.find(c => c.id === filterCategoryId)?.name ?? 'Unknown')
    : null;

  // Stock value: always sum ALL loaded products regardless of category filter
  const totalStockValue = products.reduce((sum, p) => {
    return sum + Number(p.inventory?.quantity_on_hand ?? 0) * Number(p.effective_price);
  }, 0);

  const stockValueLabel = isAdmin
    ? selectedBranchId === null
      ? 'ALL BRANCHES · STOCK VALUE'
      : `${branches.find(b => b.id === selectedBranchId)?.name?.toUpperCase() ?? 'BRANCH'} · STOCK VALUE`
    : 'STOCK VALUE';

  const tabData = activeTab === 'products' ? displayedProducts
    : activeTab === 'categories' ? filteredCategories
    : filteredLowStock;

  const tabRender = activeTab === 'products' ? renderProductCard
    : activeTab === 'categories' ? renderCategoryCard
    : renderLowStockCard;

  const tabKey = (item: any) => item.id ?? item.product_id ?? String(Math.random());

  const tabCounts = {
    products: displayedProducts.length,
    categories: categories.length,
    'low-stock': inventory.lowStockAlerts.length,
  };

  // ─── Render helpers ───────────────────────────────────────
  function renderProductCard({ item }: { item: Product }) {
    const qty       = item.inventory ? Number(item.inventory.quantity_on_hand) : null;
    const threshold = Number(item.inventory?.low_stock_threshold ?? 10);
    const isOut   = qty !== null && qty <= 0;
    const isLow   = qty !== null && qty > 0 && qty <= threshold;
    const stockColor = isOut ? C.red : isLow ? C.amber : C.green;
    const stockBg    = isOut ? C.redBg : isLow ? C.amberBg : C.greenBg;
    const avatarBg   = isOut ? C.redBg : isLow ? C.amberBg : C.violetBg;
    const avatarFg   = isOut ? C.red : isLow ? C.amber : C.accent;

    return (
      <View style={styles.rowItem}>
        <View style={[styles.rowAvatar, { backgroundColor: avatarBg }]}>
          <Text style={[styles.rowAvatarLetter, { color: avatarFg }]}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTopLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowPrice}>{naira(Number(item.effective_price))}</Text>
          </View>
          <View style={styles.rowBottomLine}>
            <Text style={styles.rowMeta}>{item.sku}</Text>
            {item.category && <Text style={styles.rowMeta}> · {item.category.name}</Text>}
            {isAdmin && item.branch_id && (
              <Text style={styles.rowMeta}> · {getBranchName(item.branch_id)}</Text>
            )}
            {qty !== null && (
              <View style={[styles.badge, { backgroundColor: stockBg, marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: stockColor }]}>{qty} units</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.rowActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openStockAdjust(item)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
            <MaterialCommunityIcons name="package-variant" size={18} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditProduct(item)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={C.muted} />
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteProduct(item)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.red} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  function renderCategoryCard({ item }: { item: Category }) {
    const productCount = products.filter(p => p.category_id === item.id).length;
    const tone = getCategoryTone(item.name);
    return (
      <View style={styles.catCard}>
        {/* Tone avatar */}
        <View style={[styles.catCardAvatar, { backgroundColor: tone + '20' }]}>
          <Text style={[styles.catCardLetter, { color: tone }]}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.catCardName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.catCardCount}>
          <Text style={styles.catCardCountNum}>{productCount}</Text>
          {' products'}
        </Text>
        {isAdmin && item.branch_id && (
          <Text style={[styles.catCardCount, { marginTop: 2 }]} numberOfLines={1}>
            {getBranchName(item.branch_id)}
          </Text>
        )}
        {/* Action row */}
        <View style={styles.catCardActions}>
          <TouchableOpacity onPress={() => handleViewCategoryProducts(item)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <MaterialCommunityIcons name="package-variant-closed" size={16} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEditCategory(item)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={C.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteCategory(item)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.red} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderLowStockCard({ item }: { item: any }) {
    const qty        = Number(item.current_quantity);
    const threshold  = Number(item.low_stock_threshold ?? 20);
    const isCritical = item.alert_level === 'CRITICAL';
    const alertColor = isCritical ? C.red : C.amber;
    const alertBg    = isCritical ? C.redBg : C.amberBg;
    const barColor   = qty <= 5 ? '#FB7185' : '#F59E0B';
    const barPct     = Math.min(100, (qty / Math.max(threshold, 1)) * 100);

    const fullProduct: Product = products.find(p => p.id === item.product_id) ?? {
      id: item.product_id,
      name: item.product_name,
      sku: item.sku,
      marked_price: 0,
      effective_price: 0,
      tax_rate: 0,
      inventory: {
        quantity_on_hand: item.current_quantity,
        low_stock_threshold: item.low_stock_threshold,
      },
    };

    return (
      <View style={styles.rowItem}>
        {/* Letter avatar */}
        <View style={[styles.rowAvatar, { backgroundColor: alertBg }]}>
          <Text style={[styles.rowAvatarLetter, { color: alertColor }]}>
            {item.product_name?.charAt(0)?.toUpperCase()}
          </Text>
        </View>

        {/* Body: name + SKU + progress bar */}
        <View style={[styles.rowBody, { gap: 2 }]}>
          <View style={styles.rowTopLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.product_name}</Text>
            <View style={[styles.badge, { backgroundColor: alertBg }]}>
              <Text style={[styles.badgeText, { color: alertColor }]}>{item.alert_level}</Text>
            </View>
          </View>
          <Text style={styles.rowMeta}>
            {item.category_name ?? item.category ?? item.sku}
          </Text>
          {/* Stock progress bar */}
          <View style={styles.stockBarTrack}>
            <View style={[styles.stockBarFill, { width: `${barPct}%` as any, backgroundColor: barColor }]} />
          </View>
        </View>

        {/* Right side: big qty + action buttons */}
        <View style={styles.lowStockRight}>
          <Text style={[styles.stockQtyNum, { color: alertColor }]}>{qty}</Text>
          <Text style={styles.stockQtyLabel}>left</Text>
          <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
            {canManage && (
              <TouchableOpacity
                style={[styles.quickBtn, { backgroundColor: C.greenBg }]}
                onPress={() => openStockAdjust(fullProduct)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <MaterialCommunityIcons name="package-variant" size={13} color={C.green} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: C.greenBg }]}
              onPress={() => handleQuickRestock(item.product_id, 10)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.green }}>+10</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── Product details state for tablet view ─────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Segmented tab control (Products / Categories / Low Stock) — shared between
  // the phone layout and the tablet master-detail layout so both can switch tabs.
  const renderSegmentBar = () => (
    <View style={styles.segmentBar}>
      {(['products', 'categories', 'low-stock'] as TabKey[]).map(tab => {
        const labels: Record<TabKey, string> = {
          products: 'Products',
          categories: 'Categories',
          'low-stock': 'Low Stock',
        };
        const active = activeTab === tab;
        const count = tabCounts[tab];
        return (
          <TouchableOpacity
            key={tab}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {labels[tab]}
            </Text>
            {count > 0 && (
              <View style={[styles.segBadge, active && styles.segBadgeActive]}>
                <Text style={[styles.segBadgeText, active && styles.segBadgeTextActive]}>
                  {count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ─── Render ───────────────────────────────────────────────
  // Tablet master-detail layout
  if (isTablet && activeTab === 'products') {
    return (
      <View style={[styles.container, { paddingTop: insets.top, flexDirection: 'row' }]}>
        {/* ── Left panel: Product list ────────────────────────── */}
        <View style={{ flex: 0.45, borderRightWidth: 1, borderRightColor: C.border }}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { fontSize: isTablet ? 20 : 18 }]}>Catalog</Text>
            </View>
            <TouchableOpacity
              style={[styles.headerBtn, showSearch && { backgroundColor: C.violetBg, borderColor: C.accent }]}
              onPress={toggleSearch}
            >
              <MaterialCommunityIcons
                name={showSearch ? 'close' : 'magnify'}
                size={20}
                color={showSearch ? C.accent : C.ink}
              />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          {showSearch && (
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
              <RNTextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search products…"
                placeholderTextColor={C.muted}
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={17} color={C.muted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Segmented tabs — lets the tablet switch between Products,
              Categories and Low Stock (was previously phone-only). */}
          {renderSegmentBar()}

          {/* Branch filter */}
          {isAdmin && branches.length > 0 && (
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              style={styles.branchBar} contentContainerStyle={styles.branchBarContent}
            >
              <TouchableOpacity
                style={[styles.branchChip, selectedBranchId === null && styles.branchChipActive]}
                onPress={() => handleBranchSelect(null)}
              >
                <Text style={[styles.branchChipText, selectedBranchId === null && styles.branchChipTextActive]}>
                  All
                </Text>
              </TouchableOpacity>
              {branches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.branchChip, selectedBranchId === b.id && styles.branchChipActive]}
                  onPress={() => handleBranchSelect(b.id)}
                >
                  <Text style={[styles.branchChipText, selectedBranchId === b.id && styles.branchChipTextActive]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Category filter banner */}
          {filterCategoryId && (
            <View style={styles.filterBanner}>
              <MaterialCommunityIcons name="filter" size={14} color={C.accent} />
              <Text style={styles.filterText}>Filtered: {filterCategoryName}</Text>
              <TouchableOpacity onPress={() => setFilterCategoryId(null)}>
                <MaterialCommunityIcons name="close-circle" size={16} color={C.accent} />
              </TouchableOpacity>
            </View>
          )}

          {/* Product list */}
          {loading && displayedProducts.length === 0 ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size={24} color={C.accent} />
            </View>
          ) : (
            <FlatList
              data={displayedProducts}
              renderItem={({ item: p }) => (
                <TouchableOpacity
                  style={[styles.rowItem, selectedProduct?.id === p.id && { backgroundColor: C.violetBg }]}
                  onPress={() => setSelectedProduct(p)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.rowAvatar, { width: 36, height: 36 }]}>
                    <Text style={styles.rowAvatarLetter}>
                      {p.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={[styles.rowBody, { flex: 1 }]}>
                    <Text style={[styles.rowTitle, { fontSize: 13 }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.rowMeta, { fontSize: 11 }]} numberOfLines={1}>{p.sku}</Text>
                  </View>
                  <Text style={[styles.rowPrice, { fontSize: 12 }]}>{naira(Number(p.effective_price))}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={p => p.id}
              contentContainerStyle={{ paddingHorizontal: spacing.sm }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>

        {/* ── Right panel: Product detail ──────────────────────── */}
        <View style={{ flex: 0.55, backgroundColor: C.bg, paddingHorizontal: spacing.md }}>
          {selectedProduct ? (
            <ScrollView showsVerticalScrollIndicator={false} style={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
              {/* Product header */}
              <View style={{ marginBottom: spacing.lg }}>
                <Text style={{ fontSize: fontSize.sm, color: C.muted, fontWeight: '600', marginBottom: 4 }}>
                  PRODUCT
                </Text>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 8 }}>
                  {selectedProduct.name}
                </Text>
                <Text style={{ fontSize: fontSize.base, color: C.muted }}>
                  {selectedProduct.sku}
                </Text>
              </View>

              {/* Price card */}
              <View style={{ backgroundColor: C.card, borderRadius: R.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: C.border }}>
                <View style={{ marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xs, color: C.muted, fontWeight: '600', marginBottom: 2 }}>
                    MARKED PRICE
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>
                    {naira(Number(selectedProduct.marked_price))}
                  </Text>
                </View>
                {selectedProduct.effective_price !== selectedProduct.marked_price && (
                  <>
                    <View style={{ height: 1, backgroundColor: C.border, marginVertical: spacing.sm }} />
                    <View>
                      <Text style={{ fontSize: fontSize.xs, color: C.muted, fontWeight: '600', marginBottom: 2 }}>
                        EFFECTIVE PRICE
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: C.accent }}>
                        {naira(Number(selectedProduct.effective_price))}
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* Stock card */}
              {selectedProduct.inventory && (
                <View style={{ backgroundColor: C.greenBg, borderRadius: R.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: C.green + '30' }}>
                  <Text style={{ fontSize: fontSize.xs, color: C.green, fontWeight: '600', marginBottom: 4 }}>
                    STOCK ON HAND
                  </Text>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: C.green, marginBottom: 8 }}>
                    {selectedProduct.inventory.quantity_on_hand} {selectedProduct.unit ?? 'units'}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: C.muted }}>
                    Low stock threshold: {selectedProduct.inventory.low_stock_threshold}
                  </Text>
                </View>
              )}

              {/* Details grid */}
              <View style={{ marginBottom: spacing.lg }}>
                {selectedProduct.category && (
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={{ fontSize: fontSize.xs, color: C.muted, fontWeight: '600', marginBottom: 4 }}>
                      CATEGORY
                    </Text>
                    <Text style={{ fontSize: fontSize.base, color: C.ink, fontWeight: '500' }}>
                      {selectedProduct.category.name}
                    </Text>
                  </View>
                )}
                {selectedProduct.cost_price != null && (
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={{ fontSize: fontSize.xs, color: C.muted, fontWeight: '600', marginBottom: 4 }}>
                      COST PRICE
                    </Text>
                    <Text style={{ fontSize: fontSize.base, color: C.ink, fontWeight: '500' }}>
                      {naira(Number(selectedProduct.cost_price))}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={{ fontSize: fontSize.xs, color: C.muted, fontWeight: '600', marginBottom: 4 }}>
                    TAX RATE
                  </Text>
                  <Text style={{ fontSize: fontSize.base, color: C.ink, fontWeight: '500' }}>
                    {selectedProduct.tax_rate}%
                  </Text>
                </View>
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: C.accent, borderRadius: R.md, paddingVertical: spacing.md, alignItems: 'center' }}
                  onPress={() => {
                    openStockAdjust(selectedProduct);
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="package-variant" size={18} color="#fff" style={{ marginBottom: 4 }} />
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Adjust Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: C.card, borderRadius: R.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: C.border }}
                  onPress={() => openEditProduct(selectedProduct)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={18} color={C.ink} style={{ marginBottom: 4 }} />
                  <Text style={{ color: C.ink, fontWeight: '600', fontSize: 13 }}>Edit</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.loadingCenter}>
              <MaterialCommunityIcons name="package-variant-outline" size={48} color={C.border} />
              <Text style={{ color: C.muted, marginTop: spacing.md, fontSize: fontSize.base }}>
                Select a product to view details
              </Text>
            </View>
          )}
        </View>

        {/* ── Modals (stock adjust, product form, etc.) ────────── */}
        {/* Product form modal */}
        <Modal visible={showProductForm} transparent animationType="slide" onRequestClose={() => setShowProductForm(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            {/* Product form content goes here - reuse existing modal content */}
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // ─── Phone layout ───────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Inventory</Text>
          <Text style={styles.headerTitle}>Catalog</Text>
        </View>
        <View style={styles.headerRight}>
          {loading && <ActivityIndicator size={20} color={C.accent} style={{ marginRight: 4 }} />}
          <TouchableOpacity
            style={[styles.headerBtn, showSearch && { backgroundColor: C.violetBg, borderColor: C.accent }]}
            onPress={toggleSearch}
          >
            <MaterialCommunityIcons
              name={showSearch ? 'close' : 'magnify'}
              size={20}
              color={showSearch ? C.accent : C.ink}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
          <RNTextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${activeTab === 'low-stock' ? 'low stock items' : activeTab}…`}
            placeholderTextColor={C.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close-circle" size={17} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Segmented tab control — comes first */}
      <View style={styles.segmentBar}>
        {(['products', 'categories', 'low-stock'] as TabKey[]).map(tab => {
          const labels: Record<TabKey, string> = {
            products: 'Products',
            categories: 'Categories',
            'low-stock': 'Low Stock',
          };
          const active = activeTab === tab;
          const count  = tabCounts[tab];
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {labels[tab]}
              </Text>
              {count > 0 && (
                <View style={[styles.segBadge, active && styles.segBadgeActive]}>
                  <Text style={[styles.segBadgeText, active && styles.segBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Branch filter chips — admin only */}
      {isAdmin && branches.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.branchBar} contentContainerStyle={styles.branchBarContent}
        >
          <TouchableOpacity
            style={[styles.branchChip, selectedBranchId === null && styles.branchChipActive]}
            onPress={() => handleBranchSelect(null)}
          >
            <MaterialCommunityIcons
              name="domain" size={13}
              color={selectedBranchId === null ? C.accentFg : C.accent}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.branchChipText, selectedBranchId === null && styles.branchChipTextActive]}>
              All Branches
            </Text>
          </TouchableOpacity>
          {branches.map(b => (
            <TouchableOpacity
              key={b.id}
              style={[styles.branchChip, selectedBranchId === b.id && styles.branchChipActive]}
              onPress={() => handleBranchSelect(b.id)}
            >
              <MaterialCommunityIcons
                name="source-branch" size={13}
                color={selectedBranchId === b.id ? C.accentFg : C.accent}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.branchChipText, selectedBranchId === b.id && styles.branchChipTextActive]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Stock value card */}
      <View style={styles.stockValueCard}>
        <View>
          <Text style={styles.stockValueEyebrow}>{stockValueLabel}</Text>
          <Text style={styles.stockValueNum}>
            <Text style={{ color: C.muted, opacity: 0.55 }}>₦</Text>
            {Math.round(totalStockValue).toLocaleString()}
          </Text>
        </View>
        <SparkBars data={STOCK_BARS} color={C.accent} height={36} />
      </View>

      {/* Category filter banner */}
      {activeTab === 'products' && filterCategoryId && (
        <View style={styles.filterBanner}>
          <MaterialCommunityIcons name="filter" size={14} color={C.accent} />
          <Text style={styles.filterText}>Filtered: {filterCategoryName}</Text>
          <TouchableOpacity onPress={() => setFilterCategoryId(null)}>
            <MaterialCommunityIcons name="close-circle" size={16} color={C.accent} />
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {loading && products.length === 0
        ? <View style={styles.loadingCenter}>
            <ActivityIndicator size={32} color={C.accent} />
          </View>
        : <View style={activeTab === 'categories' ? { flex: 1 } : styles.listWrapper}>
            <FlatList
              key={activeTab}
              data={tabData as any[]}
              renderItem={tabRender as any}
              keyExtractor={tabKey}
              numColumns={activeTab === 'categories' ? 2 : 1}
              contentContainerStyle={
                activeTab === 'categories'
                  ? { paddingHorizontal: S.lg, paddingTop: 4, paddingBottom: 120 }
                  : { paddingBottom: 120 }
              }
              columnWrapperStyle={activeTab === 'categories' ? { gap: 10 } : undefined}
              ItemSeparatorComponent={
                activeTab === 'categories'
                  ? () => <View style={{ height: 10 }} />
                  : () => <View style={styles.separator} />
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons
                    name={q ? 'magnify-close' : 'package-variant-closed'}
                    size={48}
                    color={C.border}
                  />
                  <Text style={styles.emptyText}>
                    {q
                      ? `No results for "${searchQuery}"`
                      : activeTab === 'products' && filterCategoryId
                        ? `No products in "${filterCategoryName}"`
                        : 'Nothing here yet'}
                  </Text>
                  {q ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.emptyAction}>
                      <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>
                        Clear search
                      </Text>
                    </TouchableOpacity>
                  ) : activeTab === 'products' && filterCategoryId ? (
                    <TouchableOpacity onPress={() => setFilterCategoryId(null)} style={styles.emptyAction}>
                      <Text style={{ color: C.accent, fontWeight: '600', fontSize: 14 }}>
                        Show all products
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              }
            />
          </View>
      }

      {/* Floating action pill */}
      <View style={[styles.fabWrap, { bottom: insets.bottom + 90 }]}>
        <TouchableOpacity style={styles.fabPill} onPress={handleFabPress} activeOpacity={0.85}>
          <MaterialCommunityIcons
            name={activeTab === 'low-stock' ? 'refresh' : 'plus'}
            size={17} color={C.bg}
          />
          <Text style={styles.fabLabel}>
            {activeTab === 'categories' ? 'New Category'
             : activeTab === 'products'  ? 'New Product'
             : 'Refresh'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Category Dialog ──────────────────────────────── */}
      <Portal>
        <Dialog visible={showCategoryForm} onDismiss={() => setShowCategoryForm(false)}>
          <Dialog.Title>{editingCategory ? 'Edit Category' : 'New Category'}</Dialog.Title>
          <Dialog.Content>
            {isAdmin && !editingCategory && (
              <Surface style={styles.branchBadge} elevation={0}>
                <MaterialCommunityIcons name="source-branch" size={15} color={C.accent} />
                <Text style={styles.branchBadgeText}>
                  {categoryForm.branch_id
                    ? `Branch: ${getBranchName(categoryForm.branch_id)}`
                    : 'No branch selected — use filter chips above'}
                </Text>
              </Surface>
            )}
            {isAdmin && editingCategory && editingCategory.branch_id && (
              <Surface style={styles.branchBadge} elevation={0}>
                <MaterialCommunityIcons name="source-branch" size={15} color={C.accent} />
                <Text style={styles.branchBadgeText}>
                  Branch: {getBranchName(editingCategory.branch_id)}
                </Text>
              </Surface>
            )}
            <TextInput label="Category Name *" value={categoryForm.name}
              onChangeText={v => setCategoryForm(f => ({ ...f, name: v }))}
              mode="outlined" style={styles.input} autoFocus />
            <TextInput label="Description (optional)" value={categoryForm.description}
              onChangeText={v => setCategoryForm(f => ({ ...f, description: v }))}
              mode="outlined" style={styles.input} multiline numberOfLines={2} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCategoryForm(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveCategory} loading={saving} disabled={saving}>
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* ── Stock Adjustment Dialog ──────────────────────── */}
      <Portal>
        <Dialog visible={showStockAdjust} onDismiss={() => setShowStockAdjust(false)}>
          <Dialog.Title>Inventory — {stockProduct?.name}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogSectionLabel}>Stock Adjustment (optional)</Text>
            <Text style={styles.dialogBodySmall}>
              Current qty: {stockProduct?.inventory
                ? Number(stockProduct.inventory.quantity_on_hand) : 'N/A'}
              {'  ·  '}Use negative numbers to reduce (e.g. -5)
            </Text>
            <TextInput
              label="Adjust by (e.g. +20 or -5)"
              value={stockDelta}
              onChangeText={setStockDelta}
              mode="outlined" keyboardType="numbers-and-punctuation"
              style={styles.input} />
            <TextInput
              label="Reason"
              value={stockReason}
              onChangeText={setStockReason}
              mode="outlined" style={styles.input}
              placeholder="restock / damage / correction / sale" />
            <Divider style={{ marginVertical: 12 }} />
            <Text style={styles.dialogSectionLabel}>Low Stock Alert Threshold</Text>
            <Text style={styles.dialogBodySmall}>
              Alert when stock reaches this level for this product only.
            </Text>
            <TextInput
              label="Alert threshold (units)"
              value={stockThreshold}
              onChangeText={v => setStockThreshold(v.replace(/[^0-9]/g, ''))}
              mode="outlined" keyboardType="number-pad"
              style={styles.input}
              left={<TextInput.Icon icon="bell-alert-outline" />}
              right={<TextInput.Affix text="units" />} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowStockAdjust(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleStockAdjust} loading={saving} disabled={saving}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* ── Product Form Modal ───────────────────────────── */}
      <Modal visible={showProductForm} animationType="slide" onRequestClose={() => setShowProductForm(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: C.bg }}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowProductForm(false)}>
              <MaterialCommunityIcons name="close" size={20} color={C.ink} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.modalTitle}>
                {editingProduct ? 'Edit Product' : 'New Product'}
              </Text>
              <Text style={styles.modalSubtitle}>Add to catalog</Text>
            </View>
            {!editingProduct && (
              <TouchableOpacity style={styles.saveDraftBtn} onPress={handleSaveDraft}>
                <Text style={styles.saveDraftText}>Save draft</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} style={{ flex: 1, backgroundColor: C.bg }}>

            {isAdmin && !editingProduct && (
              <Surface style={[styles.branchBadge, { marginBottom: 16 }]} elevation={0}>
                <MaterialCommunityIcons name="source-branch" size={15} color={C.accent} />
                <Text style={styles.branchBadgeText}>
                  {productForm.branch_id
                    ? `Creating for: ${getBranchName(productForm.branch_id)}`
                    : 'No branch selected — close and use filter chips to select a branch'}
                </Text>
              </Surface>
            )}
            {isAdmin && editingProduct && editingProduct.branch_id && (
              <Surface style={[styles.branchBadge, { marginBottom: 16 }]} elevation={0}>
                <MaterialCommunityIcons name="source-branch" size={15} color={C.accent} />
                <Text style={styles.branchBadgeText}>
                  Branch: {getBranchName(editingProduct.branch_id)}
                </Text>
              </Surface>
            )}

            <TextInput label="Product Name *" value={productForm.name}
              onChangeText={v => setProductForm(f => ({ ...f, name: v }))}
              mode="outlined" style={styles.input} />

            <TextInput label="SKU *" value={productForm.sku}
              onChangeText={v => setProductForm(f => ({ ...f, sku: v }))}
              mode="outlined" style={styles.input} autoCapitalize="characters" />

            <TextInput
              label="Barcode"
              value={productForm.barcode}
              onChangeText={v => setProductForm(f => ({ ...f, barcode: v }))}
              mode="outlined"
              style={styles.input}
              autoCapitalize="characters"
              placeholder="Optional — scan or type"
              right={
                <TextInput.Icon
                  icon="barcode-scan"
                  onPress={() => setBarcodeScannerOpen(true)}
                />
              }
            />

            <View style={styles.row}>
              <TextInput label="Selling Price (₦) *" value={productForm.marked_price}
                onChangeText={v => setProductForm(f => ({ ...f, marked_price: v }))}
                mode="outlined" keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                left={<TextInput.Affix text="₦" />} />
              <TextInput label="Cost Price (₦)" value={productForm.cost_price}
                onChangeText={v => setProductForm(f => ({ ...f, cost_price: v }))}
                mode="outlined" keyboardType="decimal-pad"
                style={[styles.input, { flex: 1 }]}
                left={<TextInput.Affix text="₦" />} />
            </View>

            {productForm.marked_price && productForm.cost_price &&
              !isNaN(+productForm.marked_price) && !isNaN(+productForm.cost_price) && (
              <Surface style={styles.profitPreview} elevation={0}>
                <MaterialCommunityIcons name="trending-up" size={16} color={C.green} />
                <Text style={styles.profitText}>
                  Profit: {naira(+productForm.marked_price - +productForm.cost_price)}
                  {'  '}
                  ({((+productForm.marked_price - +productForm.cost_price) / +productForm.marked_price * 100).toFixed(1)}% margin)
                </Text>
              </Surface>
            )}

            <View style={styles.row}>
              <TextInput label="Discounted Price (₦)" value={productForm.effective_price}
                onChangeText={v => setProductForm(f => ({ ...f, effective_price: v }))}
                mode="outlined" keyboardType="decimal-pad"
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                left={<TextInput.Affix text="₦" />} />
              <TextInput label="VAT (%)" value={productForm.tax_rate}
                onChangeText={v => setProductForm(f => ({ ...f, tax_rate: v }))}
                mode="outlined" keyboardType="decimal-pad"
                style={[styles.input, { flex: 1 }]}
                right={<TextInput.Affix text="%" />} />
            </View>

            <Text style={styles.sectionLabel}>Unit</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              {UNIT_OPTIONS.map((u) => {
                const active = (productForm.unit || 'piece') === u;
                return (
                  <TouchableOpacity
                    key={u}
                    onPress={() => setProductForm(f => ({ ...f, unit: u }))}
                    activeOpacity={0.75}
                    style={[
                      styles.unitChip,
                      active && styles.unitChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        active && styles.unitChipTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {!editingProduct && (
              <TextInput
                label={`Initial Stock (${productForm.unit || 'piece'})`}
                value={productForm.quantity}
                onChangeText={v => setProductForm(f => ({ ...f, quantity: v }))}
                mode="outlined" keyboardType="number-pad" style={styles.input}
              />
            )}

            <TextInput
              label="Low Stock Alert Threshold (units)"
              value={productForm.low_stock_threshold}
              onChangeText={v => setProductForm(f => ({ ...f, low_stock_threshold: v.replace(/[^0-9]/g, '') }))}
              mode="outlined" keyboardType="number-pad" style={styles.input}
              left={<TextInput.Icon icon="bell-alert-outline" />}
              right={<TextInput.Affix text="units" />}
            />
            <HelperText type="info" style={{ marginTop: -8, marginBottom: 4 }}>
              {editingProduct
                ? "Overrides this product's alert level independently of the global setting."
                : 'Defaults to the store global setting — you can override it here.'}
            </HelperText>

            <Text style={styles.sectionLabel}>
              Category {!editingProduct && '*'}
            </Text>
            <CategoryDropdown
              categories={categories}
              value={productForm.category_id}
              onChange={id => setProductForm(f => ({ ...f, category_id: id }))}
              onAddNew={async () => {
                // Preserve the in-progress product as a draft so the detour to
                // create a category doesn't throw away what they've typed.
                await persistDraft();
                setShowProductForm(false);
                setTimeout(() => openNewCategory(), 300);
              }}
            />

            <TextInput label="Description (optional)" value={productForm.description}
              onChangeText={v => setProductForm(f => ({ ...f, description: v }))}
              mode="outlined" style={[styles.input, { marginTop: 12 }]}
              multiline numberOfLines={3} />

          </ScrollView>

          {/* Sticky footer */}
          <View style={[styles.modalFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowProductForm(false)}
              activeOpacity={0.75}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveBtn, saving && styles.modalSaveBtnDisabled]}
              onPress={handleSaveProduct}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator size={16} color={C.accentFg} />
                : <MaterialCommunityIcons name="check" size={18} color={C.accentFg} />
              }
              <Text style={styles.modalSaveText}>
                {editingProduct ? 'Save Changes' : 'Create Product'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Scan-to-fill barcode for the product form */}
      <BarcodeScannerModal
        visible={barcodeScannerOpen}
        onClose={() => setBarcodeScannerOpen(false)}
        onScanned={(code) => {
          setBarcodeScannerOpen(false);
          setProductForm(f => ({ ...f, barcode: code }));
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: S.lg,
    paddingBottom: S.md,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBtn: {
    width: 40, height: 40,
    borderRadius: R.sm,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Search bar ───────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: S.lg,
    marginBottom: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    gap: 8,
    borderWidth: 1,
    borderColor: C.accent,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.ink,
    padding: 0,
  },

  // ── Stock value card ─────────────────────────────────────────
  stockValueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    marginHorizontal: S.lg,
    borderRadius: R.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  stockValueEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stockValueNum: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '800',
    fontSize: 24,
    color: C.ink,
    letterSpacing: -0.4,
  },

  // ── Branch chips ─────────────────────────────────────────────
  branchBar: { maxHeight: 44, marginBottom: S.sm },
  branchBarContent: {
    paddingHorizontal: S.lg,
    paddingVertical: S.xs,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: C.card,
  },
  branchChipActive: { backgroundColor: C.accent },
  branchChipText: { fontSize: 12, fontWeight: '600', color: C.accent },
  branchChipTextActive: { color: C.accentFg },

  // ── Segmented tabs ───────────────────────────────────────────
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: S.lg,
    backgroundColor: C.card,
    borderRadius: R.sm,
    padding: 4,
    marginBottom: S.sm,
    borderWidth: 1,
    borderColor: C.border,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: R.xs,
    gap: 4,
  },
  segmentActive: { backgroundColor: C.accent },
  segmentText: { fontSize: 11, fontWeight: '600', color: C.muted },
  segmentTextActive: { color: C.accentFg },
  segBadge: {
    minWidth: 18, height: 18,
    borderRadius: 9,
    backgroundColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  segBadgeText: { fontSize: 9, fontWeight: '800', color: C.muted },
  segBadgeTextActive: { color: C.accentFg },

  // ── Filter banner ────────────────────────────────────────────
  filterBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: S.lg, paddingVertical: 7,
    backgroundColor: C.violetBg,
    marginHorizontal: S.lg,
    borderRadius: R.xs,
    marginBottom: S.sm,
  },
  filterText: { flex: 1, color: C.accent, fontSize: 12, fontWeight: '600' },

  // ── List ─────────────────────────────────────────────────────
  listWrapper: {
    flex: 1,
    backgroundColor: C.card,
    marginHorizontal: S.lg,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  separator: { height: 1, backgroundColor: C.border, marginLeft: 68 },

  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 12,
  },
  rowAvatar: {
    width: 44, height: 44,
    borderRadius: R.sm,
    alignItems: 'center', justifyContent: 'center',
    marginRight: S.md, flexShrink: 0,
  },
  rowAvatarLetter: { fontSize: 18, fontWeight: '700' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTopLine: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 3,
  },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink, marginRight: 8 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: C.accent, flexShrink: 0 },
  rowBottomLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  rowMeta: { fontSize: 11, color: C.muted },
  badge: { borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  rowActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, gap: 2 },
  iconBtn: { width: 32, height: 32, borderRadius: R.xs, alignItems: 'center', justifyContent: 'center' },
  quickBtn: { width: 34, height: 28, borderRadius: R.xs, alignItems: 'center', justifyContent: 'center' },

  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: C.muted, marginTop: 12, fontSize: 15 },
  emptyAction: { marginTop: 12, paddingHorizontal: S.lg, paddingVertical: S.sm },

  // ── Category grid cards ──────────────────────────────────────
  catCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  catCardAvatar: {
    width: 44, height: 44, borderRadius: R.sm,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  catCardLetter: { fontSize: 18, fontWeight: '800' },
  catCardName: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 2 },
  catCardCount: { fontSize: 12, color: C.muted },
  catCardCountNum: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
  },
  catCardActions: {
    flexDirection: 'row', gap: 10, marginTop: 10, justifyContent: 'flex-end',
  },

  // ── Low-stock progress bar + qty ─────────────────────────────
  stockBarTrack: {
    height: 5, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden', marginTop: 6,
  },
  stockBarFill: { height: 5, borderRadius: 999 },
  lowStockRight: { alignItems: 'flex-end', marginLeft: 8 },
  stockQtyNum: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '800', fontSize: 18, textAlign: 'right',
  },
  stockQtyLabel: { fontSize: 9, color: C.muted, textAlign: 'right' },

  // ── Floating action pill ─────────────────────────────────────
  fabWrap: { position: 'absolute', right: S.lg, alignItems: 'flex-end' },
  fabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
    backgroundColor: C.ink,
    paddingHorizontal: S.lg,
    paddingVertical: S.md,
    borderRadius: R.pill,
    ...Platform.select({
      ios: { shadowColor: C.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  fabLabel: { fontSize: 13, fontWeight: '700', color: C.bg, letterSpacing: 0.2 },

  // ── Branch badge inside forms/dialogs ────────────────────────
  branchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.violetBg,
    borderRadius: R.sm,
    paddingHorizontal: S.md, paddingVertical: S.sm,
    marginBottom: S.md,
  },
  branchBadgeText: { fontSize: 13, color: C.accent, fontWeight: '600', flex: 1 },

  // ── Dialog text ──────────────────────────────────────────────
  dialogSectionLabel: {
    fontSize: 11, fontWeight: '700', color: C.accent,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  dialogBodySmall: { fontSize: 12, color: C.muted, marginBottom: 8 },

  // ── Product form modal ───────────────────────────────────────
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.lg, paddingBottom: S.sm,
    backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalCloseBtn: {
    width: 40, height: 40, borderRadius: R.sm,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  modalSubtitle: { fontSize: 11, color: C.muted, marginTop: 1 },
  saveDraftBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: C.border,
  },
  saveDraftText: { fontSize: 12, fontWeight: '700', color: C.muted },
  modalBody: { padding: S.lg, paddingBottom: 16 },
  modalFooter: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: S.lg, paddingTop: 14,
    backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: R.md,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: C.ink },
  modalSaveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: R.md,
    backgroundColor: C.accent,
  },
  modalSaveBtnDisabled: { backgroundColor: C.border },
  modalSaveText: { fontSize: 14, fontWeight: '700', color: C.accentFg },
  input: { marginBottom: 12 },
  row: { flexDirection: 'row' },
  sectionLabel: { marginBottom: 8, color: C.ink, fontSize: 14, fontWeight: '600' },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  unitChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  unitChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  unitChipTextActive: {
    color: '#fff',
  },
  saveButton: { marginTop: 16, paddingVertical: 6 },
  profitPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.greenBg, borderRadius: R.xs,
    padding: 8, marginBottom: 12,
  },
  profitText: { color: C.green, fontSize: 13, fontWeight: '600' },

  // ── CategoryDropdown ─────────────────────────────────────────
  dropdown: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: R.xs,
    paddingHorizontal: S.md, paddingVertical: 14,
    backgroundColor: C.card, marginBottom: 4,
  },
  dropdownText: { fontSize: 16, color: C.ink },
  dropdownPlaceholder: { color: C.muted },
  dropdownOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', padding: 24,
  },
  dropdownSheet: { backgroundColor: C.card, borderRadius: R.md, overflow: 'hidden' },
  dropdownSheetTitle: {
    padding: S.lg,
    borderBottomWidth: 1, borderBottomColor: C.border,
    fontSize: 16, fontWeight: '700', color: C.ink,
  },
  dropdownItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: S.lg,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  dropdownItemSelected: { backgroundColor: C.violetBg },
});
