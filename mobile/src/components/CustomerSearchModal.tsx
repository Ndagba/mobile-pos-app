import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ScrollView, KeyboardAvoidingView, Platform,
  TextInput as RNTextInput,
} from 'react-native';
import {
  Dialog, Button, TextInput, ActivityIndicator, Divider, Portal,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ApiClient from '../services/ApiClient';
import { C, R, naira } from '../theme';
import type { Customer } from '../redux/slices/customersSlice';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (customer: Customer) => void;
  showNone?: boolean;
}

export default function CustomerSearchModal({ visible, onDismiss, onSelect, showNone = true }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const searchInputRef = React.useRef<RNTextInput>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      loadCustomers('');
    }
  }, [visible]);

  const loadCustomers = async (searchQuery: string) => {
    setLoading(true);
    try {
      const url = searchQuery.trim()
        ? `/customers?search=${encodeURIComponent(searchQuery.trim())}`
        : '/customers?limit=50';
      const res: any = await ApiClient.get(url);
      setCustomers(Array.isArray(res) ? res : res?.data ?? []);
    } catch (e) {
      console.error('Failed to load customers:', e);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text: string) => {
    setQuery(text);
    if (text.trim().length > 0) {
      loadCustomers(text);
    } else {
      loadCustomers('');
    }
  };

  const handleSelectNone = () => {
    setQuery('');
    setCustomers([]);
    onDismiss();
    onSelect({
      id: '',
      first_name: '',
      last_name: '',
      total_spent: 0,
      transaction_count: 0,
      is_active: true,
      created_at: '',
    });
  };

  const handleSelectCustomer = (customer: Customer) => {
    setQuery('');
    setCustomers([]);
    onDismiss();
    onSelect(customer);
  };

  const renderCustomerItem = ({ item }: { item: Customer }) => {
    const fullName = `${item.first_name} ${item.last_name}`.trim();
    const balance = (item.credit_limit ?? 0) - (item.total_spent ?? 0);

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => handleSelectCustomer(item)}
        activeOpacity={0.7}
      >
        <View style={styles.itemLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(item.first_name?.charAt(0) ?? 'C').toUpperCase()}
            </Text>
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{fullName}</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>
              {item.phone && `${item.phone}`}
              {item.email && ` • ${item.email}`}
            </Text>
            <Text style={styles.itemMeta}>
              {item.transaction_count} purchase{item.transaction_count !== 1 ? 's' : ''}
              {item.credit_limit && ` • Balance: ${naira(Math.max(0, balance))}`}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={C.muted} />
      </TouchableOpacity>
    );
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={[styles.dialog, { paddingBottom: insets.bottom }]}
      >
        <Dialog.Title>Select Customer</Dialog.Title>
        <View style={styles.searchBox}>
          <TextInput
            ref={searchInputRef as any}
            placeholder="Search by name, phone, or email"
            value={query}
            onChangeText={handleSearch}
            mode="outlined"
            left={<TextInput.Icon icon="magnify" />}
            style={styles.searchInput}
          />
        </View>

        {loading && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        )}

        {!loading && customers.length === 0 && query.trim().length > 0 && (
          <View style={styles.centerContent}>
            <MaterialCommunityIcons name="magnify" size={48} color={C.muted} />
            <Text style={styles.emptyText}>No customers found</Text>
          </View>
        )}

        {!loading && (
          <FlatList
            data={customers}
            renderItem={renderCustomerItem}
            keyExtractor={item => item.id}
            scrollEnabled
            style={styles.list}
            nestedScrollEnabled
          />
        )}

        {!loading && customers.length > 0 && showNone && (
          <>
            <Divider />
            <TouchableOpacity style={styles.noneItem} onPress={handleSelectNone} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close-circle-outline" size={20} color={C.muted} />
              <Text style={styles.noneText}>Walk-in (no customer)</Text>
            </TouchableOpacity>
          </>
        )}

        <Dialog.Actions style={styles.actions}>
          <Button onPress={onDismiss} textColor={C.muted}>Cancel</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '80%',
    alignSelf: 'center',
    width: '90%',
    borderRadius: R.lg,
  },
  searchBox: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchInput: {
    fontSize: 14,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  list: {
    maxHeight: 400,
    paddingHorizontal: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: C.accentFg,
    fontWeight: '700',
    fontSize: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
  },
  itemMeta: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  noneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  noneText: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: C.muted,
    marginTop: 12,
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
});
