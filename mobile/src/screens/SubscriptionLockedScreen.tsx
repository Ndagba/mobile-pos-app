import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { logout } from '../redux/slices/authSlice';
import { setSubscriptionAccess } from '../redux/slices/subscriptionSlice';
import ApiClient from '../services/ApiClient';
import { C, S, R } from '../theme';

const SubscriptionLockedScreen = ({ navigation }: any) => {
  const dispatch = useDispatch();
  const auth = useSelector((state: RootState) => state.auth);
  const role = auth.user?.role ?? 'cashier';
  const canRenew = role === 'admin' || role === 'manager';

  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState<string | null>(null);

  // Ask the server whether the subscription has come back to life. If it has,
  // flipping accessActive lets App.tsx swap back to the authenticated root.
  const handleRecheck = async () => {
    setRechecking(true);
    setRecheckError(null);
    try {
      const sub: any = await ApiClient.get('/subscriptions');
      dispatch(setSubscriptionAccess({ active: !!sub?.is_active }));
    } catch (error: any) {
      if (error?.response?.status === 404) {
        dispatch(setSubscriptionAccess({ active: false }));
        setRecheckError('No active subscription found for this store.');
      } else if (!error?.response) {
        setRecheckError('No connection. Check your network and try again.');
      } else {
        setRecheckError('Could not check status. Please try again.');
      }
    } finally {
      setRechecking(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name="lock-alert" size={48} color={C.red} />
      </View>

      <Text style={styles.title}>Subscription Inactive</Text>

      <Text style={styles.body}>
        Your store's JAYPOS subscription has expired. Access is paused for the
        whole store until the subscription is renewed.
      </Text>

      {canRenew ? (
        <Text style={styles.bodyMuted}>
          As {role === 'admin' ? 'an administrator' : 'a manager'}, you can
          renew now to restore access for everyone.
        </Text>
      ) : (
        <Text style={styles.bodyMuted}>
          Please contact your store administrator to renew the subscription.
        </Text>
      )}

      {recheckError && <Text style={styles.errorText}>{recheckError}</Text>}

      <View style={styles.actions}>
        {canRenew && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('OnboardingPayment')}
            disabled={rechecking}
          >
            <Text style={styles.primaryButtonText}>Renew Subscription</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleRecheck}
          disabled={rechecking}
        >
          {rechecking ? (
            <ActivityIndicator color={C.accent} />
          ) : (
            <Text style={styles.secondaryButtonText}>Re-check Status</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => dispatch(logout())}
          disabled={rechecking}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
    paddingHorizontal: S.xl,
    paddingVertical: S.xxl * 2,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: C.redBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: S.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    marginBottom: S.md,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: C.ink,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: S.md,
  },
  bodyMuted: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: S.lg,
  },
  errorText: {
    fontSize: 13,
    color: C.red,
    textAlign: 'center',
    marginBottom: S.md,
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    marginTop: S.md,
  },
  primaryButton: {
    backgroundColor: C.accent,
    paddingVertical: S.lg,
    borderRadius: R.sm,
    alignItems: 'center',
    marginBottom: S.md,
  },
  primaryButtonText: {
    color: C.accentFg,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: C.accent,
    paddingVertical: S.lg,
    borderRadius: R.sm,
    alignItems: 'center',
    marginBottom: S.md,
  },
  secondaryButtonText: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    paddingVertical: S.md,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: C.muted,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default SubscriptionLockedScreen;
