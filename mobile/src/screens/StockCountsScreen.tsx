import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TextInput, Dialog, Portal, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import dayjs from 'dayjs';
import BarcodeScannerModal from '../components/BarcodeScannerModal';

interface StockCount {
  id: string;
  status: 'draft' | 'in_progress' | 'completed';
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  started_by: { first_name: string; last_name: string } | null;
  completed_by: { first_name: string; last_name: string } | null;
  branch?: { name: string } | null;
}

interface StockCountItem {
  id: string;
  product_id: string;
  product: { name: string; sku: string | null; category: { name: string } | null };
  system_quantity: number;
  physical_quantity: number | null;
  variance: number | null;
  notes: string | null;
}

export default function StockCountsScreen() {
  const navigation = useNavigation();
  const user = useSelector((s: RootState) => s.auth.user);
  
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(false);

  // New Count Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Active Count Modal
  const [activeCount, setActiveCount] = useState<StockCount | null>(null);
  const [items, setItems] = useState<StockCountItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  
  const handleBarcodeScanned = (code: string) => {
    setScannerOpen(false);
    setSearchQuery(code);
  };
  
  // To avoid fetching everything, the user can just type into physical quantity
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');

  // Admin branch selection
  const isAdmin = user?.role === 'admin' || user?.is_super_admin;
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const loadBranches = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res: any = await ApiClient.get('/branches');
      const list = Array.isArray(res) ? res : res?.data ?? [];
      setBranches(list);
      if (list.length > 0) setSelectedBranchId(list[0].id);
    } catch {}
  }, [isAdmin]);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await ApiClient.get('/stock-counts');
      setCounts(res ?? []);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load stock counts');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBranches();
      loadCounts();
    }, [loadBranches, loadCounts])
  );

  const handleCreate = async () => {
    const targetBranchId = isAdmin ? selectedBranchId : user?.branch_id;
    if (!targetBranchId || targetBranchId === 'null' || targetBranchId === 'undefined') {
      Alert.alert('Error', 'Please select a branch first.');
      return;
    }
    setCreating(true);
    try {
      const res: any = await ApiClient.post('/stock-counts', {
        branch_id: targetBranchId,
        notes: newNotes
      });
      setShowNewModal(false);
      setNewNotes('');
      loadCounts();
      handleOpenCount(res);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create stock count');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenCount = async (count: StockCount) => {
    setActiveCount(count);
    setItemsLoading(true);
    try {
      const res: any = await ApiClient.get(`/stock-counts/${count.id}`);
      setItems(res?.items ?? []);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load count details');
    } finally {
      setItemsLoading(false);
    }
  };

  const handleSaveItemQty = async (product_id: string, qtyStr: string) => {
    if (!activeCount) return;
    const qty = parseFloat(qtyStr);
    if (isNaN(qty)) return;

    try {
      const res: any = await ApiClient.patch(`/stock-counts/${activeCount.id}/items`, {
        items: [{ product_id, physical_quantity: qty }]
      });
      // reload items
      const detailsRes: any = await ApiClient.get(`/stock-counts/${activeCount.id}`);
      setItems(detailsRes?.items ?? []);
      setEditingItemId(null);
    } catch (e: any) {
      Alert.alert('Error', 'Failed to save quantity');
    }
  };

  const handleComplete = async () => {
    if (!activeCount) return;
    Alert.alert(
      'Complete Stock Count',
      'Are you sure? This will update inventory levels and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await ApiClient.post(`/stock-counts/${activeCount.id}/accept`, {});
              Alert.alert('Success', 'Stock count completed and inventory updated.');
              setActiveCount(null);
              loadCounts();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.message || e?.message || 'Failed to complete stock count');
            }
          }
        }
      ]
    );
  };

  const renderCountItem = ({ item }: { item: StockCount }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleOpenCount(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {dayjs(item.created_at).format('MMM D, YYYY HH:mm')}
        </Text>
        <View style={[
          styles.statusBadge,
          item.status === 'completed' ? styles.statusCompleted : styles.statusInProgress
        ]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardSub}>Branch: {item.branch?.name || '—'}  |  Started by: {item.started_by?.first_name || 'System'}</Text>
      {item.notes && <Text style={styles.cardNotes}>{item.notes}</Text>}
    </TouchableOpacity>
  );

  if (activeCount) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setActiveCount(null)} style={{ marginRight: 16 }}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Stock Count</Text>
            <Text style={styles.eyebrow}>{dayjs(activeCount.created_at).format('MMM D, YYYY')}</Text>
          </View>
          {activeCount.status !== 'completed' && (
            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
              <Text style={styles.completeBtnText}>Complete</Text>
            </TouchableOpacity>
          )}
        </View>

        {activeCount.status !== 'completed' && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={20} color={C.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search products or scan barcode..."
                style={{ flex: 1, backgroundColor: 'transparent' }}
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setScannerOpen(true)} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="barcode-scan" size={22} color={C.accent} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {itemsLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={items.filter(i => 
              i.product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
              (i.product.sku && i.product.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
              (i.product.barcode && i.product.barcode.toLowerCase().includes(searchQuery.toLowerCase()))
            )}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16 }}
            ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No items recorded yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.product.name}</Text>
                  <Text style={styles.itemSku}>{item.product.sku} • System: {item.system_quantity}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {editingItemId === item.id ? (
                    <TextInput
                      style={{ width: 80, height: 40 }}
                      keyboardType="numeric"
                      value={editQty}
                      onChangeText={setEditQty}
                      onBlur={() => handleSaveItemQty(item.product_id, editQty)}
                      autoFocus
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        if (activeCount.status !== 'completed') {
                          setEditingItemId(item.id);
                          setEditQty(item.physical_quantity?.toString() || '');
                        }
                      }}
                      style={styles.qtyBox}
                    >
                      <Text style={styles.qtyText}>
                        {item.physical_quantity !== null ? item.physical_quantity : '-'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {item.variance !== null && item.variance !== 0 && (
                    <Text style={[styles.variance, { color: item.variance > 0 ? C.green : C.rose }]}>
                      {item.variance > 0 ? '+' : ''}{item.variance}
                    </Text>
                  )}
                </View>
              </View>
            )}
          />
        )}
        <BarcodeScannerModal
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScanned={handleBarcodeScanned}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Stock Counts</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={counts}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={renderCountItem}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={64} color={C.muted} />
              <Text style={{ textAlign: 'center', marginTop: 16, color: C.muted, fontSize: 16 }}>No stock counts found.</Text>
              <TouchableOpacity style={[styles.completeBtn, { marginTop: 24 }]} onPress={() => setShowNewModal(true)}>
                <Text style={styles.completeBtnText}>START NEW STOCK COUNT</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setShowNewModal(true)}
      >
        <MaterialCommunityIcons name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      <Portal>
        <Dialog visible={showNewModal} onDismiss={() => setShowNewModal(false)}>
          <Dialog.Title>Start Stock Count</Dialog.Title>
          <Dialog.Content>
            {isAdmin && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Select Branch</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {branches.map(b => (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border },
                        selectedBranchId === b.id && { backgroundColor: C.accent, borderColor: C.accent }
                      ]}
                      onPress={() => setSelectedBranchId(b.id)}
                    >
                      <Text style={[
                        { color: C.ink },
                        selectedBranchId === b.id && { color: '#fff', fontWeight: 'bold' }
                      ]}>{b.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            <TextInput
              label="Notes (Optional)"
              value={newNotes}
              onChangeText={setNewNotes}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowNewModal(false)}>Cancel</Button>
            <Button onPress={handleCreate} loading={creating}>Start</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={handleBarcodeScanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 20,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border
  },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  eyebrow: { fontSize: 13, color: C.muted },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: C.border, height: 48
  },
  card: {
    backgroundColor: C.card, padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: C.border
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusCompleted: { backgroundColor: '#10B98120' },
  statusInProgress: { backgroundColor: '#F59E0B20' },
  statusText: { fontSize: 11, fontWeight: '800', color: C.ink },
  cardSub: { fontSize: 13, color: C.muted },
  cardNotes: { fontSize: 13, color: C.ink, marginTop: 8, fontStyle: 'italic' },
  fab: {
    position: 'absolute', bottom: 30, right: 20,
    backgroundColor: C.accent, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', elevation: 4
  },
  completeBtn: { backgroundColor: C.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  completeBtnText: { color: '#fff', fontWeight: '700' },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border
  },
  itemName: { fontSize: 16, fontWeight: '600', color: C.ink },
  itemSku: { fontSize: 13, color: C.muted },
  qtyBox: {
    minWidth: 50, padding: 8, borderRadius: 8,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    alignItems: 'center'
  },
  qtyText: { fontSize: 16, fontWeight: '700', color: C.ink },
  variance: { marginLeft: 12, fontSize: 14, fontWeight: '700', width: 40, textAlign: 'right' }
});
