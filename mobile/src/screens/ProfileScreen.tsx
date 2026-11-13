import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import * as SecureStore from 'expo-secure-store';

import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Profile — mobile counterpart of the desktop `/profile` page: account overview,
 * change your own password, and this device. Open to every role.
 *
 * Same rules as desktop: admins and managers can set a new password for
 * themselves (`PATCH /auth/users/:id/reset-password`, which the backend limits
 * to admin/manager); cashiers are told to ask their store admin. Editing name /
 * email / phone has no backend endpoint yet, so it is read-only on both apps.
 */
export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const user = useSelector((s: RootState) => s.auth.user);

  const canChangePassword = user?.role === 'admin' || user?.role === 'manager' || !!user?.is_super_admin;

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    SecureStore.getItemAsync('device_id').then(v => setDeviceId(v ?? '')).catch(() => {});
  }, []);

  const fullName = user?.first_name
    ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`
    : user?.email ?? 'User';
  const initials = (() => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : fullName.slice(0, 2)).toUpperCase();
  })();

  const handleChangePassword = async () => {
    setError(null);
    if (!user) return;
    if (pw.length < 6) return setError('Password must be at least 6 characters.');
    if (pw !== confirm) return setError('Passwords do not match.');
    if (!ApiClient.getOnlineStatus()) return setError('You are offline. Connect to change your password.');

    setSaving(true);
    try {
      const res: any = await ApiClient.patch(`/auth/users/${user.id}/reset-password`, { password: pw });
      // ApiClient echoes the request body when offline; the server answers with a message.
      if (!res || !(res.message ?? res?.data?.message)) {
        throw new Error('You are offline. Connect to change your password.');
      }
      setPw('');
      setConfirm('');
      Alert.alert('Password updated', 'Use the new password the next time you sign in.');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not update the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Account" title="Profile" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Your password can only be changed while connected." />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Account overview */}
          <View style={styles.card}>
            <View style={styles.identity}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
                {!!user?.email && <Text style={styles.muted} numberOfLines={1}>{user.email}</Text>}
              </View>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{user?.is_super_admin ? 'Super admin' : user?.role ?? '—'}</Text>
              </View>
            </View>
            <View style={styles.details}>
              <Detail label="Branch" value={user?.branch_name || '—'} />
              <Detail label="Store" value={user?.store_id || '—'} />
              <Detail label="Account ID" value={user?.id || '—'} mono />
            </View>
            <View style={styles.noteRow}>
              <MaterialCommunityIcons name="lock-outline" size={14} color={C.muted} />
              <Text style={styles.muted}>Editing your name, email and phone isn't available yet.</Text>
            </View>
          </View>

          {/* Security */}
          <Text style={styles.section}>Change password</Text>
          <View style={styles.card}>
            {canChangePassword ? (
              <>
                <TextInput
                  label="New password"
                  value={pw}
                  onChangeText={setPw}
                  mode="outlined"
                  dense
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="At least 6 characters"
                  style={styles.input}
                  editable={!saving}
                  right={<TextInput.Icon icon={show ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShow(v => !v)} />}
                />
                <TextInput
                  label="Confirm new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  mode="outlined"
                  dense
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { marginTop: 10 }]}
                  editable={!saving}
                />
                <Text style={[styles.muted, { marginTop: 10, lineHeight: 17 }]}>
                  This sets a new password directly — it doesn't ask for your current one.
                </Text>
                {error && <Text style={styles.error}>{error}</Text>}
                <Button mode="contained" buttonColor={C.accent} onPress={handleChangePassword} loading={saving}
                  disabled={saving || !online || !pw || !confirm} style={{ marginTop: 12 }}>
                  Update password
                </Button>
              </>
            ) : (
              <View style={styles.noteRow}>
                <MaterialCommunityIcons name="shield-check-outline" size={18} color={C.muted} />
                <Text style={[styles.body, { flex: 1 }]}>
                  Ask your store admin to reset your password. For security, cashiers can't change their own
                  password here.
                </Text>
              </View>
            )}
          </View>

          {/* Device */}
          <Text style={styles.section}>This device</Text>
          <View style={styles.card}>
            <Detail label="Device ID" value={deviceId ? `${deviceId.slice(0, 18)}…` : '—'} mono />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Connection</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.dot, { backgroundColor: online ? C.green : C.amber }]} />
                <Text style={styles.detailValue}>{online ? 'Online' : 'Offline'}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && { fontSize: 11 }]} numberOfLines={1} selectable>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  muted: { fontSize: 12, color: C.muted },
  body: { fontSize: 13, lineHeight: 19, color: C.ink },
  error: { fontSize: 13, color: C.red, marginTop: 10 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  input: { backgroundColor: C.card },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: C.violetBg },
  avatarText: { fontSize: 17, fontWeight: '800', color: C.accent },
  name: { fontSize: 17, fontWeight: '800', color: C.ink },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.violetBg },
  roleText: { fontSize: 11, fontWeight: '700', color: C.accent, textTransform: 'capitalize' },
  details: { marginTop: 14, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 7 },
  detailLabel: { fontSize: 12, color: C.muted },
  detailValue: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: C.ink, textAlign: 'right' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
