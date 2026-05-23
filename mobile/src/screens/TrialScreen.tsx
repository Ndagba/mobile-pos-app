import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import {
  fetchSubscriptionStart,
  fetchSubscriptionSuccess,
  fetchSubscriptionError,
  startTrialStart,
  startTrialSuccess,
  startTrialError,
} from '../redux/slices/subscriptionSlice';
import { ApiClient } from '../services/ApiClient';
import { getSubscriptionService } from '../services/SubscriptionService';

const TrialScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const { subscription, trialDaysLeft, loading } = useSelector(
    (state: RootState) => state.subscription
  );
  const { user } = useSelector((state: RootState) => state.auth);
  const [api] = useState(() => new ApiClient());

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    dispatch(fetchSubscriptionStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      const sub = await subscriptionService.getSubscription();

      if (sub) {
        dispatch(fetchSubscriptionSuccess(sub));
      } else {
        // No subscription yet, can start trial
        dispatch(fetchSubscriptionError(''));
      }
    } catch (error: any) {
      dispatch(fetchSubscriptionError(error.message));
    }
  };

  const handleStartTrial = async () => {
    dispatch(startTrialStart());
    try {
      const subscriptionService = getSubscriptionService(api);
      const trial = await subscriptionService.startTrial();
      dispatch(startTrialSuccess(trial));
    } catch (error: any) {
      dispatch(startTrialError(error.message));
    }
  };

  const handleUpgrade = () => {
    navigation.navigate('OnboardingPayment');
  };

  // If subscription exists and active, show trial countdown
  if (subscription && trialDaysLeft !== null && trialDaysLeft > 0) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Free Trial</Text>
          <Text style={styles.headerSubtitle}>Your 14-day trial is active</Text>
        </View>

        <View style={styles.trialCard}>
          <View style={styles.daysLeftContainer}>
            <Text style={styles.daysLeftNumber}>{trialDaysLeft}</Text>
            <Text style={styles.daysLeftLabel}>Days Left</Text>
          </View>

          <Text style={styles.trialInfo}>
            Your trial period expires on {new Date(subscription.trial_ends_at || '').toLocaleDateString()}
          </Text>

          <View style={styles.featuresContainer}>
            <Text style={styles.featuresTitle}>Included Features</Text>
            <FeatureItem label="Transaction Management" />
            <FeatureItem label="Inventory Management" />
            <FeatureItem label="Customer Management" />
            <FeatureItem label="Basic Analytics" />
            <FeatureItem label="Single Branch" />
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.upgradeButtonText}>
                Upgrade to Business or Pro
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.upgradeHint}>
            After trial ends, upgrade to continue using MobilePOS
          </Text>
        </View>
      </ScrollView>
    );
  }

  // No subscription yet, show start trial button
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Welcome to MobilePOS</Text>
        <Text style={styles.headerSubtitle}>Start your 14-day free trial</Text>
      </View>

      <View style={styles.emptyStateCard}>
        <Text style={styles.emptyStateTitle}>Free Trial Available</Text>
        <Text style={styles.emptyStateText}>
          Get 14 days free access to all features. No credit card required.
        </Text>

        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle}>You'll get access to:</Text>
          <FeatureItem label="Transaction Management" />
          <FeatureItem label="Inventory Management" />
          <FeatureItem label="Customer Management" />
          <FeatureItem label="Basic Analytics" />
          <FeatureItem label="Single Branch" />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startTrialButton}
          onPress={handleStartTrial}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.startTrialButtonText}>Start Free Trial</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={handleUpgrade}
          disabled={loading}
        >
          <Text style={styles.upgradeButtonText}>Or Upgrade to Paid Plan</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const FeatureItem = ({ label }: { label: string }) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureCheckmark}>✓</Text>
    <Text style={styles.featureLabel}>{label}</Text>
  </View>
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
  trialCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  daysLeftContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  daysLeftNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  daysLeftLabel: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  trialInfo: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyStateCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  featuresContainer: {
    marginTop: 20,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureCheckmark: {
    fontSize: 18,
    color: '#10b981',
    marginRight: 12,
    fontWeight: 'bold',
  },
  featureLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
  },
  startTrialButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  startTrialButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  upgradeHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
  },
});

export default TrialScreen;
