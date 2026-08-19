import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput as RNTextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { TextInput, Dialog, Portal, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C, naira } from '../theme';
import dayjs from 'dayjs';

interface EODData {
  date: string;
  payments: Array<{ method: string; count: number; total: number }>;
  voids: { count: number; total: number };
}

interface VoidTransaction {
  id: string;
  receipt_number: string | null;
  total_amount: number;
  status: 'voided' | 'refunded';
  created_at: string;
  voided_by_user?: { first_name: string; last_name: string };
  void_reason?: string;
}

export default function EODReportsScreen() {
  const navigation = useNavigation();
  const user = useSelector((s: RootState) => s.auth.user);
  
  const [dateFrom, setDateFrom] = useState(dayjs());
  const [dateTo, setDateTo] = useState(dayjs());
  const [loading, setLoading] = useState(false);
  const [eodData, setEodData] = useState<EODData | null>(null);
  
  const [activeTab, setActiveTab] = useState<'eod' | 'voids'>('eod');
  
  const [voidsLoading, setVoidsLoading] = useState(false);
  const [voidTransactions, setVoidTransactions] = useState<VoidTransaction[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const isMultiBranchUser = ['admin', 'manager'].includes(user?.role ?? '');
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(isMultiBranchUser ? null : (user?.branch_id ?? null));

  const loadBranches = useCallback(async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const list = Array.isArray(res) ? res : (res?.branches ?? res?.data ?? []);
      setBranches(list.filter((b: any) => b.is_active));
    } catch (e) {
      console.error('Failed to load branches', e);
    }
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const loadEOD = useCallback(async (from: dayjs.Dayjs, to: dayjs.Dayjs) => {
    setLoading(true);
    try {
      const res: any = await ApiClient.get('/reports/eod', {
        params: {
          dateFrom: from.format('YYYY-MM-DD'),
          dateTo: to.format('YYYY-MM-DD'),
          branch_id: selectedBranchId
        }
      });
      setEodData(res ?? null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load EOD report');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  const loadVoids = useCallback(async (from: dayjs.Dayjs, to: dayjs.Dayjs) => {
    setVoidsLoading(true);
    try {
      const res: any = await ApiClient.get('/reports/voids', {
        params: {
          dateFrom: from.startOf('day').toISOString(),
          dateTo: to.endOf('day').toISOString(),
          branch_id: selectedBranchId
        }
      });
      setVoidTransactions(res ?? []);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to load Voids/Refunds');
    } finally {
      setVoidsLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    loadEOD(dateFrom, dateTo);
    loadVoids(dateFrom, dateTo);
  }, [dateFrom, dateTo, loadEOD, loadVoids]);

  const prevDay = () => {
    const diff = dateTo.diff(dateFrom, 'day');
    if (diff === 0) {
      setDateFrom(d => d.subtract(1, 'day'));
      setDateTo(d => d.subtract(1, 'day'));
    } else {
      setDateFrom(d => d.subtract(diff + 1, 'day'));
      setDateTo(d => d.subtract(diff + 1, 'day'));
    }
  };

  const nextDay = () => {
    const diff = dateTo.diff(dateFrom, 'day');
    if (diff === 0) {
      setDateFrom(d => d.add(1, 'day'));
      setDateTo(d => d.add(1, 'day'));
    } else {
      setDateFrom(d => d.add(diff + 1, 'day'));
      setDateTo(d => d.add(diff + 1, 'day'));
    }
  };

  const getDateRangeLabel = () => {
    if (dateFrom.isSame(dateTo, 'day')) {
      return dateFrom.format('MMMM D, YYYY');
    }
    return `${dateFrom.format('MMM D, YYYY')} - ${dateTo.format('MMM D, YYYY')}`;
  };

  const totalSales = eodData?.payments.reduce((sum, p) => sum + p.total, 0) || 0;
  const cashSales = eodData?.payments.find(p => p.method === 'cash')?.total || 0;
  const cardSales = eodData?.payments.find(p => p.method === 'card')?.total || 0;
  const transferSales = eodData?.payments.find(p => p.method === 'transfer')?.total || 0;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
      </View>

      <View style={styles.datePickerRow}>
        <TouchableOpacity onPress={prevDay} style={styles.dateBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={C.ink} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setCustomDateFrom(dateFrom.format('YYYY-MM-DD'));
            setCustomDateTo(dateTo.format('YYYY-MM-DD'));
            setShowDatePicker(prev => !prev);
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: C.bg,
            borderWidth: 1,
            borderColor: C.border
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>
            {getDateRangeLabel()}
          </Text>
          <MaterialCommunityIcons name="calendar-search" size={18} color={C.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={nextDay} style={styles.dateBtn} disabled={dateTo.isSame(dayjs(), 'day') || dateTo.isAfter(dayjs(), 'day')}>
          <MaterialCommunityIcons name="chevron-right" size={28} color={(dateTo.isSame(dayjs(), 'day') || dateTo.isAfter(dayjs(), 'day')) ? C.muted : C.ink} />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <View style={{ backgroundColor: C.card, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>From</Text>
              <RNTextInput
                value={customDateFrom}
                onChangeText={setCustomDateFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.muted}
                style={{
                  height: 44,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  color: C.ink,
                  backgroundColor: C.bg
                }}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>To</Text>
              <RNTextInput
                value={customDateTo}
                onChangeText={setCustomDateTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.muted}
                style={{
                  height: 44,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  color: C.ink,
                  backgroundColor: C.bg
                }}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Button onPress={() => setShowDatePicker(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={() => {
                const parsedFrom = dayjs(customDateFrom);
                const parsedTo = dayjs(customDateTo);
                if (parsedFrom.isValid() && parsedTo.isValid()) {
                  if (parsedTo.isBefore(parsedFrom)) {
                    Alert.alert('Invalid Range', 'To Date cannot be before From Date.');
                  } else {
                    setDateFrom(parsedFrom);
                    setDateTo(parsedTo);
                    setShowDatePicker(false);
                  }
                } else {
                  Alert.alert('Invalid Date', 'Please use YYYY-MM-DD format.');
                }
              }}
              style={{ backgroundColor: C.accent, borderRadius: 8 }}
            >
              Apply
            </Button>
          </View>
        </View>
      )}

      {branches.length > 1 && (
        <View style={{ backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8 }}>
            <TouchableOpacity
              style={[styles.branchChip, selectedBranchId === null && styles.branchChipActive]}
              onPress={() => setSelectedBranchId(null)}
            >
              <Text style={[styles.branchChipText, selectedBranchId === null && styles.branchChipTextActive]}>All Branches</Text>
            </TouchableOpacity>
            {branches.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[styles.branchChip, selectedBranchId === b.id && styles.branchChipActive]}
                onPress={() => setSelectedBranchId(b.id)}
              >
                <Text style={[styles.branchChipText, selectedBranchId === b.id && styles.branchChipTextActive]}>{b.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'eod' && styles.tabActive]}
          onPress={() => setActiveTab('eod')}
        >
          <Text style={[styles.tabText, activeTab === 'eod' && styles.tabTextActive]}>End of Day</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'voids' && styles.tabActive]}
          onPress={() => setActiveTab('voids')}
        >
          <Text style={[styles.tabText, activeTab === 'voids' && styles.tabTextActive]}>Voids & Refunds</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {activeTab === 'eod' ? (
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Total Sales</Text>
                <Text style={styles.summaryTotal}>{naira(totalSales)}</Text>
              </View>

              <View style={styles.rowLayout}>
                <View style={[styles.summaryCard, { flex: 1, marginRight: 8, backgroundColor: '#E0F2FE' }]}>
                  <Text style={styles.summaryLabel}>Cash</Text>
                  <Text style={[styles.summaryTotal, { color: '#0369A1' }]}>{naira(cashSales)}</Text>
                </View>
                <View style={[styles.summaryCard, { flex: 1, marginRight: 8, backgroundColor: '#FEF3C7' }]}>
                  <Text style={styles.summaryLabel}>Card</Text>
                  <Text style={[styles.summaryTotal, { color: '#B45309' }]}>{naira(cardSales)}</Text>
                </View>
                <View style={[styles.summaryCard, { flex: 1, backgroundColor: '#E0E7FF' }]}>
                  <Text style={styles.summaryLabel}>Transfer</Text>
                  <Text style={[styles.summaryTotal, { color: '#4338CA' }]}>{naira(transferSales)}</Text>
                </View>
              </View>

              <Text style={styles.sectionHeader}>PAYMENT BREAKDOWN</Text>
              <View style={styles.listCard}>
                {eodData?.payments.length === 0 && (
                  <Text style={{ textAlign: 'center', color: C.muted, padding: 12 }}>No payments recorded.</Text>
                )}
                {eodData?.payments.map((p, idx) => (
                  <View key={p.method} style={[styles.listItem, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={styles.listItemTitle}>{p.method.toUpperCase()} ({p.count} txns)</Text>
                    <Text style={styles.listItemValue}>{naira(p.total)}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionHeader}>EXCEPTIONS</Text>
              <View style={styles.listCard}>
                <View style={styles.listItem}>
                  <Text style={styles.listItemTitle}>Voids / Refunds ({eodData?.voids.count || 0})</Text>
                  <Text style={[styles.listItemValue, { color: C.rose }]}>-{naira(eodData?.voids.total || 0)}</Text>
                </View>
              </View>
            </View>
          )
        ) : (
          voidsLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : (
            <View>
              {voidTransactions.length === 0 && (
                <Text style={{ textAlign: 'center', color: C.muted, marginTop: 40 }}>No voids or refunds on this date.</Text>
              )}
              {voidTransactions.map(t => (
                <View key={t.id} style={styles.voidCard}>
                  <View style={styles.voidHeader}>
                    <Text style={styles.voidTitle}>Receipt: {t.receipt_number || 'N/A'}</Text>
                    <View style={styles.voidBadge}>
                      <Text style={styles.voidBadgeText}>{t.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.voidTime}>{dayjs(t.created_at).format('hh:mm A')}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                    <Text style={styles.voidAmount}>{naira(t.total_amount)}</Text>
                    <Text style={styles.voidUser}>By: {t.voided_by_user?.first_name || 'System'}</Text>
                  </View>
                  {t.void_reason && <Text style={styles.voidReason}>Reason: {t.void_reason}</Text>}
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 20,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border
  },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  datePickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, backgroundColor: C.card
  },
  dateBtn: { padding: 8 },
  dateText: { fontSize: 16, fontWeight: '700', width: 160, textAlign: 'center' },
  tabRow: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText: { fontSize: 14, fontWeight: '600', color: C.muted },
  tabTextActive: { color: C.accent },
  summaryCard: { backgroundColor: C.card, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  summaryLabel: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase' },
  summaryTotal: { fontSize: 32, fontWeight: '800', color: C.ink, marginTop: 4 },
  rowLayout: { flexDirection: 'row' },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', marginBottom: 8, marginTop: 16, marginLeft: 4 },
  listCard: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  listItemTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  listItemValue: { fontSize: 16, fontWeight: '700', color: C.ink },
  voidCard: { backgroundColor: C.card, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  voidHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voidTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  voidBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  voidBadgeText: { fontSize: 11, fontWeight: '800', color: '#B91C1C' },
  voidTime: { fontSize: 13, color: C.muted, marginTop: 2 },
  voidAmount: { fontSize: 18, fontWeight: '800', color: C.ink },
  voidUser: { fontSize: 13, color: C.muted },
  voidReason: { fontSize: 13, color: C.ink, marginTop: 8, fontStyle: 'italic' },
  branchChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
  branchChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  branchChipText: { fontSize: 13, fontWeight: '600', color: C.ink },
  branchChipTextActive: { color: '#fff' }
});
