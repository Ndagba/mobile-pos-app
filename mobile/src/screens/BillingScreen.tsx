import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import {
  fetchInvoicesStart,
  fetchInvoicesSuccess,
  fetchInvoicesError,
} from '../redux/slices/subscriptionSlice';
import { ApiClient } from '../services/ApiClient';
import { getSubscriptionService } from '../services/SubscriptionService';

const BillingScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const { invoices, invoicesLoading } = useSelector(
    (state: RootState) => state.subscription
  );

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    dispatch(fetchInvoicesStart());
    try {
      const api = new ApiClient();
      const subscriptionService = getSubscriptionService(api);
      const invs = await subscriptionService.getInvoices();
      dispatch(fetchInvoicesSuccess(invs));
    } catch (error: any) {
      dispatch(fetchInvoicesError(error.message));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#10b981';
      case 'unpaid':
        return '#f59e0b';
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billing History</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {invoicesLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading invoices...</Text>
          </View>
        ) : invoices.length > 0 ? (
          <View>
            <Text style={styles.invoiceCount}>
              Total Invoices: {invoices.length}
            </Text>

            {invoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No Invoices</Text>
            <Text style={styles.emptyStateText}>
              You don't have any invoices yet.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const InvoiceCard = ({ invoice }: { invoice: any }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return '#10b981';
      case 'unpaid':
        return '#f59e0b';
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const statusColor = getStatusColor(invoice.status);

  return (
    <View style={styles.invoiceCard}>
      <View style={styles.invoiceCardTop}>
        <View style={styles.invoiceDetails}>
          <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
          <Text style={styles.invoiceDescription}>
            Invoice for billing period starting {formatDate(invoice.billing_date)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusLabel}>{invoice.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.invoiceCardDivider} />

      <View style={styles.invoiceCardRow}>
        <Text style={styles.invoiceLabel}>Amount Due</Text>
        <Text style={styles.invoiceAmount}>{formatCurrency(invoice.amount)}</Text>
      </View>

      <View style={styles.invoiceCardRow}>
        <Text style={styles.invoiceLabel}>Billing Date</Text>
        <Text style={styles.invoiceValue}>{formatDate(invoice.billing_date)}</Text>
      </View>

      <View style={styles.invoiceCardRow}>
        <Text style={styles.invoiceLabel}>Due Date</Text>
        <Text style={styles.invoiceValue}>{formatDate(invoice.due_date)}</Text>
      </View>

      {invoice.paid_at && (
        <View style={styles.invoiceCardRow}>
          <Text style={styles.invoiceLabel}>Paid On</Text>
          <Text style={styles.invoiceValue}>{formatDate(invoice.paid_at)}</Text>
        </View>
      )}

      {invoice.paystack_reference && (
        <View style={styles.invoiceCardRow}>
          <Text style={styles.invoiceLabel}>Reference</Text>
          <Text style={styles.invoiceValue}>{invoice.paystack_reference}</Text>
        </View>
      )}

      {invoice.pdf_url && (
        <TouchableOpacity style={styles.downloadButton}>
          <Text style={styles.downloadButtonText}>📄 Download PDF</Text>
        </TouchableOpacity>
      )}
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
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
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
  },
  invoiceCount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  invoiceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  invoiceCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceDetails: {
    flex: 1,
    marginRight: 12,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  invoiceDescription: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  invoiceCardDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 12,
  },
  invoiceCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  invoiceLabel: {
    fontSize: 13,
    color: '#666',
  },
  invoiceAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  invoiceValue: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '500',
  },
  downloadButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  downloadButtonText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '500',
  },
});

export default BillingScreen;
