import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Alert,
  TouchableOpacity,
  TextInput as RNTextInput,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { ActivityIndicator, Dialog, Portal, Button, TextInput as PaperTextInput } from 'react-native-paper';

import { RootState } from '../redux/store';
import { setLoading, setSuppliers, addSupplier, updateSupplier } from '../redux/slices/suppliersSlice';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';

import SuppliersHero from '../components/suppliers/SuppliersHero';
import SupplierRow, { Supplier } from '../components/suppliers/SupplierRow';
import SupplierSheet from '../components/suppliers/SupplierSheet';
import FilterChipGroup from '../components/customers/FilterChipGroup';

const TONE_COLORS = ['#7C3AED', '#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444'];

function getColorForId(id: string): string {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TONE_COLORS[hash % TONE_COLORS.length];
}

interface EnrichedSupplier extends Supplier {
  tone: string;
  outstanding: number;
}

interface SectionData {
  title: string;
  data: EnrichedSupplier[];
}

export default function SuppliersScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const suppliersState = useSelector((state: RootState) => state.suppliers);
  const user = useSelector((state: RootState) => state.auth.user);

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'preferred' | 'blocked'>('all');
  const [sheetSupplier, setSheetSupplier] = useState<EnrichedSupplier | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [outstandingMap, setOutstandingMap] = useState<Record<string, number>>({});

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<EnrichedSupplier | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    category: '',
    notes: '',
    tag: '' as '' | 'Preferred' | 'Blocked',
  });

  const apiError = (error: any, fallback = 'Operation failed') =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback;

  const isCashier = user?.role === 'cashier';

  useFocusEffect(
    useCallback(() => {
      loadSuppliers();
      loadCategories();
    }, [])
  );

  const loadCategories = async () => {
    try {
      const res: any = await ApiClient.get('/categories');
      const data = Array.isArray(res) ? res : res?.data ?? [];
      const names: string[] = [...new Set<string>(data.map((c: any) => c.name).filter(Boolean))].sort();
      setCategories(names);
    } catch {
      setCategories([]);
    }
  };

  const loadSuppliers = async () => {
    dispatch(setLoading(true));
    try {
      const res: any = await ApiClient.get('/suppliers?limit=200');
      const items = Array.isArray(res) ? res : res?.data ?? [];
      dispatch(setSuppliers({ items, total: items.length }));
      // Load financial summary in background
      loadSummary();
    } catch (e) {
      Alert.alert('Error', apiError(e, 'Failed to load suppliers'));
    } finally {
      dispatch(setLoading(false));
    }
  };

  const enrichedSuppliers: EnrichedSupplier[] = useMemo(() =>
    (suppliersState.all || []).map(s => ({
      ...s,
      tone: getColorForId(s.id),
      outstanding: outstandingMap[s.id] ?? 0,
    })),
    [suppliersState.all, outstandingMap]
  );

  const filtered = useMemo(() => {
    return enrichedSuppliers.filter(s => {
      if (filter === 'preferred' && s.tag !== 'Preferred') return false;
      if (filter === 'blocked' && s.tag !== 'Blocked') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = s.name.toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        const cat = (s.category || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !cat.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedSuppliers, filter, searchQuery]);

  const grouped: SectionData[] = useMemo(() => {
    const groups: Record<string, EnrichedSupplier[]> = {};
    filtered.forEach(s => {
      const letter = (s.name?.[0] || 'Z').toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(s);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, data]) => ({ title: letter, data }));
  }, [filtered]);

  const [summaryStats, setSummaryStats] = useState({ totalInvoiced: 0, totalPaid: 0 });

  const loadSummary = async () => {
    try {
      const res: any = await ApiClient.get('/suppliers/summary');
      const data: Array<{ supplier_id: string; total_invoiced: number; total_paid: number }> =
        Array.isArray(res) ? res : res?.data ?? [];
      const map: Record<string, number> = {};
      let tInvoiced = 0, tPaid = 0;
      data.forEach(d => {
        map[d.supplier_id] = Math.max(0, (d.total_invoiced || 0) - (d.total_paid || 0));
        tInvoiced += d.total_invoiced || 0;
        tPaid += d.total_paid || 0;
      });
      setOutstandingMap(map);
      setSummaryStats({ totalInvoiced: tInvoiced, totalPaid: tPaid });
    } catch {
      // silently ignore — summary is best-effort
    }
  };

  const heroStats = useMemo(() => {
    const preferred = enrichedSuppliers.filter(s => s.tag === 'Preferred').length;
    const outstanding = enrichedSuppliers.reduce((sum, s) => sum + (s.outstanding || 0), 0);
    return {
      totalCount: enrichedSuppliers.length,
      preferredCount: preferred,
      totalInvoiced: summaryStats.totalInvoiced,
      totalPaid: summaryStats.totalPaid,
      outstanding,
    };
  }, [enrichedSuppliers, summaryStats]);

  const filterChips = [
    { key: 'all', label: 'All', count: enrichedSuppliers.length },
    { key: 'preferred', label: 'Preferred', count: enrichedSuppliers.filter(s => s.tag === 'Preferred').length },
    { key: 'blocked', label: 'Blocked', count: enrichedSuppliers.filter(s => s.tag === 'Blocked').length },
  ];

  const handleSupplierPress = (s: EnrichedSupplier) => {
    setSheetSupplier(s);
    setSheetVisible(true);
  };

  const handleSheetClose = () => {
    setSheetVisible(false);
    setTimeout(() => setSheetSupplier(null), 300);
  };

  const handleSheetLedger = () => {
    const s = sheetSupplier;
    handleSheetClose();
    if (s) navigation.navigate('SupplierLedger', { supplier_id: s.id, supplier: s });
  };

  const handleSheetNewInvoice = () => {
    const s = sheetSupplier;
    handleSheetClose();
    if (s) setTimeout(() => navigation.navigate('SupplierLedger', { supplier_id: s.id, supplier: s, openInvoiceForm: true }), 320);
  };

  const handleSheetEdit = () => {
    const s = sheetSupplier;
    handleSheetClose();
    if (s) setTimeout(() => handleEditSupplier(s), 320);
  };

  const handleSheetDelete = (s: EnrichedSupplier) => {
    Alert.alert(
      'Delete Supplier',
      `Are you sure you want to delete ${s.name}? This will also delete all invoices and payments recorded for this supplier.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              dispatch(setLoading(true));
              await ApiClient.delete(`/suppliers/${s.id}`);
              Alert.alert('Success', 'Supplier deleted successfully');
              loadSuppliers();
            } catch (e: any) {
              Alert.alert('Error', apiError(e, 'Failed to delete supplier'));
            } finally {
              dispatch(setLoading(false));
            }
          },
        },
      ]
    );
  };


  const handleOpenForm = () => {
    setEditingSupplier(null);
    setFormData({ name: '', phone: '', email: '', address: '', category: '', notes: '', tag: '' });
    setShowForm(true);
  };

  const handleEditSupplier = (s: EnrichedSupplier) => {
    setEditingSupplier(s);
    setFormData({
      name: s.name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: (s as any).address || '',
      category: s.category || '',
      notes: (s as any).notes || '',
      tag: (s.tag as any) || '',
    });
    setShowForm(true);
  };

  const handleSaveSupplier = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Validation', 'Supplier name is required');
      return;
    }
    setSavingForm(true);
    try {
      if (editingSupplier) {
        const res: any = await ApiClient.patch(`/suppliers/${editingSupplier.id}`, {
          name: formData.name.trim(),
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          category: formData.category || null,
          notes: formData.notes.trim() || null,
          tag: formData.tag || null,
        });
        const updated = res?.data ? res.data : res;
        dispatch(updateSupplier(updated));
        Alert.alert('Success', `${formData.name} updated`);
      } else {
        const res: any = await ApiClient.post('/suppliers', {
          name: formData.name.trim(),
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          category: formData.category || null,
          notes: formData.notes.trim() || null,
          tag: formData.tag || null,
        });
        const newSupplier = res?.data ? res.data : res;
        dispatch(addSupplier(newSupplier));
        Alert.alert('Success', `${formData.name} created`);
      }
      setShowForm(false);
      setEditingSupplier(null);
      await loadSuppliers();
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Failed to save supplier'));
    } finally {
      setSavingForm(false);
    }
  };

  const renderRow = ({ item, index, section }: any) => (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
      <SupplierRow
        supplier={item}
        onPress={handleSupplierPress}
        isLast={index === section.data.length - 1}
      />
    </View>
  );

  const renderSectionHeader = ({ section: { title } }: any) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="truck-outline" size={64} color={C.muted} />
      <Text style={styles.emptyTitle}>No suppliers found</Text>
      <Text style={styles.emptySubtitle}>
        {searchQuery ? 'Try a different search.' : 'Add your first supplier to get started.'}
      </Text>
    </View>
  );

  const renderHeader = () => (
    <>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Suppliers</Text>
          <Text style={styles.title}>Directory</Text>
        </View>
      </View>

      {/* Hero Card */}
      <SuppliersHero stats={heroStats} />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
        <RNTextInput
          placeholder="Search by name, phone, or category"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
          placeholderTextColor={C.muted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle" size={16} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips */}
      <FilterChipGroup
        chips={filterChips as any}
        active={filter}
        onSelect={(key) => setFilter(key as any)}
      />
    </>
  );

  if (suppliersState.loading) {
    return (
      <View style={[styles.screen, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {grouped.length > 0 ? (
        <SectionList
          sections={grouped}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          renderSectionHeader={renderSectionHeader as any}
          scrollEnabled
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
        />
      ) : (
        <>
          {renderHeader()}
          {renderEmpty()}
        </>
      )}

      {/* Supplier Detail Sheet */}
      <SupplierSheet
        visible={sheetVisible}
        supplier={sheetSupplier}
        onClose={handleSheetClose}
        onLedger={handleSheetLedger}
        onNewInvoice={handleSheetNewInvoice}
        onEdit={handleSheetEdit}
        onDelete={handleSheetDelete}
        canEdit={!isCashier}
      />


      {/* FAB — admin/manager only */}
      {!isCashier && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 140 }]}
          activeOpacity={0.85}
          onPress={handleOpenForm}
        >
          <MaterialCommunityIcons name="plus" size={18} color={C.bg} />
          <Text style={styles.fabLabel}>New supplier</Text>
        </TouchableOpacity>
      )}

      {/* New / Edit Supplier Form */}
      <Portal>
        <Dialog
          visible={showForm}
          onDismiss={() => { setShowForm(false); setEditingSupplier(null); }}
        >
          <Dialog.Title>{editingSupplier ? 'Edit Supplier' : 'New Supplier'}</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 520 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12 }}>
              <View style={styles.formContainer}>
                <PaperTextInput
                  label="Supplier Name *"
                  value={formData.name}
                  onChangeText={(t) => setFormData({ ...formData, name: t })}
                  mode="outlined"
                  editable={!savingForm}
                  outlineColor={C.border}
                  activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />

                {/* Category dropdown */}
                <View>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <TouchableOpacity
                    style={styles.dropdownTrigger}
                    onPress={() => setShowCategoryPicker(true)}
                    disabled={savingForm}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dropdownText, !formData.category && { color: C.muted }]}>
                      {formData.category || 'Select category...'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color={C.muted} />
                  </TouchableOpacity>
                </View>

                {/* Tag selector */}
                <View style={styles.tagSelector}>
                  <Text style={styles.tagSelectorLabel}>Tag</Text>
                  <View style={styles.tagChipRow}>
                    {(['', 'Preferred', 'Blocked'] as const).map((t) => {
                      const active = formData.tag === t;
                      const tagColor =
                        t === 'Preferred' ? '#10B981' :
                        t === 'Blocked' ? '#EF4444' : '#7C3AED';
                      return (
                        <TouchableOpacity
                          key={t || 'none'}
                          style={[styles.tagChip, active && { backgroundColor: tagColor, borderColor: tagColor }]}
                          onPress={() => setFormData({ ...formData, tag: t })}
                          disabled={savingForm}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>
                            {t === '' ? 'None' : t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <PaperTextInput
                  label="Phone"
                  value={formData.phone}
                  onChangeText={(t) => setFormData({ ...formData, phone: t })}
                  mode="outlined"
                  keyboardType="phone-pad"
                  editable={!savingForm}
                  outlineColor={C.border}
                  activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />

                <PaperTextInput
                  label="Email"
                  value={formData.email}
                  onChangeText={(t) => setFormData({ ...formData, email: t })}
                  mode="outlined"
                  keyboardType="email-address"
                  editable={!savingForm}
                  outlineColor={C.border}
                  activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />

                <PaperTextInput
                  label="Address"
                  value={formData.address}
                  onChangeText={(t) => setFormData({ ...formData, address: t })}
                  mode="outlined"
                  editable={!savingForm}
                  multiline
                  numberOfLines={2}
                  outlineColor={C.border}
                  activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />

                <PaperTextInput
                  label="Notes"
                  value={formData.notes}
                  onChangeText={(t) => setFormData({ ...formData, notes: t })}
                  mode="outlined"
                  editable={!savingForm}
                  multiline
                  numberOfLines={3}
                  outlineColor={C.border}
                  activeOutlineColor="#7C3AED"
                  theme={{ colors: { background: C.card } }}
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button onPress={() => { setShowForm(false); setEditingSupplier(null); }} disabled={savingForm}>
              Cancel
            </Button>
            <Button onPress={handleSaveSupplier} loading={savingForm} disabled={savingForm} mode="contained">
              {editingSupplier ? 'Save' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Category Picker Modal */}
      <Portal>
        <Dialog visible={showCategoryPicker} onDismiss={() => setShowCategoryPicker(false)}>
          <Dialog.Title>Select Category</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 380 }}>
            <ScrollView>
              <TouchableOpacity
                style={styles.categoryOption}
                onPress={() => { setFormData({ ...formData, category: '' }); setShowCategoryPicker(false); }}
              >
                <Text style={[styles.categoryOptionText, { color: C.muted }]}>None</Text>
              </TouchableOpacity>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryOption, formData.category === cat && styles.categoryOptionActive]}
                  onPress={() => { setFormData({ ...formData, category: cat }); setShowCategoryPicker(false); }}
                >
                  <Text style={[styles.categoryOptionText, formData.category === cat && { color: '#7C3AED', fontWeight: '700' }]}>
                    {cat}
                  </Text>
                  {formData.category === cat && (
                    <MaterialCommunityIcons name="check" size={16} color="#7C3AED" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowCategoryPicker(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerLeft: { flex: 1 },
  eyebrow: { fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 2 },
  title: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.02 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
  chipsRow: { marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  chipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  chipText: { fontSize: 13, fontWeight: '600', color: C.ink },
  chipTextActive: { color: '#FFFFFF' },
  chipCount: {
    backgroundColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  chipCountText: { fontSize: 11, fontWeight: '700', color: C.muted },
  chipCountTextActive: { color: '#FFFFFF' },
  list: { flex: 1 },
  listContent: { paddingBottom: 160 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 0.12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 60 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 16 },
  emptySubtitle: { fontSize: 12, color: C.muted, marginTop: 6, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  fabLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  formContainer: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, marginLeft: 4 },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: C.card,
  },
  dropdownText: { fontSize: 14, color: C.ink, flex: 1 },
  tagSelector: { marginTop: 2 },
  tagSelectorLabel: { fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6, marginLeft: 4 },
  tagChipRow: { flexDirection: 'row', gap: 8 },
  tagChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
  },
  tagChipText: { fontSize: 13, fontWeight: '700', color: C.ink },
  tagChipTextActive: { color: '#FFFFFF' },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  categoryOptionActive: { backgroundColor: '#7C3AED10' },
  categoryOptionText: { fontSize: 14, color: C.ink },
});
