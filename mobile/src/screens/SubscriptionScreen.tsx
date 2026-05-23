import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import {
  fetchSubscriptionStart,
  fetchSubscriptionSuccess,
  fetchSubscriptionError,
  fetchInvoicesStart,
  fetchInvoicesSuccess,
  fetchInvoicesError,
  cancelSubscriptionStart,
  cancelSubscriptionSuccess,
  cancelSubscriptionError,
} from '../redux/slices/subscriptionSlice';
import { ApiClient } from '../services/ApiClient';
import { getSubscriptionService } from '../services/SubscriptionService';

const SubscriptionScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const { subscription, invoices, invoicesLoading, loading } = useSelector(
    (state: RootState) => state.subscription
  );
  const [api] = useState(() => new ApiClient());

  useEffect(() => {
    loadSubscription();
    loadInvoices();
  }, []);

  const loadSubscription = async () => {
    dispatch(fetchSubscriptionStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      const sub = await subscriptionService.getSubscription();

      if (sub) {
        dispatch(fetchSubscriptionSuccess(sub));
      } else {
        dispatch(fetchSubscriptionError('No subscription found'));
      }
    } catch (error: any) {
      dispatch(fetchSubscriptionError(error.message));
    }
  };

  const loadInvoices = async () => {
    dispatch(fetchInvoicesStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      const invs = await subscriptionService.getInvoices();
      dispatch(fetchInvoicesSuccess(invs));
    } catch (error: any) {
      dispatch(fetchInvoicesError(error.message));
    }
  };

  const handleCancel = () => {
    if (!subscription) return;

    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? Your store will become inactive immediately.',
      [
        {
          text: 'Keep Subscription',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Cancel Subscription',
          onPress: () => cancelSubscription(),
          style: 'destructive',
        },
      ]
    );
  };

  const cancelSubscription = async () => {
    if (!subscription) return;

    dispatch(cancelSubscriptionStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      await subscriptionService.cancelSubscription(subscription.id);
      dispatch(cancelSubscriptionSuccess());

      Alert.alert('Success', 'Subscription cancelled');
      navigation.navigate('Dashboard');
    } catch (error: any) {
      dispatch(cancelSubscriptionError(error.message));
      Alert.alert('Error', 'Failed to cancel subscription');
    }
  };

  const handleUpgrade = () => {
    navigation.navigate('OnboardingPayment');
  };

  if (!subscription) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Subscription</Text>
          <Text style={styles.emptyStateText}>
            You don't have an active subscription yet.
          </Text>
          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <Text style={styles.upgradeButtonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const isActive = subscription.is_active || false;
  const statusColor = isActive ? '#10b981' : '#ef4444';
  const statusText = isActive ? 'Active' : 'Inactive';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Subscription</Text>
      </View>

      {/* Current Plan Card */}
      <View style={styles.planCard}>
        <View style={styles.planCardHeader}>
          <Text style={styles.planTitle}>{subscription.plan?.name || 'Plan'}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        </View>

        <Text style={styles.planPrice}>
          {formatCurrency(subscription.plan?.monthly_price || 0)}/month
        </Text>

        <View style={styles.planFeatures}>
          {subscription.plan?.max_branches ? (
            <FeatureRow label="Branches" value={`Up to ${subscription.plan.max_branches}`} />
          ) : (
            <FeatureRow label="Branches" value="Unlimited" />
          )}
          <FeatureRow label="Status" value={statusText} />
        </View>
      </View>

      {/* Billing Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Billing Information</Text>

        <BillingRow
          label="Billing Cycle Start"
          value={formatDate(subscription.billing_cycle_start)}
        />
        <BillingRow
          label="Billing Cycle End"
          value={formatDate(subscription.billing_cycle_end)}
        />
        <BillingRow
          label="Next Renewal"
          value={formatDate(subscription.next_renewal_at)}
        />
        <BillingRow
          label="Auto Renewal"
          value={subscription.auto_renew ? 'Enabled' : 'Disabled'}
        />
      </View>

      {/* Recent Invoices */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Invoices</Text>
          {invoices.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Billing')}>
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          )}
        </View>

        {invoicesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : invoices.length > 0 ? (
          invoices.slice(0, 3).map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))
        ) : (
          <Text style={styles.noData}>No invoices yet</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeButtonText}>Change Plan</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const BillingRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.billingRow}>
    <Text style={styles.billingLabel}>{label}</Text>
    <Text style={styles.billingValue}>{value}</Text>
  </View>
);

const FeatureRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.featureRow}>
    <Text style={styles.featureLabel}>{label}:</Text>
    <Text style={styles.featureValue}>{value}</Text>
  </View>
);

const InvoiceRow = ({ invoice }: { invoice: any }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const statusColor =
    invoice.status === 'paid'
      ? '#10b981'
      : invoice.status === 'unpaid'
      ? '#f59e0b'
      : '#ef4444';

  return (
    <View style={styles.invoiceRow}>
      <View style={styles.invoiceInfo}>
        <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
        <Text style={styles.invoiceDate}>
          {new Date(invoice.billing_date).toLocaleDateString('en-NG')}
        </Text>
      </View>
      <View style={styles.invoiceRight}>
        <Text style={styles.invoiceAmount}>{formatCurrency(invoice.amount)}</Text>
        <View style={[styles.invoiceStatus, { backgroundColor: statusColor }]}>
          <Text style={styles.invoiceStatusText}>{invoice.status}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2563eb',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 16,
  },
  planFeatures: {
    marginTop: 12,
  },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  featureLabel: {
    fontSize: 14,
    color: '#666',
  },
  featureValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  viewAllLink: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
  },
  billingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  billingLabel: {
    fontSize: 14,
    color: '#666',
  },
  billingValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noData: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  invoiceDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  invoiceRight: {
    alignItems: 'flex-end',
  },
  invoiceAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  invoiceStatus: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  invoiceStatusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  upgradeButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SubscriptionScreen;
