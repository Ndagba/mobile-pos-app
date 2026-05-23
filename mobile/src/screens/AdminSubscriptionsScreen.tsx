import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  Alert,
  Modal,
} from 'react-native';
import { ApiClient } from '../services/ApiClient';
import { Subscription, SubscriptionPlan } from '../redux/slices/subscriptionSlice';
import { useFocusEffect } from '@react-navigation/native';

interface SubscriptionWithStore extends Subscription {
  store?: {
    id: string;
    name: string;
  };
}

const AdminSubscriptionsScreen = ({ navigation }: any) => {
  const [api] = useState(() => new ApiClient());
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithStore[]>([]);
  const [filteredSubs, setFilteredSubs] = useState<SubscriptionWithStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<SubscriptionWithStore | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [action, setAction] = useState<'extend' | 'change-plan' | 'activate' | 'deactivate' | 'create' | null>(null);
  const [modalData, setModalData] = useState<any>({});
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadSubscriptions();
      loadPlans();
    }, [])
  );

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      // ApiClient.get unwraps to response.data.data directly, so this is
      // already the subscription array (or null on error).
      const subs = (await api.get<SubscriptionWithStore[]>('/admin/subscriptions?limit=100')) || [];
      setSubscriptions(subs);
      filterSubscriptions(searchText, selectedStatus, subs);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load subscriptions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const list = (await api.get<SubscriptionPlan[]>('/subscriptions/plans')) || [];
      setPlans(list);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  const filterSubscriptions = (
    search: string,
    status: string | null,
    subs: SubscriptionWithStore[]
  ) => {
    let filtered = subs;

    if (search.trim()) {
      filtered = filtered.filter(
        (sub) =>
          sub.store?.name?.toLowerCase().includes(search.toLowerCase()) ||
          sub.store?.id?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (status) {
      filtered = filtered.filter((sub) => sub.status === status);
    }

    setFilteredSubs(filtered);
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    filterSubscriptions(text, selectedStatus, subscriptions);
  };

  const handleStatusFilter = (status: string | null) => {
    setSelectedStatus(status);
    filterSubscriptions(searchText, status, subscriptions);
  };

  const handleExtendTrial = async () => {
    if (!selectedSub || !modalData.days) {
      Alert.alert('Error', 'Please enter number of days');
      return;
    }

    try {
      await api.post(`/admin/subscriptions/${selectedSub.store_id}/extend-trial`, {
        days: parseInt(modalData.days),
        reason: modalData.reason,
      });
      Alert.alert('Success', `Trial extended by ${modalData.days} days`);
      setShowModal(false);
      loadSubscriptions();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to extend trial');
    }
  };

  const handleActivate = async () => {
    if (!selectedSub) return;

    try {
      await api.post(`/admin/subscriptions/${selectedSub.store_id}/activate`, {
        reason: modalData.reason,
      });
      Alert.alert('Success', 'Subscription activated');
      setShowModal(false);
      loadSubscriptions();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to activate');
    }
  };

  const handleDeactivate = async () => {
    if (!selectedSub) return;

    Alert.alert('Confirm', 'Deactivate this subscription?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Deactivate',
        onPress: async () => {
          try {
            await api.post(`/admin/subscriptions/${selectedSub.store_id}/deactivate`, {
              reason: modalData.reason,
            });
            Alert.alert('Success', 'Subscription deactivated');
            setShowModal(false);
            loadSubscriptions();
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to deactivate');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleCreate = async () => {
    if (!modalData.storeId || !modalData.planSlug) {
      Alert.alert('Error', 'Store ID and plan are required');
      return;
    }
    const months = parseInt(modalData.durationMonths || '1', 10);
    if (!Number.isFinite(months) || months < 1) {
      Alert.alert('Error', 'Duration months must be at least 1');
      return;
    }
    try {
      await api.post('/admin/subscriptions', {
        storeId: modalData.storeId.trim(),
        planSlug: modalData.planSlug,
        durationMonths: months,
        reason: modalData.reason,
      });
      Alert.alert('Success', 'Subscription created');
      setShowModal(false);
      setAction(null);
      setModalData({});
      loadSubscriptions();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.response?.data?.error || 'Failed to create subscription'
      );
    }
  };

  const renderSubscriptionItem = (sub: SubscriptionWithStore) => (
    <TouchableOpacity
      style={styles.subItem}
      onPress={() => {
        setSelectedSub(sub);
        setShowModal(true);
        setAction(null);
      }}
    >
      <View style={styles.subItemHeader}>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{sub.store?.name}</Text>
          <Text style={styles.storeId}>{sub.store?.id}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                sub.status === 'active'
                  ? '#10b981'
                  : sub.status === 'expired'
                  ? '#ef4444'
                  : '#f59e0b',
            },
          ]}
        >
          <Text style={styles.statusText}>{sub.status}</Text>
        </View>
      </View>

      <View style={styles.subItemDetails}>
        <DetailRow label="Plan" value={sub.plan?.name} />
        <DetailRow label="Expires" value={formatDate(sub.billing_cycle_end)} />
        {sub.trial_ends_at && (
          <DetailRow label="Trial Ends" value={formatDate(sub.trial_ends_at)} />
        )}
      </View>

      <View style={styles.actions}>
        {sub.trial_ends_at && sub.status === 'active' && (
          <ActionButton
            label="Extend Trial"
            onPress={() => {
              setSelectedSub(sub);
              setAction('extend');
              setShowModal(true);
              setModalData({});
            }}
            color="#2563eb"
          />
        )}
        {sub.status === 'expired' && (
          <ActionButton
            label="Activate"
            onPress={() => {
              setSelectedSub(sub);
              setAction('activate');
              setShowModal(true);
              setModalData({});
            }}
            color="#10b981"
          />
        )}
        {sub.status === 'active' && (
          <ActionButton
            label="Deactivate"
            onPress={() => {
              setSelectedSub(sub);
              setAction('deactivate');
              setShowModal(true);
              setModalData({});
            }}
            color="#ef4444"
          />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Manage Subscriptions</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => {
            setSelectedSub(null);
            setAction('create');
            setShowModal(true);
            setModalData({});
          }}
        >
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by store name or ID..."
          value={searchText}
          onChangeText={handleSearch}
          placeholderTextColor="#999"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterTabs}
        >
          <FilterTab
            label="All"
            active={selectedStatus === null}
            onPress={() => handleStatusFilter(null)}
          />
          <FilterTab
            label="Active"
            active={selectedStatus === 'active'}
            onPress={() => handleStatusFilter('active')}
          />
          <FilterTab
            label="Expired"
            active={selectedStatus === 'expired'}
            onPress={() => handleStatusFilter('expired')}
          />
          <FilterTab
            label="Past Due"
            active={selectedStatus === 'past_due'}
            onPress={() => handleStatusFilter('past_due')}
          />
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading subscriptions...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSubs}
          renderItem={({ item }) => renderSubscriptionItem(item)}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No subscriptions found</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Action Modal */}
      <Modal
        visible={showModal && action !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {action === 'extend'
                  ? 'Extend Trial'
                  : action === 'activate'
                  ? 'Activate Subscription'
                  : action === 'deactivate'
                  ? 'Deactivate Subscription'
                  : 'Create Subscription'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {action === 'extend' && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Number of days to extend"
                    keyboardType="number-pad"
                    value={modalData.days || ''}
                    onChangeText={(text) =>
                      setModalData({ ...modalData, days: text })
                    }
                  />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Reason (optional)"
                    multiline
                    value={modalData.reason || ''}
                    onChangeText={(text) =>
                      setModalData({ ...modalData, reason: text })
                    }
                  />
                </>
              )}

              {action === 'activate' && (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Reason for activation (optional)"
                  multiline
                  value={modalData.reason || ''}
                  onChangeText={(text) =>
                    setModalData({ ...modalData, reason: text })
                  }
                />
              )}

              {action === 'deactivate' && (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Reason for deactivation (optional)"
                  multiline
                  value={modalData.reason || ''}
                  onChangeText={(text) =>
                    setModalData({ ...modalData, reason: text })
                  }
                />
              )}

              {action === 'create' && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Store ID"
                    autoCapitalize="none"
                    value={modalData.storeId || ''}
                    onChangeText={(text) =>
                      setModalData({ ...modalData, storeId: text })
                    }
                  />
                  <Text style={styles.fieldLabel}>Plan</Text>
                  <View style={styles.planRow}>
                    {(['business', 'pro'] as const).map((slug) => {
                      const active = modalData.planSlug === slug;
                      return (
                        <TouchableOpacity
                          key={slug}
                          style={[
                            styles.planChip,
                            active && styles.planChipActive,
                          ]}
                          onPress={() =>
                            setModalData({ ...modalData, planSlug: slug })
                          }
                        >
                          <Text
                            style={[
                              styles.planChipText,
                              active && styles.planChipTextActive,
                            ]}
                          >
                            {slug === 'business' ? 'Business' : 'Pro'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Duration in months (default 1)"
                    keyboardType="number-pad"
                    value={modalData.durationMonths || ''}
                    onChangeText={(text) =>
                      setModalData({ ...modalData, durationMonths: text })
                    }
                  />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Reason (e.g. offline payment, special deal)"
                    multiline
                    value={modalData.reason || ''}
                    onChangeText={(text) =>
                      setModalData({ ...modalData, reason: text })
                    }
                  />
                </>
              )}

              {selectedSub && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Subscription Details</Text>
                  <DetailRow label="Store" value={selectedSub.store?.name} />
                  <DetailRow label="Plan" value={selectedSub.plan?.name} />
                  <DetailRow label="Status" value={selectedSub.status} />
                  <DetailRow
                    label="Expires"
                    value={formatDate(selectedSub.billing_cycle_end)}
                  />
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => {
                  if (action === 'extend') handleExtendTrial();
                  else if (action === 'activate') handleActivate();
                  else if (action === 'deactivate') handleDeactivate();
                  else if (action === 'create') handleCreate();
                }}
              >
                <Text style={styles.confirmButtonText}>
                  {action === 'extend'
                    ? 'Extend'
                    : action === 'activate'
                    ? 'Activate'
                    : action === 'deactivate'
                    ? 'Deactivate'
                    : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal
        visible={showModal && action === null && selectedSub !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowModal(false);
          setSelectedSub(null);
        }}
      >
        <View style={styles.detailsOverlay}>
          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.detailsTitle}>{selectedSub?.store?.name}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailsBody}>
              <DetailRow label="Store ID" value={selectedSub?.store?.id} />
              <DetailRow label="Plan" value={selectedSub?.plan?.name} />
              <DetailRow label="Status" value={selectedSub?.status} />
              <DetailRow
                label="Created"
                value={formatDate(selectedSub?.created_at || '')}
              />
              <DetailRow
                label="Billing Start"
                value={formatDate(selectedSub?.billing_cycle_start || '')}
              />
              <DetailRow
                label="Billing End"
                value={formatDate(selectedSub?.billing_cycle_end || '')}
              />
              <DetailRow
                label="Auto Renew"
                value={selectedSub?.auto_renew ? 'Yes' : 'No'}
              />

              {selectedSub?.trial_ends_at && (
                <DetailRow
                  label="Trial Ends"
                  value={formatDate(selectedSub.trial_ends_at)}
                />
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeDetailsButton}
              onPress={() => {
                setShowModal(false);
                setSelectedSub(null);
              }}
            >
              <Text style={styles.closeDetailsButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const DetailRow = ({ label, value }: { label: string; value?: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}:</Text>
    <Text style={styles.detailValue}>{value || '-'}</Text>
  </View>
);

const FilterTab = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    style={[styles.filterTab, active && styles.filterTabActive]}
    onPress={onPress}
  >
    <Text
      style={[styles.filterTabText, active && styles.filterTabTextActive]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const ActionButton = ({
  label,
  onPress,
  color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) => (
  <TouchableOpacity
    style={[styles.actionButton, { borderColor: color }]}
    onPress={onPress}
  >
    <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    color: '#1f2937',
  },
  filterTabs: {
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterTabActive: {
    backgroundColor: '#2563eb',
  },
  filterTabText: {
    fontSize: 12,
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  subItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  subItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  storeId: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  subItemDetails: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 12,
    color: '#1f2937',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeButton: {
    fontSize: 24,
    color: '#999',
  },
  modalBody: {
    padding: 16,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#1f2937',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  planRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  planChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  planChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  planChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  planChipTextActive: {
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  detailsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '80%',
    width: '100%',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  detailsBody: {
    padding: 16,
  },
  closeDetailsButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  closeDetailsButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default AdminSubscriptionsScreen;
