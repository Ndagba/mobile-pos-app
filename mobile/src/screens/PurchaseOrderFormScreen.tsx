import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Modal,
  TextInput as RNTextInput,
} from 'react-native';
import { ActivityIndicator, Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import PurchaseOrderService, { poApiError } from '../services/PurchaseOrderService';
import { C, naira } from '../theme';
import { POWriteLine, isIsoDate, num } from '../utils/purchaseOrders';
import {
  OfflineBanner, PurchasingHeader, PurchasingLocked, useCanPurchase, useIsOnline,
} from '../components/purchasing/PurchasingBits';

interface Branch { id: string; name: string; is_active: boolean; }
interface SupplierLite { id: string; name: string; tag?: string | null; }
interface ProductLite {
  id: string; name: string; sku?: string | null; barcode?: string | null; unit?: string | null;
  item_type?: string | null; cost_price?: number | string | null; tax_rate?: number | string | null;
}
/** A line under construction — strings for the editable numeric inputs. */
interface DraftLine {
  product_id: string; name: string; sku?: string | null; tax_rate: number; qty: string; unit_cost: string;
}

/**
 * Purchase-order builder (mobile counterpart of desktop `/purchasing/new`). A PO
 * belongs to one branch and one supplier; it is created as a DRAFT and the server
 * computes the authoritative totals from each product's `tax_rate` — the footer
 * figures here are an estimate only. SERVICE items can't be ordered.
 */
export default function PurchaseOrderFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const canPurchase = useCanPurchase();
  const online = useIsOnline();
  const user = useSelector((s: RootState) => s.auth.user);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState<string>(route.params?.supplier_id ?? '');
  const [poNumber, setPoNumber] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [supplierPicker, setSupplierPicker] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Optional prefill from a "Suggested reorders" row: one product + quantity,
  // applied once, as soon as the chosen branch's catalog contains that product.
  const prefill = useRef<{ product_id: string; product_name?: string; quantity: number } | null>(
    route.params?.product_id
      ? { product_id: route.params.product_id, product_name: route.params.product_name, quantity: Number(route.params.quantity) || 1 }
      : null
  );
  const [prefillMissing, setPrefillMissing] = useState(false);

  useEffect(() => {
    if (!canPurchase) return;
    (async () => {
      try {
        const res: any = await ApiClient.get('/branches');
        const active: Branch[] = (Array.isArray(res) ? res : res?.data ?? []).filter((b: Branch) => b.is_active);
        setBranches(active);
        // Default to the user's home branch, else the only branch they can act on.
        const wanted = active.find(b => b.id === route.params?.branch_id);
        const home = active.find(b => b.id === user?.branch_id);
        if (wanted) setBranchId(wanted.id);
        else if (home) setBranchId(home.id);
        else if (active.length === 1) setBranchId(active[0].id);
      } catch {}
    })();
    (async () => {
      try {
        const res: any = await ApiClient.get('/suppliers?limit=200');
        setSuppliers(Array.isArray(res) ? res : res?.data ?? []);
      } catch {}
    })();
  }, [canPurchase]);

  // Products are branch-scoped, so the catalog (and any lines) reset with the branch.
  useEffect(() => {
    setProducts([]);
    setLines([]);
    setProductSearch('');
    if (!branchId) return;
    let cancelled = false;
    setLoadingProducts(true);
    (async () => {
      try {
        const res: any = await ApiClient.get(`/products?limit=500&branch_id=${encodeURIComponent(branchId)}`);
        if (cancelled) return;
        const list: ProductLite[] = Array.isArray(res) ? res : res?.data ?? [];
        setProducts(list);
        const want = prefill.current;
        if (want) {
          const p = list.find(x => x.id === want.product_id && x.item_type !== 'SERVICE');
          if (p) {
            prefill.current = null;
            setPrefillMissing(false);
            setLines([{
              product_id: p.id, name: p.name, sku: p.sku, tax_rate: num(p.tax_rate),
              qty: String(want.quantity), unit_cost: String(num(p.cost_price)),
            }]);
          } else {
            setPrefillMissing(true);
          }
        }
      } catch {} finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [branchId]);

  const addedIds = useMemo(() => new Set(lines.map(l => l.product_id)), [lines]);
  const results = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(p => p.item_type !== 'SERVICE' && !addedIds.has(p.id))
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [products, productSearch, addedIds]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return q ? suppliers.filter(s => s.name.toLowerCase().includes(q)) : suppliers;
  }, [suppliers, supplierSearch]);

  const supplier = suppliers.find(s => s.id === supplierId);

  const addLine = (p: ProductLite) => {
    setLines(prev => [...prev, {
      product_id: p.id, name: p.name, sku: p.sku, tax_rate: num(p.tax_rate),
      qty: '1', unit_cost: String(num(p.cost_price)),
    }]);
    setProductSearch('');
  };
  const setLine = (id: string, patch: Partial<DraftLine>) =>
    setLines(prev => prev.map(l => (l.product_id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.product_id !== id));

  // Preview only — the server recomputes subtotal / tax / total on save.
  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    for (const l of lines) {
      const qty = Number(l.qty), cost = Number(l.unit_cost);
      if (!Number.isFinite(qty) || !Number.isFinite(cost)) continue;
      subtotal += qty * cost;
      tax += qty * cost * (l.tax_rate / 100);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const handleSubmit = async () => {
    setError(null);
    if (!branchId) return setError('Choose a branch for this order.');
    if (!supplierId) return setError('Choose a supplier.');
    if (lines.length === 0) return setError('Add at least one product line.');
    const expected = expectedDate.trim();
    if (expected && !isIsoDate(expected)) return setError('Expected date must look like 2026-12-31.');

    const items: POWriteLine[] = [];
    for (const l of lines) {
      const qty = Number(l.qty), cost = Number(l.unit_cost);
      if (l.qty.trim() === '' || !Number.isFinite(qty) || qty <= 0) return setError(`Enter a quantity for "${l.name}".`);
      if (l.unit_cost.trim() === '' || !Number.isFinite(cost) || cost < 0) return setError(`Enter a valid unit cost for "${l.name}".`);
      items.push({ product_id: l.product_id, quantity_ordered: qty, unit_cost: cost });
    }

    setSaving(true);
    try {
      const po = await PurchaseOrderService.create({
        branch_id: branchId,
        supplier_id: supplierId,
        po_number: poNumber.trim() || null,
        expected_date: expected || null,
        notes: notes.trim() || null,
        items,
      });
      navigation.replace('PurchaseOrderDetail', { id: po.id });
    } catch (e) {
      setError(poApiError(e, 'Could not create the purchase order.'));
    } finally {
      setSaving(false);
    }
  };

  if (!canPurchase) return <PurchasingLocked onBack={() => navigation.goBack()} />;

  return (
    <View style={styles.screen}>
      <PurchasingHeader eyebrow="Purchasing" title="New purchase order" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Branch */}
          <Text style={styles.label}>Branch *</Text>
          {branches.length === 0 ? (
            <Text style={styles.muted}>Loading branches…</Text>
          ) : (
            <View style={styles.chipWrap}>
              {branches.map(b => {
                const active = branchId === b.id;
                return (
                  <TouchableOpacity key={b.id} style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setBranchId(b.id)} disabled={saving}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {lines.length > 0 && branches.length > 1 && (
            <Text style={styles.hint}>Changing the branch clears the lines — products belong to one branch.</Text>
          )}

          {prefillMissing && prefill.current && (
            <Text style={styles.hint}>
              {prefill.current.product_name ?? 'The suggested product'} isn't stocked in this branch — choose the branch that sells it and it will be added.
            </Text>
          )}

          {/* Supplier */}
          <Text style={styles.label}>Supplier *</Text>
          <TouchableOpacity style={styles.picker} onPress={() => setSupplierPicker(true)} disabled={saving} activeOpacity={0.7}>
            <Text style={[styles.pickerText, !supplier && { color: C.muted }]} numberOfLines={1}>
              {supplier?.name ?? 'Select supplier…'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={C.muted} />
          </TouchableOpacity>

          <View style={styles.twoCol}>
            <TextInput label="PO number" value={poNumber} onChangeText={setPoNumber} mode="outlined" dense
              placeholder="Auto if blank" style={[styles.input, { flex: 1 }]} editable={!saving} autoCapitalize="characters" />
            <TextInput label="Expected date" value={expectedDate} onChangeText={setExpectedDate} mode="outlined" dense
              placeholder="YYYY-MM-DD" style={[styles.input, { flex: 1 }]} editable={!saving}
              keyboardType="numbers-and-punctuation" />
          </View>

          {/* Product picker */}
          <Text style={styles.label}>Add products</Text>
          {!branchId ? (
            <Text style={styles.muted}>Choose a branch to search its products.</Text>
          ) : (
            <>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
                <RNTextInput
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder="Search product name, SKU or barcode"
                  placeholderTextColor={C.muted}
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
                {loadingProducts && <ActivityIndicator size={16} color={C.accent} />}
              </View>
              {productSearch.trim().length > 0 && (
                <View style={styles.results}>
                  {results.length === 0 ? (
                    <Text style={[styles.muted, { padding: 12 }]}>
                      {loadingProducts ? 'Loading products…' : 'No matching stock products.'}
                    </Text>
                  ) : results.map(p => (
                    <TouchableOpacity key={p.id} style={styles.resultRow} onPress={() => addLine(p)}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.resultName} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.muted} numberOfLines={1}>
                          {[p.sku, `Cost ${naira(num(p.cost_price))}`].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="plus-circle-outline" size={20} color={C.accent} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Lines */}
          <Text style={styles.label}>Lines ({lines.length})</Text>
          {lines.length === 0 ? (
            <View style={styles.emptyLines}>
              <Text style={styles.muted}>No lines yet — search above to add products.</Text>
            </View>
          ) : lines.map(l => {
            const lineTotal = (Number(l.qty) || 0) * (Number(l.unit_cost) || 0);
            return (
              <View key={l.product_id} style={styles.lineCard}>
                <View style={styles.lineHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.lineName} numberOfLines={2}>{l.name}</Text>
                    <Text style={styles.muted}>
                      {[l.sku, l.tax_rate > 0 ? `VAT ${l.tax_rate}%` : null].filter(Boolean).join(' · ') || ' '}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeLine(l.product_id)} disabled={saving}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Remove ${l.name}`}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={C.red} />
                  </TouchableOpacity>
                </View>
                <View style={styles.twoCol}>
                  <TextInput label="Quantity" value={l.qty} onChangeText={v => setLine(l.product_id, { qty: v })}
                    mode="outlined" dense keyboardType="decimal-pad" style={[styles.input, { flex: 1 }]} editable={!saving} />
                  <TextInput label="Unit cost (₦)" value={l.unit_cost} onChangeText={v => setLine(l.product_id, { unit_cost: v })}
                    mode="outlined" dense keyboardType="decimal-pad" style={[styles.input, { flex: 1 }]} editable={!saving} />
                </View>
                <Text style={styles.lineTotal}>Line total {naira(lineTotal)}</Text>
              </View>
            );
          })}

          <TextInput label="Notes (optional)" value={notes} onChangeText={setNotes} mode="outlined" dense
            multiline style={[styles.input, { marginTop: 12 }]} editable={!saving} />
        </ScrollView>

        {/* Footer: estimate + submit */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.totalsRow}>
            <Text style={styles.muted}>Subtotal {naira(totals.subtotal)} · Tax {naira(totals.tax)}</Text>
            <Text style={styles.totalBig}>{naira(totals.total)}</Text>
          </View>
          <Text style={styles.hint}>Estimate — final totals are calculated by the server when the draft is saved.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button mode="contained" onPress={handleSubmit} loading={saving}
            disabled={saving || !online || lines.length === 0} buttonColor={C.accent} style={{ marginTop: 8 }}>
            Create draft order
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* Supplier picker */}
      {/* RN Modal (not a Paper Portal) so it also shows above a modal-presented screen on tablets. */}
      <Modal visible={supplierPicker} animationType="slide" onRequestClose={() => setSupplierPicker(false)}>
        <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
          <View style={styles.pickerHead}>
            <Text style={styles.pickerTitle}>Select supplier</Text>
            <TouchableOpacity onPress={() => setSupplierPicker(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button" accessibilityLabel="Close">
              <MaterialCommunityIcons name="close" size={24} color={C.ink} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <TextInput value={supplierSearch} onChangeText={setSupplierSearch} mode="outlined" dense
              placeholder="Search suppliers" style={styles.input} />
          </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {filteredSuppliers.length === 0 ? (
                <Text style={[styles.muted, { padding: 20, textAlign: 'center' }]}>
                  No suppliers found. Add one from the Suppliers screen first.
                </Text>
              ) : filteredSuppliers.map(s => {
                const active = s.id === supplierId;
                return (
                  <TouchableOpacity key={s.id} style={[styles.option, active && styles.optionActive]}
                    onPress={() => { setSupplierId(s.id); setSupplierPicker(false); setSupplierSearch(''); }}>
                    <Text style={[styles.optionText, active && { color: C.accent, fontWeight: '700' }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {s.tag === 'Blocked' && <Text style={styles.blocked}>Blocked</Text>}
                    {active && <MaterialCommunityIcons name="check" size={16} color={C.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  label: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  muted: { fontSize: 12, color: C.muted },
  hint: { fontSize: 11, color: C.muted, marginTop: 6 },
  error: { fontSize: 13, color: C.red, marginTop: 8 },
  input: { backgroundColor: C.card },
  twoCol: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: C.card,
  },
  pickerText: { flex: 1, fontSize: 14, color: C.ink },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  results: { marginTop: 6, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  resultName: { fontSize: 14, fontWeight: '600', color: C.ink },
  emptyLines: { padding: 20, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  lineCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 10 },
  lineHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  lineName: { fontSize: 14, fontWeight: '700', color: C.ink },
  lineTotal: { fontSize: 12, fontWeight: '700', color: C.ink, textAlign: 'right', marginTop: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
  totalsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalBig: { fontSize: 20, fontWeight: '800', color: C.ink },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  pickerTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  optionActive: { backgroundColor: C.violetBg },
  optionText: { flex: 1, fontSize: 14, color: C.ink },
  blocked: { fontSize: 11, fontWeight: '700', color: C.red },
});
