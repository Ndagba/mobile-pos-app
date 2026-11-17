import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, Switch, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import {
  BUSINESS_MODE_LABELS,
  OPERATIONAL_PROFILE_SHORT_LABELS,
  type BusinessMode,
  type OperationalProfile,
} from '@jaypos/shared';

import { RootState } from '../redux/store';
import { setStoreSettings, normalizeStoreSettings } from '../redux/slices/settingsSlice';
import ApiClient from '../services/ApiClient';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { C } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Bar / Lounge setup (Bar/Lounge planning, Phase 1). Admin + manager.
 *
 *  - Business mode: admin only, and only until the store's first sale (decision D3).
 *  - Bar settings (business-day cut-off, attendant discount, back-dating, payment
 *    declaration, commission): admin + manager.
 *  - Staff bar profiles: admin assigns Bar Controller / Attendant to cashiers (D16);
 *    managers see the list read-only.
 *
 * Online-only: every write is refused while offline, because ApiClient would
 * otherwise queue a mode / profile change and replay it later.
 */

type Staff = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  role: string;
  operational_profile?: OperationalProfile | null;
};

const MODE_DESCRIPTIONS: Record<BusinessMode, string> = {
  retail: 'Cashiers sell directly at the counter. This is how JayPOS works today.',
  bar: 'Attendants take orders, the Bar Controller releases the drinks and collects the money.',
};

