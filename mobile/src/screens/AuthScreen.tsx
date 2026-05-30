import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, Animated, TextInput as RNTextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Svg, {
  Rect, G, Path, Circle, Text as SvgText,
  Defs, LinearGradient as SvgGrad, Stop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useDispatch } from 'react-redux';
import { loginSuccess, enableBiometric } from '../redux/slices/authSlice';
import ApiClient from '../services/ApiClient';
import { C, R, S } from '../theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/v1';

// ─── JayPOS Logo mark ─────────────────────────────────────────
const JayPOSLogo = ({ size = 84 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 80 80">
    <Defs>
      <SvgGrad id="logo-bg" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={C.accent} />
        <Stop offset="1" stopColor={C.accent2} />
      </SvgGrad>
      <SvgGrad id="logo-gloss" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
        <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
      </SvgGrad>
    </Defs>
    {/* Squircle */}
    <Rect width="80" height="80" rx="22" fill="url(#logo-bg)" />
    <Rect width="80" height="80" rx="22" fill="url(#logo-gloss)" />
    {/* Cart watermark */}
    <G transform="translate(11, 11) scale(2.55)" opacity={0.22}>
      <Path
        d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"
        stroke="#FFFFFF" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        strokeWidth={2.4}
      />
      <Circle cx="9" cy="20" r="1.4" fill="#FFFFFF" />
      <Circle cx="18" cy="20" r="1.4" fill="#FFFFFF" />
    </G>
    {/* JP letters */}
    <SvgText
      x="40" y="54"
      textAnchor="middle"
      fontSize={34}
      fontWeight="800"
      fill="#FFFFFF"
    >JP</SvgText>
  </Svg>
);

// ─── Fingerprint icon ─────────────────────────────────────────
const FingerprintIcon = ({ size = 32, color = C.accent }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 11v4a3 3 0 0 1-3 3" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M8 11a4 4 0 0 1 8 0v3a8 8 0 0 1-1 4" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 14c0-3.87 3.13-7 7-7s7 3.13 7 7v2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3 11a9 9 0 0 1 9-9 9 9 0 0 1 8 4.7" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M16 20a8 8 0 0 1-9-2" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ─── Floating-label text field ────────────────────────────────
function FloatingField({
  label, value, onChangeText, iconName,
  secureTextEntry, onToggleSecure,
  keyboardType, editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  iconName?: string;
  secureTextEntry?: boolean;
  onToggleSecure?: () => void;
  keyboardType?: any;
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const anim = useRef(new Animated.Value(value.length > 0 ? 1 : 0)).current;
  const floated = focused || value.length > 0;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: floated ? 1 : 0,
      duration: 130,
      useNativeDriver: false,
    }).start();
  }, [floated]);

  const labelTop  = anim.interpolate({ inputRange: [0, 1], outputRange: [17, 6] });
  const labelSize = anim.interpolate({ inputRange: [0, 1], outputRange: [15, 10] });

  return (
    <View style={[ff.wrap, { borderColor: focused ? C.accent : C.border }]}>
      {iconName && (
        <View style={ff.icon}>
          <MaterialCommunityIcons
            name={iconName as any} size={18}
            color={focused ? C.accent : C.muted}
          />
        </View>
      )}
      <Animated.Text
        style={[
          ff.label,
          {
            top: labelTop,
            fontSize: labelSize,
            color: focused ? C.accent : C.muted,
            left: iconName ? 46 : 14,
            fontWeight: floated ? '700' : '500',
            letterSpacing: floated ? 0.6 : 0,
            textTransform: floated ? 'uppercase' : 'none',
          } as any,
        ]}
        pointerEvents="none"
      >
        {label}
      </Animated.Text>
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        style={[
          ff.input,
          {
            paddingLeft: iconName ? 46 : 14,
            paddingTop: floated ? 20 : 14,
            color: editable ? C.ink : C.muted,
          },
        ]}
      />
      {onToggleSecure && (
        <TouchableOpacity style={ff.toggle} onPress={onToggleSecure} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons
            name={secureTextEntry ? 'eye-outline' : 'eye-off-outline'}
            size={18} color={C.muted}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const ff = StyleSheet.create({
  wrap: {
    position: 'relative',
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderRadius: R.md,
    minHeight: 56,
    justifyContent: 'center',
  },
  icon: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    position: 'absolute',
    fontFamily: Platform.OS === 'ios' ? undefined : undefined,
    pointerEvents: 'none',
  } as any,
  input: {
    paddingRight: 44,
    paddingBottom: 10,
    fontSize: 15,
    fontWeight: '600',
    color: C.ink,
    height: 56,
  },
  toggle: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});

// ─── Main AuthScreen ──────────────────────────────────────────
export default function AuthScreen() {
  const insets   = useSafeAreaInsets();
  const dispatch = useDispatch();

  // ── Auth state ────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // ── UI state ──────────────────────────────────────────────
  const [bioActive, setBioActive]   = useState(false);
  const pingAnim = useRef(new Animated.Value(0)).current;
  const pingLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    checkBiometricAvailability();
    tryRestoreSession();
  }, []);

  useEffect(() => {
    if (bioActive) {
      pingLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pingAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(pingAnim, { toValue: 0, duration: 0,   useNativeDriver: true }),
        ])
      );
      pingLoop.current.start();
    } else {
      pingLoop.current?.stop();
      pingAnim.setValue(0);
    }
  }, [bioActive]);

  const pingScale   = pingAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] });
  const pingOpacity = pingAnim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.9, 0.35, 0] });

  // ── Biometric availability ────────────────────────────────
  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled   = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
    } catch {}
  };

  // ── Session restore ───────────────────────────────────────
  const tryRestoreSession = async () => {
    try {
      const [token, refreshToken, deviceId, userJson] = await Promise.all([
        SecureStore.getItemAsync('access_token'),
        SecureStore.getItemAsync('refresh_token'),
        SecureStore.getItemAsync('device_id'),
        SecureStore.getItemAsync('auth_user'),
      ]);

      // Restore the saved session straight from local storage — no server
      // call, so the app opens normally even with no internet connection.
      if (token && userJson) {
        const u = JSON.parse(userJson);
        dispatch(loginSuccess({
          user: {
            id:             u.id ?? u.userId,
            email:          u.email ?? '',
            first_name:     u.first_name ?? '',
            role:           u.role ?? 'cashier',
            store_id:       u.store_id ?? u.storeId ?? '',
            branch_id:      u.branch_id ?? u.branchId ?? null,
            branch_name:    u.branch_name ?? null,
            // Preserve the super-admin flag across cached restores —
            // otherwise a returning user loses access to /admin tooling.
            is_super_admin: u.is_super_admin ?? false,
          },
          access_token:  token,
          refresh_token: refreshToken ?? '',
          device_id:     deviceId ?? 'unknown',
        }));
        return;
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  // ── Username + password login ─────────────────────────────
  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Error', 'Please enter your username and password');
      return;
    }
    setLoading(true);
    try {
      const response: any = await ApiClient.post('/auth/login', {
        username: username.trim().toLowerCase(),
        password,
      });

      if (typeof response?.access_token !== 'string' || !response.access_token) {
        throw new Error('Server did not return an access token. Check your network connection and try again.');
      }
      if (typeof response?.refresh_token !== 'string' || !response.refresh_token) {
        throw new Error('Server did not return a refresh token. Check your network connection and try again.');
      }

      const storedDeviceId = await SecureStore.getItemAsync('device_id');
      const deviceId = storedDeviceId ||
        `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const user = {
        ...response.user,
        branch_id:   response.user?.branch_id   ?? null,
        branch_name: response.user?.branch_name ?? null,
      };

      await Promise.all([
        SecureStore.setItemAsync('access_token', response.access_token),
        SecureStore.setItemAsync('refresh_token', response.refresh_token),
        SecureStore.setItemAsync('device_id', deviceId),
        SecureStore.setItemAsync('auth_user', JSON.stringify(user)),
      ]);

      dispatch(loginSuccess({
        user,
        access_token:  response.access_token,
        refresh_token: response.refresh_token,
        device_id:     deviceId,
      }));
    } catch (error: any) {
      const isNetwork = error?.code === 'ERR_NETWORK' ||
                        error?.message?.toLowerCase() === 'network error';
      let msg: string;
      if (isNetwork) {
        msg = `Cannot reach the server.\n\nURL tried: ${API_BASE_URL}\n\nAndroid tip: use your machine's LAN IP, not "localhost"`;
      } else {
        msg = error?.response?.data?.details ||
              error?.response?.data?.message ||
              error?.response?.data?.error ||
              error?.message ||
              'Login failed. Please try again.';
      }
      Alert.alert('Login Error', msg);
      setLoading(false);
    }
  };

  // ── Biometric login ───────────────────────────────────────
  const handleBiometricLogin = async () => {
    setBioActive(true);
    setLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
        promptMessage: 'Authenticate to access JayPOS',
      });

      if (!result.success) {
        setBioActive(false);
        setLoading(false);
        return;
      }

      const deviceId = await SecureStore.getItemAsync('device_id') ||
        `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const biometricToken = await SecureStore.getItemAsync('biometric_token_hash');

      if (!biometricToken) {
        Alert.alert('Setup Required', 'Biometric not configured. Please log in with your username first.');
        setBioActive(false);
        setLoading(false);
        return;
      }

      const response: any = await ApiClient.post('/auth/biometric-verify', {
        biometric_token_hash: biometricToken,
        device_id: deviceId,
      });

      if (typeof response?.access_token !== 'string' || !response.access_token) {
        throw new Error('Biometric verification did not return valid tokens.');
      }

      const user = {
        ...response.user,
        branch_id:   response.user?.branch_id   ?? null,
        branch_name: response.user?.branch_name ?? null,
      };

      await Promise.all([
        SecureStore.setItemAsync('access_token', response.access_token),
        SecureStore.setItemAsync('refresh_token', response.refresh_token),
        SecureStore.setItemAsync('device_id', deviceId),
        SecureStore.setItemAsync('auth_user', JSON.stringify(user)),
      ]);

      dispatch(loginSuccess({
        user,
        access_token:  response.access_token,
        refresh_token: response.refresh_token,
        device_id:     deviceId,
      }));
      dispatch(enableBiometric({ device_id: deviceId }));
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Biometric login failed';
      Alert.alert('Auth Error', msg);
      setBioActive(false);
      setLoading(false);
    }
  };

  // ── Loading / restoring session splash ───────────────────
  if (loading && !bioActive) {
    return (
      <View style={s.splash}>
        <JayPOSLogo size={72} />
        <ActivityIndicator size="small" color={C.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={s.screen}
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Background blobs */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={s.blob1} />
          <View style={s.blob2} />
        </View>

        {/* Logo + wordmark */}
        <View style={s.logoWrap}>
          <JayPOSLogo size={84} />
          <View style={s.wordmark}>
            <Text style={s.wordJay}>Jay</Text>
            <Text style={s.wordPOS}>POS</Text>
          </View>
        </View>

        {/* Welcome */}
        <View style={s.welcomeWrap}>
          <Text style={s.welcomeTitle}>Welcome back</Text>
          <Text style={s.welcomeSub}>Sign in to your store</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <FloatingField
            label="Username"
            value={username}
            onChangeText={setUsername}
            iconName="account-outline"
            editable={!loading}
          />

          <FloatingField
            label="Password"
            value={password}
            onChangeText={setPassword}
            iconName="lock-outline"
            secureTextEntry={!showPw}
            onToggleSecure={() => setShowPw(v => !v)}
            editable={!loading}
          />

          <TouchableOpacity style={s.forgotWrap} onPress={() => Alert.alert('Password Reset', 'Contact your administrator to reset your password.')}>
            <Text style={s.forgot}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Sign in button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[C.accent, C.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.signInBtn}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={s.signInText}>Signing in…</Text>
                </>
              ) : (
                <>
                  <Text style={s.signInText}>Sign in</Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* OR divider */}
          <View style={s.orRow}>
            <View style={s.orLine} />
            <Text style={s.orText}>OR</Text>
            <View style={s.orLine} />
          </View>

          {/* Biometric */}
          {biometricAvailable && (
            <View style={s.bioWrap}>
              <TouchableOpacity
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.8}
                style={[s.bioBtn, bioActive && s.bioBtnActive]}
              >
                {bioActive && (
                  <Animated.View
                    style={[
                      s.bioPing,
                      { transform: [{ scale: pingScale }], opacity: pingOpacity },
                    ]}
                  />
                )}
                <FingerprintIcon size={34} color={C.accent} />
              </TouchableOpacity>
              <Text style={s.bioLabel}>
                {bioActive ? 'Authenticating…' : 'Use Biometric'}
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.version}>JayPOS v2.4.1 · Secured by biometrics & device trust</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  splash: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },

  // blobs
  blob1: {
    position: 'absolute', left: -60, top: -40,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: C.accent + '18',
  },
  blob2: {
    position: 'absolute', right: -60, bottom: 60,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: C.accent2 + '12',
  },

  // logo
  logoWrap: {
    alignItems: 'center',
    marginTop: 20,
    gap: 14,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 0,
  },
  wordJay: {
    fontSize: 28,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
  },
  wordPOS: {
    fontSize: 28,
    fontWeight: '800',
    color: C.accent,
    letterSpacing: -0.5,
  },

  // welcome
  welcomeWrap: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  welcomeTitle: {
    fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3,
    textAlign: 'center',
  },
  welcomeSub: {
    fontSize: 13, color: C.muted, marginTop: 4, textAlign: 'center',
  },

  // form
  form: { marginTop: 24, gap: 12 },
  forgotWrap: { alignItems: 'flex-end', marginTop: -4 },
  forgot: { fontSize: 12, fontWeight: '600', color: C.accent },

  // sign in
  signInBtn: {
    borderRadius: R.md,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
    }),
  },
  signInText: {
    color: '#fff', fontSize: 15, fontWeight: '700',
  },

  // OR divider
  orRow: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 4, gap: 12,
  },
  orLine: { flex: 1, height: 1, backgroundColor: C.border },
  orText: {
    fontSize: 10, fontWeight: '700', color: C.muted,
    letterSpacing: 1.6,
  },

  // biometric
  bioWrap: { alignItems: 'center', gap: 10 },
  bioBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.accent + '10',
    borderWidth: 1.5,
    borderColor: C.accent + '33',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  bioBtnActive: {
    backgroundColor: C.accent + '20',
  },
  bioPing: {
    position: 'absolute',
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2,
    borderColor: C.accent + '55',
  },
  bioLabel: {
    fontSize: 12, fontWeight: '600', color: C.ink,
  },

  // footer
  footer: {
    marginTop: 36,
    alignItems: 'center',
    gap: 8,
  },
  switchText: {
    fontSize: 12, fontWeight: '500', color: C.muted, textAlign: 'center',
  },
  version: {
    fontSize: 10, color: C.muted, opacity: 0.65, textAlign: 'center',
  },
});
