import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { TextInput, Dialog, Portal, Button } from 'react-native-paper';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import dayjs from 'dayjs';

interface Shift {
  id: string;
  status: 'open' | 'closed';
  opening_balance: number;
  expected_closing: number | null;
  actual_closing: number | null;
  overage_shortage: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  user?: { first_name: string; last_name: string };
}

export default function CashShiftsScreen() {
  const navigation = useNavigation();
  const user = useSelector((s: RootState) => s.auth.user);
  
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);

  // Start Shift Modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [startNotes, setStartNotes] = useState('');
  const [starting, setStarting] = useState(false);

  // Close Shift Modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [actualClosing, setActualClosing] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, setClosing] = useState(false);

  // Branch Selection for users without branch_id (Admin/Super Admin)
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const loadBranches = useCallback(async () => {
    if (user?.branch_id) return;
    try {
      const res: any = await ApiClient.get('/branches');
      const list = Array.isArray(res) ? res : res?.data ?? [];
      const activeList = list.filter((b: any) => b.is_active);
      setBranches(activeList);
      if (activeList.length > 0) {
        setSelectedBranchId(activeList[0].id);
      }
    } catch (e) {
      console.error('Failed to load branches', e);
    }
  }, [user?.branch_id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [currentRes, allRes]: any = await Promise.all([
        ApiClient.get('/shifts/current'),
        ApiClient.get('/shifts')
      ]);
      setCurrentShift(currentRes ?? null);
      setShifts(allRes ?? []);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranches();
    loadData();
  }, [loadBranches, loadData]);

  const handleStartShift = async () => {
    const bal = parseFloat(openingBalance);
    if (isNaN(bal)) {
      Alert.alert('Invalid', 'Please enter a valid opening balance');
      return;
    }
    const targetBranchId = user?.branch_id || selectedBranchId;
    if (!targetBranchId) {
      Alert.alert('Error', 'Please select a branch.');
      return;
    }
    setStarting(true);
    try {
      await ApiClient.post('/shifts', {
        branch_id: targetBranchId,
        opening_balance: bal,
        notes: startNotes
      });
      setShowStartModal(false);
      setOpeningBalance('');
      setStartNotes('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to start shift');
    } finally {
      setStarting(false);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    const actual = parseFloat(actualClosing);
    if (isNaN(actual)) {
      Alert.alert('Invalid', 'Please enter a valid actual closing balance');
      return;
    }
    setClosing(true);
    try {
      await ApiClient.post(`/shifts/${currentShift.id}/close`, {
        actual_closing: actual,
        notes: closeNotes
      });
      setShowCloseModal(false);
      setActualClosing('');
      setCloseNotes('');
      loadData();
      Alert.alert('Success', 'Shift closed successfully.');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to close shift');
    } finally {
      setClosing(false);
    }
  };

  const renderShiftItem = ({ item }: { item: Shift }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {dayjs(item.opened_at).format('MMM D, YYYY HH:mm')}
        </Text>
        <View style={[
          styles.statusBadge,
          item.status === 'closed' ? styles.statusClosed : styles.statusOpen
        ]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardSub}>Cashier: {item.user?.first_name || 'System'}</Text>
      
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Opening</Text>
          <Text style={styles.statValue}>₦{item.opening_balance.toFixed(2)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Expected</Text>
          <Text style={styles.statValue}>₦{(item.expected_closing || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Actual</Text>
          <Text style={styles.statValue}>{item.actual_closing != null ? `₦${item.actual_closing.toFixed(2)}` : '-'}</Text>
        </View>
      </View>

      {item.overage_shortage !== null && item.overage_shortage !== 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.statValue, { color: item.overage_shortage > 0 ? C.green : C.rose }]}>
            {item.overage_shortage > 0 ? 'Overage' : 'Shortage'}: ₦{Math.abs(item.overage_shortage).toFixed(2)}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Cash Shifts</Text>
      </View>

      <View style={{ padding: 16 }}>
        {currentShift ? (
          <View style={[styles.card, { borderColor: C.accent, borderWidth: 2 }]}>
            <Text style={styles.activeTitle}>Active Shift</Text>
            <Text style={styles.cardSub}>Started: {dayjs(currentShift.opened_at).format('hh:mm A')}</Text>
            <View style={[styles.statsRow, { marginTop: 16 }]}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Opening</Text>
                <Text style={styles.statValue}>₦{currentShift.opening_balance.toFixed(2)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Expected</Text>
                <Text style={styles.statValue}>₦{(currentShift.expected_closing || 0).toFixed(2)}</Text>
              </View>
            </View>
            <Button mode="contained" onPress={() => setShowCloseModal(true)} style={{ marginTop: 16 }}>
              Close Shift
            </Button>
          </View>
        ) : (
          <View style={styles.noShiftBox}>
            <Text style={styles.noShiftText}>You do not have an active shift.</Text>
            <Button mode="contained" onPress={() => setShowStartModal(true)}>
              Start Shift
            </Button>
          </View>
        )}
      </View>

      <Text style={styles.sectionHeader}>PAST SHIFTS</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={renderShiftItem}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No shifts found.</Text>}
        />
      )}

      {/* Start Shift Modal */}
      <Portal>
        <Dialog visible={showStartModal} onDismiss={() => setShowStartModal(false)}>
          <Dialog.Title>Start Shift</Dialog.Title>
          <Dialog.Content>
            {!user?.branch_id && branches.length > 0 && (
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
              label="Opening Balance (₦)"
              value={openingBalance}
              onChangeText={setOpeningBalance}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 12 }}
            />
            <TextInput
              label="Notes (Optional)"
              value={startNotes}
              onChangeText={setStartNotes}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowStartModal(false)}>Cancel</Button>
            <Button onPress={handleStartShift} loading={starting}>Start</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Close Shift Modal */}
      <Portal>
        <Dialog visible={showCloseModal} onDismiss={() => setShowCloseModal(false)}>
          <Dialog.Title>Close Shift</Dialog.Title>
          <Dialog.Content>
            <Text style={{ marginBottom: 12 }}>Expected Drawer: ₦{(currentShift?.expected_closing || 0).toFixed(2)}</Text>
            <TextInput
              label="Actual Counted Balance (₦)"
              value={actualClosing}
              onChangeText={setActualClosing}
              keyboardType="numeric"
              mode="outlined"
              style={{ marginBottom: 12 }}
            />
            <TextInput
              label="Notes (Optional)"
              value={closeNotes}
              onChangeText={setCloseNotes}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCloseModal(false)}>Cancel</Button>
            <Button onPress={handleCloseShift} loading={closing}>Close Shift</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  activeTitle: { fontSize: 18, fontWeight: '700', color: C.accent, marginBottom: 4 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase',
    paddingHorizontal: 16, marginTop: 8
  },
  card: {
    backgroundColor: C.card, padding: 16, borderRadius: 12,
    marginBottom: 12, borderWidth: 1, borderColor: C.border
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusClosed: { backgroundColor: '#10B98120' },
  statusOpen: { backgroundColor: '#F59E0B20' },
  statusText: { fontSize: 11, fontWeight: '800', color: C.ink },
  cardSub: { fontSize: 13, color: C.muted },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: C.muted },
  statValue: { fontSize: 16, fontWeight: '700', color: C.ink },
  noShiftBox: {
    backgroundColor: C.card, padding: 24, borderRadius: 12,
    alignItems: 'center', borderWidth: 1, borderColor: C.border
  },
  noShiftText: { fontSize: 15, color: C.muted, marginBottom: 16 }
});
