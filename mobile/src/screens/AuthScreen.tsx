import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import * as Biometrics from 'expo-biometrics';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import ApiClient from '../services/ApiClient';
import { useDispatch } from 'react-redux';
import { loginSuccess, enableBiometric, setError } from '../redux/slices/authSlice';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await Biometrics.hasHardwareAsync();
      const enrolled = await Biometrics.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
    } catch (error) {
      console.error('Biometric check failed:', error);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      setLoading(true);

      // Authenticate with biometric
      const result = await Biometrics.authenticateAsync({
        disableDeviceFallback: false,
        reason: 'Authenticate to access POS'
      });

      if (result.success) {
        // Get device ID
        const deviceId = Device.deviceId || (await SecureStore.getItemAsync('device_id')) || 'unknown';

        // Get stored biometric token
        const biometricToken = await SecureStore.getItemAsync('biometric_token_hash');

        if (!biometricToken) {
          Alert.alert('Error', 'Biometric token not configured. Please contact admin.');
          return;
        }

        // Verify with backend
        const response = await ApiClient.post('/auth/biometric-verify', {
          biometric_token_hash: biometricToken,
          device_id: deviceId
        });

        // Save tokens
        await Promise.all([
          SecureStore.setItemAsync('access_token', response.access_token),
          SecureStore.setItemAsync('refresh_token', response.refresh_token),
          SecureStore.setItemAsync('device_id', deviceId)
        ]);

        // Update Redux
        dispatch(
          loginSuccess({
            user: response.user,
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            device_id: deviceId
          })
        );

        dispatch(enableBiometric({ device_id: deviceId }));
      }
    } catch (error) {
      console.error('Biometric login failed:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Biometric login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = async () => {
    try {
      if (!email || !password) {
        Alert.alert('Error', 'Please enter email and password');
        return;
      }

      setLoading(true);

      // For demo: generate biometric token
      const biometricToken = `token_${Date.now()}`;
      const deviceId = Device.deviceId || 'unknown';

      // Set biometric token
      await SecureStore.setItemAsync('biometric_token_hash', biometricToken);
      await SecureStore.setItemAsync('device_id', deviceId);

      // Mock login response (replace with actual API call)
      const response = {
        access_token: 'mock_token_' + Date.now(),
        refresh_token: 'mock_refresh_' + Date.now(),
        user: {
          id: 'user_123',
          email: email,
          first_name: 'John',
          role: 'cashier',
          store_id: 'store_001'
        }
      };

      // Save tokens
      await Promise.all([
        SecureStore.setItemAsync('access_token', response.access_token),
        SecureStore.setItemAsync('refresh_token', response.refresh_token)
      ]);

      // Update Redux
      dispatch(
        loginSuccess({
          user: response.user,
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          device_id: deviceId
        })
      );
    } catch (error) {
      console.error('Login failed:', error);
      dispatch(setError(error instanceof Error ? error.message : 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="displaySmall" style={styles.title}>
        Mobile POS
      </Text>

      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        editable={!loading}
      />

      <TextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        editable={!loading}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <>
          <Button
            mode="contained"
            onPress={handleManualLogin}
            style={styles.button}
            disabled={loading}
          >
            Login
          </Button>

          {biometricAvailable && (
            <Button
              mode="outlined"
              onPress={handleBiometricLogin}
              style={styles.button}
              disabled={loading}
            >
              Login with Biometric
            </Button>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center'
  },
  title: {
    textAlign: 'center',
    marginBottom: 30,
    color: '#6750A4'
  },
  input: {
    marginBottom: 16
  },
  button: {
    marginVertical: 8
  },
  loader: {
    marginVertical: 20
  }
});