export default function BarSetupScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useDispatch();
  const online = useIsOnline();
  const user = useSelector((s: RootState) => s.auth.user);
  const settings = useSelector((s: RootState) => s.settings.settings);
  const bm = useBusinessMode();
  const isAdmin = user?.role === 'admin' || !!user?.is_super_admin;

  const [savingMode, setSavingMode] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState<string | null>(null);

  // Local form state for bar settings
  const [cutoff, setCutoff] = useState(6);
  const [attendantDiscount, setAttendantDiscount] = useState(false);
  const [backdated, setBackdated] = useState(false);
  const [declaration, setDeclaration] = useState(false);
  const [commissionOn, setCommissionOn] = useState(false);
  const [commissionRate, setCommissionRate] = useState('');

  useEffect(() => {
    if (!settings) return;
    setCutoff(settings.bar_business_day_cutoff_hour ?? 6);
    setAttendantDiscount(!!settings.bar_attendant_discount);
    setBackdated(!!settings.bar_allow_backdated_remittance);
    setDeclaration(!!settings.bar_require_payment_declaration);
    setCommissionOn(!!settings.commission_enabled);
    setCommissionRate(settings.commission_rate != null ? String(settings.commission_rate) : '');
  }, [settings]);

  const errMsg = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;
  const requireOnline = () => {
    if (!ApiClient.getOnlineStatus()) {
      Alert.alert('You are offline', 'Connect to the internet to change bar setup.');
      return false;
    }
    return true;
  };

  const reloadSettings = useCallback(async () => {
    const fresh: any = await ApiClient.get('/settings');
    if (fresh && typeof fresh === 'object') dispatch(setStoreSettings(normalizeStoreSettings(fresh)));
  }, [dispatch]);

  const loadStaff = useCallback(async () => {
    setStaffError(null);
    try {
      const res: any = await ApiClient.get('/auth/users');
      const list: Staff[] = Array.isArray(res) ? res : res?.data ?? [];
      setStaff(list.filter((u) => u.role === 'cashier'));
    } catch (e) {
      setStaffError(errMsg(e, 'Could not load staff.'));
    }
  }, []);

  useEffect(() => {
    reloadSettings().catch(() => {});
  }, [reloadSettings]);

  useEffect(() => {
    if (bm.isBar) loadStaff();
  }, [bm.isBar, loadStaff]);

  // ── Business mode ────────────────────────────────────────────
  const chooseMode = (mode: BusinessMode) => {
    if (mode === bm.mode || !bm.canChangeMode || savingMode) return;
    if (!requireOnline()) return;
    Alert.alert(
      `Switch to ${BUSINESS_MODE_LABELS[mode]}?`,
      mode === 'bar'
        ? 'Cashiers will need a bar profile (Bar Controller or Attendant). Attendants will no longer sell directly. ' +
          'Once this store records its first sale, only JayPOS support can change the mode.'
        : 'Bar screens will be hidden and every cashier sells directly again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setSavingMode(true);
            try {
              await ApiClient.patch('/settings/business-mode', { business_mode: mode });
              await reloadSettings();
            } catch (e) {
              Alert.alert('Could not change mode', errMsg(e, 'Please try again.'));
            } finally {
              setSavingMode(false);
            }
          },
        },
      ]
    );
  };

  // ── Bar settings ─────────────────────────────────────────────
  const saveBarSettings = async () => {
    if (!requireOnline()) return;
    const rate = commissionRate.trim() === '' ? null : Number(commissionRate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      return Alert.alert('Check the commission rate', 'Enter a percentage between 0 and 100.');
    }
    if (commissionOn && (rate === null || rate <= 0)) {
      return Alert.alert('Check the commission rate', 'Set a rate above 0 before turning commission on.');
    }
    setSavingSettings(true);
    try {
      await ApiClient.patch('/settings', {
        bar_business_day_cutoff_hour: cutoff,
        bar_attendant_discount: attendantDiscount,
        bar_allow_backdated_remittance: backdated,
        bar_require_payment_declaration: declaration,
        commission_rate: rate,
        commission_enabled: commissionOn,
      });
      await reloadSettings();
      Alert.alert('Saved', 'Bar settings updated.');
    } catch (e) {
      Alert.alert('Could not save', errMsg(e, 'Please try again.'));
    } finally {
      setSavingSettings(false);
    }
  };

  // ── Profiles ─────────────────────────────────────────────────
  const setProfile = async (member: Staff, profile: OperationalProfile | null) => {
    if ((member.operational_profile ?? null) === profile || profileBusy) return;
    if (!requireOnline()) return;
    setProfileBusy(member.id);
    try {
      await ApiClient.patch(`/auth/users/${member.id}/profile`, { operational_profile: profile });
      setStaff((list) => list?.map((u) => (u.id === member.id ? { ...u, operational_profile: profile } : u)) ?? null);
    } catch (e) {
      Alert.alert('Could not update profile', errMsg(e, 'Please try again.'));
    } finally {
      setProfileBusy(null);
    }
  };

  if (!bm.canOpenBarSetup) {
    return (
      <View style={styles.screen}>
        <ScreenHeader eyebrow="Store" title="Bar / Lounge" onBack={() => navigation.goBack()} />
        <View style={[styles.card, { margin: 16 }]}>
          <Text style={styles.body}>Only admins and managers can open Bar / Lounge setup.</Text>
        </View>
      </View>
    );
  }

  const staffName = (u: Staff) =>
    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Cashier';

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Store" title="Bar / Lounge setup" onBack={() => navigation.goBack()} />
      {!online && <OfflineBanner message="You're offline. Bar setup can only be changed while connected." />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ── Business mode ── */}
          <Text style={styles.section}>Business mode</Text>
          <View style={styles.card}>
            {(['retail', 'bar'] as BusinessMode[]).map((mode) => {
              const selected = bm.mode === mode;
              const disabled = !bm.canChangeMode || savingMode || !online;
              return (
                <TouchableOpacity
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled }}
                  activeOpacity={0.75}
                  disabled={disabled && !selected}
                  onPress={() => chooseMode(mode)}
                  style={[styles.modeRow, selected && styles.modeRowSelected]}
                >
                  <MaterialCommunityIcons
                    name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={selected ? C.accent : C.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modeTitle}>{BUSINESS_MODE_LABELS[mode]}</Text>
                    <Text style={styles.muted}>{MODE_DESCRIPTIONS[mode]}</Text>
                  </View>
                  {savingMode && !selected && <ActivityIndicator size="small" color={C.accent} />}
                </TouchableOpacity>
              );
            })}
            <View style={styles.noteRow}>
              <MaterialCommunityIcons
                name={bm.locked ? 'lock-outline' : 'information-outline'}
                size={14}
                color={C.muted}
              />
              <Text style={[styles.muted, { flex: 1 }]}>
                {bm.locked
                  ? 'Locked: this store has recorded sales. Contact JayPOS support to change the mode.'
                  : isAdmin
                    ? 'You can change this until the store records its first sale.'
                    : 'Only an admin can change the business mode.'}
              </Text>
            </View>
          </View>

          {bm.isBar && (
            <>
              {/* ── Bar settings ── */}
              <Text style={styles.section}>Bar settings</Text>
              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingTitle}>Business day ends at</Text>
                    <Text style={styles.muted}>
                      Sales before this hour count toward the previous day ({settings?.bar_timezone ?? 'Africa/Lagos'}).
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      accessibilityLabel="Earlier"
                      onPress={() => setCutoff((h) => (h + 23) % 24)}
                      style={styles.stepBtn}
                    >
                      <MaterialCommunityIcons name="minus" size={16} color={C.ink} />
                    </TouchableOpacity>
                    <Text style={styles.stepValue}>{String(cutoff).padStart(2, '0')}:00</Text>
                    <TouchableOpacity
                      accessibilityLabel="Later"
                      onPress={() => setCutoff((h) => (h + 1) % 24)}
                      style={styles.stepBtn}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color={C.ink} />
                    </TouchableOpacity>
                  </View>
                </View>

                <SettingSwitch
                  title="Attendants may give discounts"
                  subtitle="Off by default. Uses the store's maximum discount."
                  value={attendantDiscount}
                  onChange={setAttendantDiscount}
                />
                <SettingSwitch
                  title="Controllers may back-date remittances"
                  subtitle="Never into a day that has been closed. Managers always can."
                  value={backdated}
                  onChange={setBackdated}
                />
                <SettingSwitch
                  title="Attendants must declare how customers paid"
                  subtitle="Cash, transfer or POS, recorded on each order."
                  value={declaration}
                  onChange={setDeclaration}
                />
              </View>

              {/* ── Commission ── */}
              <Text style={styles.section}>Attendant commission</Text>
              <View style={styles.card}>
                <SettingSwitch
                  title="Pay attendants commission"
                  subtitle="Rate × the attendant's total sales. Posted to Expenses when approved."
                  value={commissionOn}
                  onChange={setCommissionOn}
                />
                <TextInput
                  label="Commission rate (%)"
                  value={commissionRate}
                  onChangeText={setCommissionRate}
                  mode="outlined"
                  dense
                  keyboardType="decimal-pad"
                  placeholder="e.g. 5"
                  style={[styles.input, { marginTop: 10 }]}
                />
                <Button
                  mode="contained"
                  buttonColor={C.accent}
                  onPress={saveBarSettings}
                  loading={savingSettings}
                  disabled={savingSettings || !online}
                  style={{ marginTop: 14 }}
                >
                  Save bar settings
                </Button>
              </View>

              {/* ── Staff profiles ── */}
              <Text style={styles.section}>Cashier bar profiles</Text>
              <View style={styles.card}>
                <Text style={[styles.muted, { marginBottom: 6 }]}>
                  {isAdmin
                    ? 'Give each cashier a duty. Attendants take orders; the Bar Controller releases drinks and records payments.'
                    : 'Only an admin can change these.'}
                </Text>
                {staff === null && !staffError && <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />}
                {staffError && <Text style={styles.error}>{staffError}</Text>}
                {staff?.length === 0 && <Text style={styles.body}>No active cashiers yet. Add staff in Settings.</Text>}
                {staff?.map((member) => (
                  <View key={member.id} style={styles.staffRow}>
                    <Text style={styles.staffName} numberOfLines={1}>{staffName(member)}</Text>
                    <View style={styles.chips}>
                      {([null, 'bar_controller', 'bar_attendant'] as (OperationalProfile | null)[]).map((p) => {
                        const active = (member.operational_profile ?? null) === p;
                        return (
                          <TouchableOpacity
                            key={p ?? 'none'}
                            disabled={!isAdmin || !online || profileBusy !== null}
                            onPress={() => setProfile(member, p)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {p ? OPERATIONAL_PROFILE_SHORT_LABELS[p] : 'None'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      {profileBusy === member.id && <ActivityIndicator size="small" color={C.accent} />}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SettingSwitch({
  title, subtitle, value, onChange,
}: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: undefined }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48 },
  muted: { fontSize: 12, color: C.muted, lineHeight: 17 },
  body: { fontSize: 13, lineHeight: 19, color: C.ink },
  error: { fontSize: 13, color: C.red, marginVertical: 8 },
  section: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  input: { backgroundColor: C.card },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  modeRowSelected: { borderColor: C.accent, backgroundColor: C.violetBg },
  modeTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  settingTitle: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  stepValue: { minWidth: 52, textAlign: 'center', fontSize: 15, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  staffRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  staffName: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: C.ink },
  chipTextActive: { color: C.accentFg },
});
