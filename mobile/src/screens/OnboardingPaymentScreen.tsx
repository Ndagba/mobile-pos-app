import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  WebView,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import {
  fetchPlansStart,
  fetchPlansSuccess,
  fetchPlansError,
  initializeOnboardingStart,
  initializeOnboardingSuccess,
  initializeOnboardingError,
  verifyPaymentStart,
  verifyPaymentSuccess,
  verifyPaymentError,
} from '../redux/slices/subscriptionSlice';
import { ApiClient } from '../services/ApiClient';
import { getSubscriptionService } from '../services/SubscriptionService';
import { SubscriptionPlan } from '../redux/slices/subscriptionSlice';

const OnboardingPaymentScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const {
    plans,
    plansLoading,
    paymentInitializing,
    paymentAuthorizationUrl,
    paymentReference,
    loading,
  } = useSelector((state: RootState) => state.subscription);

  const [api] = useState(() => new ApiClient());
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [showPaystackWeb, setShowPaystackWeb] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    dispatch(fetchPlansStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      const plansData = await subscriptionService.getPlans();
      dispatch(fetchPlansSuccess(plansData));
    } catch (error: any) {
      dispatch(fetchPlansError(error.message));
      Alert.alert('Error', 'Failed to load subscription plans');
    }
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
  };

  const handleProceedToPayment = async () => {
    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a plan');
      return;
    }

    dispatch(initializeOnboardingStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      const paymentData = await subscriptionService.initializeOnboarding(
        selectedPlan.slug as 'business' | 'pro'
      );

      dispatch(initializeOnboardingSuccess(paymentData));
      setShowPaystackWeb(true);
    } catch (error: any) {
      dispatch(initializeOnboardingError(error.message));
      Alert.alert('Error', 'Failed to initialize payment. Please try again.');
    }
  };

  const handlePaystackNavigation = (event: any) => {
    const { url } = event;

    // Check if payment was successful (Paystack redirects to callback URL)
    if (url.includes('callback') || url.includes('close')) {
      setShowPaystackWeb(false);

      // Check if we have a reference (payment was successful)
      if (paymentReference && selectedPlan) {
        verifyPayment();
      }
    }
  };

  const verifyPayment = async () => {
    if (!paymentReference || !selectedPlan) return;

    setVerifying(true);
    dispatch(verifyPaymentStart());

    try {
      const subscriptionService = getSubscriptionService(api);
      const subscription = await subscriptionService.verifyOnboardingPayment(
        paymentReference,
        selectedPlan.slug as 'business' | 'pro'
      );

      dispatch(verifyPaymentSuccess(subscription));
      setVerifying(false);

      Alert.alert(
        'Success',
        'Your subscription is now active! You have 2 months of service.',
        [
          {
            text: 'Continue',
            onPress: () => navigation.navigate('Dashboard'),
          },
        ]
      );
    } catch (error: any) {
      dispatch(verifyPaymentError(error.message));
      setVerifying(false);
      Alert.alert('Error', 'Failed to verify payment. Please contact support.');
    }
  };

  if (showPaystackWeb && paymentAuthorizationUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.webViewHeader}>
          <TouchableOpacity onPress={() => setShowPaystackWeb(false)}>
            <Text style={styles.closeButton}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.webViewTitle}>Complete Payment</Text>
          <View style={styles.placeholder} />
        </View>
        <WebView
          source={{ uri: paymentAuthorizationUrl }}
          onNavigationStateChange={handlePaystackNavigation}
        />
        {verifying && (
          <View style={styles.verifyingOverlay}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.verifyingText}>Verifying payment...</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
        <Text style={styles.headerSubtitle}>
          ₦50,000 covers 2 months of service
        </Text>
      </View>

      {plansLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : (
        <View style={styles.plansContainer}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={selectedPlan?.id === plan.id}
              onSelect={handleSelectPlan}
            />
          ))}
        </View>
      )}

      {selectedPlan && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Payment Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Plan:</Text>
            <Text style={styles.summaryValue}>{selectedPlan.name}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration:</Text>
            <Text style={styles.summaryValue}>2 Months</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total Amount:</Text>
            <Text style={styles.totalValue}>₦50,000</Text>
          </View>

          <Text style={styles.summaryNote}>
            After 2 months, your subscription will renew monthly at ₦{selectedPlan.monthly_price.toLocaleString()}/month
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.paymentButton,
            !selectedPlan && styles.paymentButtonDisabled,
          ]}
          onPress={handleProceedToPayment}
          disabled={!selectedPlan || paymentInitializing}
        >
          {paymentInitializing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.paymentButtonText}>Proceed to Payment</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={paymentInitializing}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const PlanCard = ({
  plan,
  selected,
  onSelect,
}: {
  plan: SubscriptionPlan;
  selected: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
}) => (
  <TouchableOpacity
    style={[styles.planCard, selected && styles.planCardSelected]}
    onPress={() => onSelect(plan)}
  >
    <View style={styles.planHeader}>
      <Text style={[styles.planName, selected && styles.planNameSelected]}>
        {plan.name}
      </Text>
      {selected && <Text style={styles.selectedBadge}>✓ Selected</Text>}
    </View>

    <Text style={styles.planPrice}>₦{plan.monthly_price.toLocaleString()}/mo</Text>

    <View style={styles.planFeatures}>
      {plan.max_branches ? (
        <Text style={styles.planFeature}>
          • Up to {plan.max_branches} branch{plan.max_branches > 1 ? 'es' : ''}
        </Text>
      ) : (
        <Text style={styles.planFeature}>• Unlimited branches</Text>
      )}
      <Text style={styles.planFeature}>• Full feature access</Text>
      <Text style={styles.planFeature}>• Priority support</Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2563eb',
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#dbeafe',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  plansContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  planCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#f0f9ff',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  planNameSelected: {
    color: '#2563eb',
  },
  selectedBadge: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 12,
  },
  planFeatures: {
    marginTop: 12,
  },
  planFeature: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  summaryNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  paymentButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentButtonDisabled: {
    backgroundColor: '#ccc',
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  webViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
    padding: 8,
  },
  webViewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  placeholder: {
    width: 40,
  },
  verifyingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyingText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 14,
  },
});

export default OnboardingPaymentScreen;
