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
  ListRenderItem,
  ScrollView,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { ActivityIndicator, Dialog, Portal, Button, TextInput as PaperTextInput } from 'react-native-paper';

import { RootState } from '../redux/store';
import { setLoading, setCustomers, addCustomer, updateCustomer } from '../redux/slices/customersSlice';
import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import { C } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize, responsiveMinTouchTarget } from '../utils/responsiveDesign';

import CustomersHero from '../components/customers/CustomersHero';
import FilterChipGroup from '../components/customers/FilterChipGroup';
import CustomerRow, { Customer } from '../components/customers/CustomerRow';
import CustomerSheet from '../components/customers/CustomerSheet';

const TONE_COLORS = ['#6E56F7', '#10B981', '#FB7185', '#F59E0B', '#1A1A22'];

function getColorForId(id: string): string {
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TONE_COLORS[hash % TONE_COLORS.length];
}

interface FilteredCustomer extends Customer {
  tone: string;
}

interface SectionData {
  title: string;
  data: FilteredCustomer[];
}

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const customersState = useSelector((state: RootState) => state.customers);
  const user = useSelector((state: RootState) => state.auth.user);
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);
  const minTouchTarget = responsiveMinTouchTarget(deviceType);

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'vip' | 'new'>('all');
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [allowCashierAdd, setAllowCashierAdd] = useState(true);
  const [allowCashierEdit, setAllowCashierEdit] = useState(true);
  const [sheetCustomer, setSheetCustomer] = useState<FilteredCustomer | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<FilteredCustomer | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    credit_limit: '',
    notes: '',
    tag: '',
  });

  const apiError = (error: any, fallback = 'Operation failed') =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback;

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
      loadStoreSettings();
      loadOutstanding();
    }, [])
  );

  const loadOutstanding = async () => {
    // SWR-style: show cached value instantly, refresh in background.
    const cached = await DatabaseService.getApiCache<{ total: number }>('customers_outstanding');
    if (cached && typeof cached.total === 'number') {
      setOutstandingTotal(cached.total);
    }

    if (!ApiClient.getOnlineStatus()) return;

    try {
      const res: any = await ApiClient.get('/analytics/outstanding');
      const data = res?.data ?? res;
      const total = Number(data?.total_outstanding ?? 0);
      setOutstandingTotal(total);
      DatabaseService.setApiCache('customers_outstanding', { total });
    } catch {
      // keep cached value
    }
  };

  const loadStoreSettings = async () => {
    try {
      const res: any = await ApiClient.get('/settings');
      const data = res?.data ?? res;
      setAllowCashierAdd(data?.allow_cashier_add_customers ?? true);
      setAllowCashierEdit(data?.allow_cashier_edit_customers ?? true);
    } catch {
      setAllowCashierAdd(true);
      setAllowCashierEdit(true);
    }
  };

  const loadCustomers = async () => {
    dispatch(setLoading(true));
    try {
      // Offline: skip the network call entirely and read from the cache.
      if (!ApiClient.getOnlineStatus()) {
        const cachedItems = await DatabaseService.getCustomers();
        dispatch(setCustomers({ items: cachedItems, total: cachedItems.length }));
        return;
      }

      const res: any = await ApiClient.get('/customers?limit=200');
      const items = Array.isArray(res) ? res : res?.data ?? [];
      await DatabaseService.saveCustomers(items);
      dispatch(setCustomers({ items, total: items.length }));
    } catch (e) {
      console.error('Failed to load customers:', e);
      // Network dropped mid-request — fall back to cached customers.
      const cachedItems = await DatabaseService.getCustomers();
      if (cachedItems.length > 0) {
        dispatch(setCustomers({ items: cachedItems, total: cachedItems.length }));
      } else {
        Alert.alert('Error', apiError(e, 'Failed to load customers'));
      }
    } finally {
      dispatch(setLoading(false));
    }
  };

  // ─── Add tone color to customers ───────────────────────────
  const customersWithTone: FilteredCustomer[] = (customersState.all || []).map(c => ({
    ...c,
    tone: getColorForId(c.id),
  }));

  // ─── Filter customers ────────────────────────────────────────
  const filtered = useMemo(() => {
    return customersWithTone.filter(c => {
      // Filter by tag
      if (filter === 'vip' && c.tag !== 'VIP') return false;
      if (filter === 'new' && c.tag !== 'New') return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = `${c.first_name} ${c.last_name}`.toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        if (!name.includes(query) && !phone.includes(query)) return false;
      }

      return true;
    });
  }, [customersWithTone, filter, searchQuery]);

  // ─── Group by first letter ────────────────────────────────────
  const grouped: SectionData[] = useMemo(() => {
    const groups: Record<string, FilteredCustomer[]> = {};

    filtered.forEach(c => {
      const letter = (c.first_name?.[0] || 'Z').toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, customers]) => ({
        title: letter,
        data: customers,
      }));
  }, [filtered]);

  // ─── Stats for hero card ────────────────────────────────────
  const stats = useMemo(() => {
    const vipCount = customersWithTone.filter(c => c.tag === 'VIP').length;
    const active30d = customersWithTone.filter(c => {
      if (!c.last_transaction_at) return false;
      const lastDate = new Date(c.last_transaction_at);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return lastDate > thirtyDaysAgo;
    }).length;
    const lifetimeSpend = customersWithTone.reduce((sum, c) => sum + (Number(c.total_spent) || 0), 0);

    return {
      totalCount: customersWithTone.length,
      vipCount,
      active30dCount: active30d,
      lifetimeSpend,
      outstandingTotal,
    };
  }, [customersWithTone, outstandingTotal]);

  // ─── Filter chips ───────────────────────────────────────────
  const filterChips = [
    { key: 'all', label: 'All', count: customersWithTone.length },
    {
      key: 'vip',
      label: '⭐ VIP',
      count: customersWithTone.filter(c => c.tag === 'VIP').length,
    },
    {
      key: 'new',
      label: 'New',
      count: customersWithTone.filter(c => c.tag === 'New').length,
    },
  ];

  const isCashier = user?.role === 'cashier';
  const canAddCustomers = !isCashier || allowCashierAdd;
  const canEditCustomers = !isCashier || allowCashierEdit;

  const handleCustomerPress = (customer: FilteredCustomer) => {
    setSheetCustomer(customer);
    setSheetVisible(true);
  };

  const handleSheetClose = () => {
    setSheetVisible(false);
    setTimeout(() => setSheetCustomer(null), 300);
  };

  const handleOpenForm = () => {
    setEditingCustomer(null);
    setFormData({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      credit_limit: '',
      notes: '',
      tag: '',
    });
    setShowForm(true);
  };

  const handleEditCustomer = (customer: FilteredCustomer) => {
    const full = customer as any;
    setEditingCustomer(customer);
    setFormData({
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      phone: customer.phone || '',
      email: full.email || '',
      credit_limit: full.credit_limit != null ? String(full.credit_limit) : '',
      notes: full.notes || '',
      tag: full.tag || '',
    });
    setShowForm(true);
  };

  const handleSheetNewSale = () => {
    const c = sheetCustomer;
    handleSheetClose();
    if (c) navigation.navigate('Checkout', { customer: c });
  };

  const handleSheetHistory = () => {
    const c = sheetCustomer;
    handleSheetClose();
    if (c) navigation.navigate('CustomerLedger', { customer_id: c.id, customer: c });
  };

  const handleSheetEdit = () => {
    const c = sheetCustomer;
    handleSheetClose();
    if (c) setTimeout(() => handleEditCustomer(c), 320);
  };

  const handleSaveCustomer = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      Alert.alert('Validation', 'First name and last name are required');
      return;
    }

    setSavingForm(true);
    try {
      if (editingCustomer) {
        const editPayload: any = {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          notes: formData.notes.trim() || null,
          tag: formData.tag || null,
          credit_limit:
            formData.credit_limit.trim() && !isNaN(parseFloat(formData.credit_limit))
              ? parseFloat(formData.credit_limit)
              : null,
        };
        const res: any = await ApiClient.patch(`/customers/${editingCustomer.id}`, editPayload);
        const updated = res?.data ? res.data : res;
        dispatch(updateCustomer(updated));
        Alert.alert('Success', `${formData.first_name} ${formData.last_name} updated`);
      } else {
        const payload: any = {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
        };

        if (formData.phone.trim()) payload.phone = formData.phone.trim();
        if (formData.email.trim()) payload.email = formData.email.trim();
        if (formData.credit_limit.trim()) {
          const limit = parseFloat(formData.credit_limit);
          if (!isNaN(limit)) payload.credit_limit = limit;
        }
        if (formData.notes.trim()) payload.notes = formData.notes.trim();
        if (formData.tag) payload.tag = formData.tag;

        const res: any = await ApiClient.post('/customers', payload);
        const newCustomer = res.data ? res.data : res;
        dispatch(addCustomer(newCustomer));
        Alert.alert('Success', `${formData.first_name} ${formData.last_name} created`);
      }

      setShowForm(false);
      setEditingCustomer(null);
      await loadCustomers();
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Failed to save customer'));
    } finally {
      setSavingForm(false);
    }
  };

  const renderSectionHeader: ListRenderItem<any> = ({ section: { title } }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  const renderRow: ListRenderItem<FilteredCustomer> = ({ item, index, section }) => (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border }}>
      <CustomerRow
        customer={item}
        onPress={handleCustomerPress}
        isLast={index === section.data.length - 1}
      />
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="account-multiple-outline" size={64} color={C.muted} />
      <Text style={styles.emptyTitle}>No matches</Text>
      <Text style={styles.emptySubtitle}>Try a different search or filter.</Text>
    </View>
  );

  const renderHeader = () => (
    <>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>Customers</Text>
          <Text style={styles.title}>Directory</Text>
        </View>
        <TouchableOpacity style={styles.searchButton} activeOpacity={0.7}>
          <MaterialCommunityIcons name="magnify" size={18} color={C.ink} />
        </TouchableOpacity>
      </View>

      {/* Hero Card */}
      <CustomersHero stats={stats} />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
        <RNTextInput
          placeholder="Search by name or phone"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
          placeholderTextColor={C.muted}
        />
      </View>

      {/* Filter Chips */}
      <FilterChipGroup
        chips={filterChips as any}
        active={filter}
        onSelect={(key) => setFilter(key as any)}
      />
    </>
  );

  if (customersState.loading) {
    return (
      <View style={[styles.screen, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={C.accent} />
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
          renderSectionHeader={renderSectionHeader}
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

      {/* Customer Detail Sheet */}
      <CustomerSheet
        visible={sheetVisible}
        customer={sheetCustomer}
        onClose={handleSheetClose}
        onNewSale={handleSheetNewSale}
        onHistory={handleSheetHistory}
        onEdit={handleSheetEdit}
        canEdit={canEditCustomers}
      />

      {/* FAB */}
      {canAddCustomers && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 140 }]}
          activeOpacity={0.85}
          onPress={handleOpenForm}
        >
          <MaterialCommunityIcons name="plus" size={18} color={C.bg} />
          <Text style={styles.fabLabel}>New customer</Text>
        </TouchableOpacity>
      )}

      {/* New Customer Form Dialog */}
      <Portal>
        <Dialog
          visible={showForm}
          onDismiss={() => { setShowForm(false); setEditingCustomer(null); }}
        >
        <Dialog.Title>{editingCustomer ? 'Edit Customer' : 'New Customer'}</Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 500 }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 12 }}
          >
            <View style={styles.formContainer}>
              <PaperTextInput
                label="First Name *"
                value={formData.first_name}
                onChangeText={(text) => setFormData({ ...formData, first_name: text })}
                mode="outlined"
                placeholder="First name"
                editable={!savingForm}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />

              <PaperTextInput
                label="Last Name *"
                value={formData.last_name}
                onChangeText={(text) => setFormData({ ...formData, last_name: text })}
                mode="outlined"
                placeholder="Last name"
                editable={!savingForm}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />

              <View style={styles.tagSelector}>
                <Text style={styles.tagSelectorLabel}>Tag</Text>
                <View style={styles.tagChipRow}>
                  {(['', 'VIP', 'New'] as const).map((t) => {
                    const active = formData.tag === t;
                    return (
                      <TouchableOpacity
                        key={t || 'none'}
                        style={[styles.tagChip, active && styles.tagChipActive]}
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
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                mode="outlined"
                placeholder="Phone number"
                editable={!savingForm}
                keyboardType="phone-pad"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />

              <PaperTextInput
                label="Email"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                mode="outlined"
                placeholder="Email address"
                editable={!savingForm}
                keyboardType="email-address"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />

              <PaperTextInput
                label="Credit Limit"
                value={formData.credit_limit}
                onChangeText={(text) => setFormData({ ...formData, credit_limit: text })}
                mode="outlined"
                placeholder="Leave blank for unlimited"
                editable={!savingForm}
                keyboardType="decimal-pad"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />

              <PaperTextInput
                label="Notes"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                mode="outlined"
                placeholder="Internal notes"
                editable={!savingForm}
                multiline
                numberOfLines={3}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
            </View>
          </ScrollView>
        </Dialog.ScrollArea>

        <Dialog.Actions>
          <Button
            onPress={() => { setShowForm(false); setEditingCustomer(null); }}
            disabled={savingForm}
          >
            Cancel
          </Button>
          <Button
            onPress={handleSaveCustomer}
            loading={savingForm}
            disabled={savingForm}
            mode="contained"
          >
            {editingCustomer ? 'Save' : 'Create'}
          </Button>
        </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerLeft: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    color: C.muted,
    marginBottom: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.02,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.ink,
    padding: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 160,
  },
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
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: C.ink,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
      },
      android: { elevation: 8 },
    }),
  },
  fabLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.bg,
    letterSpacing: 0,
  },
  formContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  tagSelector: {
    marginTop: 2,
  },
  tagSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    marginBottom: 6,
    marginLeft: 4,
  },
  tagChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tagChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
  },
  tagChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  tagChipTextActive: {
    color: C.accentFg,
  },
});
