import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert, ScrollView,
  TouchableOpacity, Modal,
} from 'react-native';
import {
  Button, TextInput, Portal, Dialog, Divider, ActivityIndicator,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ApiClient from '../services/ApiClient';
import { C, R, naira } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize } from '../utils/responsiveDesign';
import type { Customer } from '../redux/slices/customersSlice';

interface Transaction {
  id: string;
  transaction_id?: string;
  created_at: string;
  total_amount: number;
  payment_method?: string;
  items_count?: number;
  status?: string;
  transaction_items?: any[];
}

interface Payment {
  id: string;
  amount: number;
  date: string;
  notes?: string;
  recorded_by_user_id?: string;
  created_at: string;
}

export default function CustomerLedgerScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);
  const customerId = (route.params as any)?.customer_id;
  const initialCustomer = (route.params as any)?.customer as Customer | undefined;

  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'payments'>('transactions');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const apiError = (error: any, fallback = 'Operation failed') =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message || fallback;

  useFocusEffect(useCallback(() => {
    if (customerId) {
      loadData();
    }
  }, [customerId]));

  const loadData = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const custRes: any = await ApiClient.get(`/customers/${customerId}`);
      const txnRes: any = await ApiClient.get(`/customers/${customerId}/history`);

      const cust = custRes.data ? custRes.data : custRes;
      const txns = Array.isArray(txnRes) ? txnRes : (txnRes?.data ?? []);

      setCustomer(cust);
      setTransactions(txns);

      // Payments endpoint is optional (may not exist on all backends)
      try {
        const payRes: any = await ApiClient.get(`/customers/${customerId}/payments`);
        const pays = Array.isArray(payRes) ? payRes : (payRes?.data ?? []);
        setPayments(pays);
      } catch (payError: any) {
        // 404 or other payment endpoint errors are non-fatal
        if (payError?.response?.status !== 404) {
          console.warn('Payment history unavailable:', payError);
        }
        setPayments([]);
      }
    } catch (e) {
      console.error('Failed to load ledger:', e);
      Alert.alert('Error', apiError(e, 'Failed to load customer ledger'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePayment = (paymentId: string, amount: number) => {
    Alert.alert(
      'Delete Payment',
      `Delete payment of ₦${amount.toLocaleString()}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiClient.delete(`/customers/${customerId}/payments/${paymentId}`);
              Alert.alert('Success', 'Payment deleted');
              loadData();
            } catch (e: any) {
              Alert.alert('Error', apiError(e, 'Failed to delete payment'));
            }
          },
        },
      ]
    );
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount.trim() || isNaN(parseFloat(paymentAmount))) {
      Alert.alert('Validation', 'Enter a valid payment amount');
      return;
    }
    if (!paymentDate.trim()) {
      Alert.alert('Validation', 'Select a payment date');
      return;
    }

    // Validate payment doesn't exceed outstanding balance
    if (parseFloat(paymentAmount) > outstandingBalance) {
      Alert.alert(
        'Payment Exceeds Balance',
        `Payment amount ₦${parseFloat(paymentAmount).toLocaleString()} exceeds outstanding balance ₦${Math.max(0, outstandingBalance).toLocaleString()}`,
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        amount: parseFloat(paymentAmount),
        date: paymentDate,
        notes: paymentNotes.trim() || undefined,
      };

      await ApiClient.post(`/customers/${customerId}/payments`, payload);
      Alert.alert('Success', 'Payment recorded');

      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setShowPaymentForm(false);
      loadData();
    } catch (e: any) {
      if (e?.response?.status === 404) {
        Alert.alert(
          'Not Available',
          'Payment recording is not yet available. This feature requires backend support.',
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        Alert.alert('Error', apiError(e));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.headerText}>Customer Ledger</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.headerText}>Customer Ledger</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Customer not found</Text>
        </View>
      </View>
    );
  }

  const totalPayments = payments.reduce((sum, p) => {
    const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : (p.amount || 0);
    return sum + amount;
  }, 0);
  const totalSpent = typeof customer.total_spent === 'string'
    ? parseFloat(customer.total_spent)
    : (customer.total_spent || 0);
  const outstandingBalance = totalSpent - totalPayments;

  const renderTransactionItem = ({ item }: { item: Transaction }) => {
    const transactionId = (item.transaction_id || item.id || 'unknown').substring(0, 8);
    const itemCount = item.items_count || (item as any).transaction_items?.length || 0;

    return (
      <View style={styles.listItem}>
        <View style={styles.itemLeft}>
          <View style={styles.itemAvatar}>
            <MaterialCommunityIcons name="receipt" size={16} color={C.accent} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              Transaction {transactionId}
            </Text>
            <Text style={styles.itemMeta}>
              {new Date(item.created_at).toLocaleDateString()}
              {itemCount > 0 && ` • ${itemCount} item${itemCount !== 1 ? 's' : ''}`}
            </Text>
          </View>
        </View>
        <Text style={styles.itemAmount}>{naira(item.total_amount)}</Text>
      </View>
    );
  };

  const renderPaymentItem = ({ item }: { item: Payment }) => (
    <View style={styles.listItem}>
      <View style={styles.itemLeft}>
        <View style={[styles.itemAvatar, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
          <MaterialCommunityIcons name="check-circle" size={16} color={C.green} />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={1}>Payment Received</Text>
          <Text style={styles.itemMeta}>
            {new Date(item.date).toLocaleDateString()}
            {item.notes && ` • ${item.notes}`}
          </Text>
        </View>
      </View>
      <View style={styles.paymentActions}>
        <Text style={[styles.itemAmount, { color: C.green }]}>-{naira(item.amount)}</Text>
        <TouchableOpacity
          onPress={() => handleDeletePayment(item.id, item.amount)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.red} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const displayedItems = activeTab === 'transactions' ? transactions : payments;
  const renderItem = activeTab === 'transactions' ? renderTransactionItem : renderPaymentItem;
  const emptyText = activeTab === 'transactions'
    ? 'No transactions yet'
    : 'No payments recorded';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={C.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={[styles.headerText, { fontSize: isTablet ? 20 : 18 }]}>
            {customer.first_name} {customer.last_name}
          </Text>
          <Text style={[styles.headerSub, { fontSize: fontSize.xs }]}>Ledger</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary cards */}
      <ScrollView style={[styles.content, { paddingHorizontal: isTablet ? spacing.lg : spacing.md }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.summaryGrid, isTablet && { gap: spacing.md }]}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Spent</Text>
            <Text style={styles.summaryValue}>
              {naira(totalSpent)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={[styles.summaryValue, { color: C.green }]}>
              {naira(Math.round(totalPayments * 100) / 100)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: outstandingBalance > 0 ? 'rgba(251,113,133,0.1)' : 'rgba(16,185,129,0.1)' }]}>
            <Text style={styles.summaryLabel}>Outstanding</Text>
            <Text style={[styles.summaryValue, { color: outstandingBalance > 0 ? C.red : C.green }]}>
              {naira(Math.max(0, Math.round(outstandingBalance * 100) / 100))}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            onPress={() => setActiveTab('transactions')}
            style={[styles.tab, activeTab === 'transactions' && styles.tabActive]}
          >
            <MaterialCommunityIcons
              name="receipt"
              size={16}
              color={activeTab === 'transactions' ? C.accent : C.muted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'transactions' && styles.tabTextActive,
              ]}
            >
              Transactions
            </Text>
            <Text style={[styles.tabBadge, activeTab === 'transactions' && styles.tabBadgeActive]}>
              {transactions.length}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab('payments')}
            style={[styles.tab, activeTab === 'payments' && styles.tabActive]}
          >
            <MaterialCommunityIcons
              name="check-circle"
              size={16}
              color={activeTab === 'payments' ? C.accent : C.muted}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'payments' && styles.tabTextActive,
              ]}
            >
              Payments
            </Text>
            <Text style={[styles.tabBadge, activeTab === 'payments' && styles.tabBadgeActive]}>
              {payments.length}
            </Text>
          </TouchableOpacity>
        </View>

        {/* List */}
        <FlatList
          data={displayedItems}
          renderItem={renderItem}
          keyExtractor={(item: any) => item.id}
          scrollEnabled={false}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name={activeTab === 'transactions' ? 'receipt-text-outline' : 'check-circle-outline'}
                size={48}
                color={C.muted}
              />
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          }
        />
      </ScrollView>

      {/* Record Payment FAB */}
      {activeTab === 'payments' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => setShowPaymentForm(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="plus" size={24} color={C.accentFg} />
        </TouchableOpacity>
      )}

      {/* Record Payment Dialog */}
      <Portal>
        <Dialog visible={showPaymentForm} onDismiss={() => setShowPaymentForm(false)}>
          <Dialog.Title>Record Payment</Dialog.Title>

          <View style={styles.balanceInfo}>
            <Text style={styles.balanceLabel}>Outstanding Balance</Text>
            <Text style={styles.balanceAmount}>
              {naira(Math.max(0, outstandingBalance))}
            </Text>
          </View>

          <Dialog.ScrollArea>
            <ScrollView>
              <View style={styles.formContainer}>
                <TextInput
                  label="Amount *"
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  mode="outlined"
                  placeholder="0.00"
                  style={styles.formField}
                  editable={!saving}
                  keyboardType="decimal-pad"
                />
                {paymentAmount && !isNaN(parseFloat(paymentAmount)) && (
                  <Text style={paymentAmount && parseFloat(paymentAmount) > outstandingBalance ? styles.errorText : styles.successText}>
                    {parseFloat(paymentAmount) > outstandingBalance
                      ? `⚠ Exceeds balance by ₦${(parseFloat(paymentAmount) - outstandingBalance).toLocaleString()}`
                      : `✓ ₦${(outstandingBalance - parseFloat(paymentAmount)).toLocaleString()} will remain`}
                  </Text>
                )}

                <TextInput
                  label="Date *"
                  value={paymentDate}
                  onChangeText={setPaymentDate}
                  mode="outlined"
                  placeholder="YYYY-MM-DD"
                  style={styles.formField}
                  editable={!saving}
                />

                <TextInput
                  label="Notes"
                  value={paymentNotes}
                  onChangeText={setPaymentNotes}
                  mode="outlined"
                  placeholder="Internal notes (optional)"
                  style={[styles.formField, styles.notesField]}
                  editable={!saving}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button onPress={() => setShowPaymentForm(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              onPress={handleRecordPayment}
              loading={saving}
              disabled={
                saving ||
                !paymentAmount.trim() ||
                isNaN(parseFloat(paymentAmount)) ||
                parseFloat(paymentAmount) > outstandingBalance
              }
              mode="contained"
            >
              Record
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '700',
    color: C.ink,
  },
  headerSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: C.muted,
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: R.md,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.accent,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
  },
  tabTextActive: {
    color: C.accent,
  },
  tabBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    backgroundColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: R.xs,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(110,86,247,0.2)',
    color: C.accent,
  },
  list: {
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderRadius: R.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemAvatar: {
    width: 40,
    height: 40,
    borderRadius: R.sm,
    backgroundColor: 'rgba(110,86,247,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  itemMeta: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  paymentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: C.muted,
    marginTop: 12,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  formField: {
    fontSize: 14,
  },
  notesField: {
    maxHeight: 100,
  },
  balanceInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(110,86,247,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  balanceLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: C.accent,
  },
  errorText: {
    fontSize: 12,
    color: C.red,
    fontWeight: '600',
  },
  successText: {
    fontSize: 12,
    color: C.green,
    fontWeight: '600',
  },
});
