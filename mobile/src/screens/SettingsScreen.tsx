import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  TextInput,
  Dialog,
  Portal,
  RadioButton,
  Button,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector, useDispatch } from 'react-redux';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootState } from '../redux/store';
import { logout, enableBiometric, disableBiometric } from '../redux/slices/authSlice';
import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import { SyncManager } from '../services/SyncManager';
import CreateStoreWizard from '../components/CreateStoreWizard';
import NotificationService, {
  NOTIF_LOW_STOCK_KEY,
  NOTIF_SALE_KEY,
  NOTIF_DAILY_KEY,
} from '../services/NotificationService';
import { C, R, S } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize } from '../utils/responsiveDesign';

// ─── Constants ────────────────────────────────────────────────
const BIZ_NAME_KEY = '@pos_business_name';
const RECEIPT_FOOTER_KEY = '@pos_receipt_footer';
const LOW_STOCK_KEY = '@pos_low_stock_threshold';
const AUTO_SYNC_KEY = '@pos_auto_sync_enabled';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/v1';

// ─── Types ────────────────────────────────────────────────────
interface StaffUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  last_login_at: string | null;
  branch_id: string | null;
  _count: { transactions: number };
}

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  _count?: { users: number; transactions: number };
}

interface PlatformStore {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  currency: string;
  is_active: boolean;
  branch_count: number;
  user_count: number;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = {
  admin: C.rose,
  manager: C.amber,
  cashier: C.green,
};
const ROLE_BG_HEX: Record<string, string> = {
  admin: C.roseBg,
  manager: C.amberBg,
  cashier: C.greenBg,
};
const monoFont = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

// ─── Sub-components ──────────────────────────────────────────

/** Uppercase section label with optional right action */
function SectionHeader({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={sh.sectionHeader}>
      <Text style={sh.sectionLabel}>{label}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={sh.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Custom toggle switch matching design spec */
function Toggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onValueChange}
      activeOpacity={0.8}
      style={[
        sh.toggleTrack,
        { backgroundColor: value ? C.accent : 'rgba(0,0,0,0.12)' },
        disabled && { opacity: 0.4 },
      ]}
    >
      <View
        style={[
          sh.toggleThumb,
          { transform: [{ translateX: value ? 18 : 2 }] },
        ]}
      />
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────
export default function SettingsScreen() {
  const dispatch = useDispatch();
  const navigation = useNavigation<any>();
  const auth = useSelector((s: RootState) => s.auth);
  const sync = useSelector((s: RootState) => s.sync);
  const user = auth.user;

  // Staff
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Customer permissions (store-level)
  const [allowCashierAdd, setAllowCashierAdd] = useState(true);
  const [allowCashierEdit, setAllowCashierEdit] = useState(true);

  // Biometric
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Preferences — notification toggles (low stock on by default)
  const [notifLowStock, setNotifLowStock] = useState(true);
  const [notifSale, setNotifSale] = useState(false);
  const [notifDaily, setNotifDaily] = useState(false);
  const [autoSync, setAutoSync] = useState(true);

  // Business settings
  const [businessName, setBusinessName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [savingBiz, setSavingBiz] = useState(false);

  // Inventory settings
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Health check
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');

  // Manual sync
  const [manualSyncLoading, setManualSyncLoading] = useState(false);

  // Bulk product import (admin)
  const [importVisible, setImportVisible] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importBranchId, setImportBranchId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Platform — super-admin only
  const isSuperAdmin = user?.is_super_admin === true;
  const [stores, setStores] = useState<PlatformStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [createStoreVisible, setCreateStoreVisible] = useState(false);

  // Branch management
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchFormVisible, setBranchFormVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [savingBranch, setSavingBranch] = useState(false);
  const [branchStaffVisible, setBranchStaffVisible] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [branchStaff, setBranchStaff] = useState<StaffUser[]>([]);
  const [branchStaffLoading, setBranchStaffLoading] = useState(false);
  const [assignStaffVisible, setAssignStaffVisible] = useState(false);
  const [unassignedStaff, setUnassignedStaff] = useState<StaffUser[]>([]);
  const [selectedAssignStaff, setSelectedAssignStaff] = useState<string[]>([]);
  const [assigningStaff, setAssigningStaff] = useState(false);

  // Add staff dialog
  const [addStaffVisible, setAddStaffVisible] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addFirstName, setAddFirstName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addRole, setAddRole] = useState<'cashier' | 'manager' | 'admin'>('cashier');
  const [addLoading, setAddLoading] = useState(false);

  // Reset password dialog
  const [resetPwVisible, setResetPwVisible] = useState(false);
  const [resetPwStaff, setResetPwStaff] = useState<StaffUser | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwLoading, setResetPwLoading] = useState(false);

  // Change role dialog
  const [changeRoleVisible, setChangeRoleVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [newRole, setNewRole] = useState<'cashier' | 'manager' | 'admin'>('cashier');
  const [roleLoading, setRoleLoading] = useState(false);

  // Deactivate dialog
  const [deactivateVisible, setDeactivateVisible] = useState(false);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // ── Load data on focus ────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadStaff();
      loadBizSettings();
      loadStoreSettings();
      checkBiometric();
      if (user?.role === 'admin') loadBranches();
      if (isSuperAdmin) loadStores();
    }, [isSuperAdmin])
  );

  const loadStores = async () => {
    const cached = await DatabaseService.getApiCache<PlatformStore[]>('platform_stores');
    if (cached && cached.length > 0) {
      setStores(cached);
    } else {
      setStoresLoading(true);
    }

    try {
      const data: any = await ApiClient.get('/stores');
      const fresh: PlatformStore[] = Array.isArray(data) ? data : data?.data ?? [];
      setStores(fresh);
      DatabaseService.setApiCache('platform_stores', fresh);
    } catch (e: any) {
      // Silent — Stores section only renders when there are no errors with cache
      console.warn('Stores load error:', e?.message ?? e);
    } finally {
      setStoresLoading(false);
    }
  };

  const checkBiometric = async () => {
    try {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hw && enrolled);
    } catch {}
  };

  const loadStaff = async () => {
    if (!['admin', 'manager'].includes(user?.role ?? '')) return;

    // Stale-while-revalidate: render cached list instantly.
    const cached = await DatabaseService.getApiCache<StaffUser[]>('settings_staff');
    if (cached && cached.length > 0) {
      setStaff(cached);
    } else {
      setStaffLoading(true);
    }

    try {
      const data: any = await ApiClient.get('/analytics/users');
      const fresh: StaffUser[] = Array.isArray(data) ? data : data?.data ?? [];
      setStaff(fresh);
      DatabaseService.setApiCache('settings_staff', fresh);
    } catch (e) {
      console.error('Staff load error:', e);
      if (!cached) setStaff([]);
    } finally {
      setStaffLoading(false);
    }
  };

  const loadStoreSettings = async () => {
    try {
      const res: any = await ApiClient.get('/settings');
      const data = res?.data ?? res;
      setAllowCashierAdd(data?.allow_cashier_add_customers ?? true);
      setAllowCashierEdit(data?.allow_cashier_edit_customers ?? true);
    } catch (e) {
      console.warn('Store settings load error:', e);
    }
  };

  const handleToggleCashierAdd = async () => {
    const next = !allowCashierAdd;
    setAllowCashierAdd(next);
    try {
      await ApiClient.patch('/settings', { allow_cashier_add_customers: next });
    } catch (e: any) {
      setAllowCashierAdd(!next);
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to update setting.');
    }
  };

  const handleToggleCashierEdit = async () => {
    const next = !allowCashierEdit;
    setAllowCashierEdit(next);
    try {
      await ApiClient.patch('/settings', { allow_cashier_edit_customers: next });
    } catch (e: any) {
      setAllowCashierEdit(!next);
      Alert.alert('Error', e?.response?.data?.message ?? 'Failed to update setting.');
    }
  };

  const loadBizSettings = async () => {
    try {
      const [name, footer, threshold, lowStockN, saleN, dailyN, syncPref] =
        await Promise.all([
          AsyncStorage.getItem(BIZ_NAME_KEY),
          AsyncStorage.getItem(RECEIPT_FOOTER_KEY),
          AsyncStorage.getItem(LOW_STOCK_KEY),
          AsyncStorage.getItem(NOTIF_LOW_STOCK_KEY),
          AsyncStorage.getItem(NOTIF_SALE_KEY),
          AsyncStorage.getItem(NOTIF_DAILY_KEY),
          AsyncStorage.getItem(AUTO_SYNC_KEY),
        ]);
      setBusinessName(name ?? '');
      setReceiptFooter(footer ?? '');
      setLowStockThreshold(threshold ?? '10');
      setNotifLowStock(lowStockN === null ? true : lowStockN !== 'false');
      setNotifSale(saleN === 'true');
      setNotifDaily(dailyN === 'true');
      setAutoSync(syncPref !== 'false');
    } catch {}
  };

  // ── Biometric toggle ─────────────────────────────────────────
  const handleBiometricToggle = async () => {
    if (auth.biometric_enabled) {
      setBiometricLoading(true);
      try {
        if (Platform.OS !== 'web') {
          await SecureStore.deleteItemAsync('biometric_token_hash');
        }
        dispatch(disableBiometric());
        Alert.alert('Disabled', 'Biometric login has been turned off.');
      } catch {
        Alert.alert('Error', 'Failed to disable biometric login.');
      } finally {
        setBiometricLoading(false);
      }
    } else {
      if (!biometricAvailable) {
        Alert.alert(
          'Not Available',
          'No biometric hardware or enrollment found on this device.'
        );
        return;
      }
      setBiometricLoading(true);
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Verify identity to enable biometric login',
          disableDeviceFallback: false,
        });

        if (!result.success) {
          setBiometricLoading(false);
          return;
        }

        const token = `bio_${user?.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const storedDeviceId =
          Platform.OS !== 'web' ? await SecureStore.getItemAsync('device_id') : null;
        const deviceId = storedDeviceId || `device_${user?.id ?? 'anon'}_${Date.now()}`;

        await ApiClient.post('/auth/set-biometric', {
          biometric_token_hash: token,
          device_id: deviceId,
        });

        if (Platform.OS !== 'web') {
          await SecureStore.setItemAsync('biometric_token_hash', token);
          await SecureStore.setItemAsync('device_id', deviceId);
        }

        dispatch(enableBiometric({ device_id: deviceId }));
        Alert.alert('Enabled', 'You can now log in with biometric authentication.');
      } catch (e: any) {
        Alert.alert(
          'Error',
          e?.response?.data?.message ?? e?.message ?? 'Failed to enable biometric login.'
        );
      } finally {
        setBiometricLoading(false);
      }
    }
  };

  // ── Notification toggles ──────────────────────────────────────
  const handleNotifToggle = async (
    key: string,
    current: boolean,
    setter: (v: boolean) => void,
    isDaily = false
  ) => {
    const next = !current;
    setter(next);
    try {
      await AsyncStorage.setItem(key, String(next));
      if (next) await NotificationService.requestPermissions();
      if (isDaily) {
        if (next) await NotificationService.scheduleDailySummary();
        else await NotificationService.cancelDailySummary();
      }
    } catch {}
  };

  // ── Auto-sync toggle ──────────────────────────────────────────
  const handleAutoSyncToggle = async () => {
    const next = !autoSync;
    setAutoSync(next);
    try {
      await AsyncStorage.setItem(AUTO_SYNC_KEY, String(next));
    } catch {}
  };

  // ── Business settings ────────────────────────────────────────
  const handleSaveBizSettings = async () => {
    setSavingBiz(true);
    try {
      await Promise.all([
        AsyncStorage.setItem(BIZ_NAME_KEY, businessName.trim()),
        AsyncStorage.setItem(RECEIPT_FOOTER_KEY, receiptFooter.trim()),
      ]);
      Alert.alert('Saved', 'Business settings updated successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save settings.');
    } finally {
      setSavingBiz(false);
    }
  };

  // ── Inventory threshold ──────────────────────────────────────
  const handleSaveThreshold = async () => {
    const val = parseInt(lowStockThreshold, 10);
    if (isNaN(val) || val < 1) {
      Alert.alert('Invalid Value', 'Threshold must be at least 1 unit.');
      return;
    }
    setSavingThreshold(true);
    try {
      await AsyncStorage.setItem(LOW_STOCK_KEY, String(val));
      await ApiClient.patch('/inventory/threshold/store', { threshold: val });
      Alert.alert(
        'Saved',
        `Low stock alert will trigger at ${val} units for all products.`
      );
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.message ?? e?.message ?? 'Failed to update threshold.'
      );
    } finally {
      setSavingThreshold(false);
    }
  };

  // ── Health check ─────────────────────────────────────────────
  const handleHealthCheck = async () => {
    setHealthStatus('checking');
    try {
      const healthUrl = API_BASE_URL.replace('/v1', '') + '/health';
      const resp = await fetch(healthUrl, { method: 'GET' });
      setHealthStatus(resp.ok ? 'ok' : 'error');
    } catch {
      setHealthStatus('error');
    }
  };

  // ── Bulk product import ──────────────────────────────────────
  const handleBulkImport = async () => {
    if (!importCsv.trim()) {
      Alert.alert('Required', 'Paste CSV content to import.');
      return;
    }
    const branchId =
      importBranchId ?? user?.branch_id ?? (branches.length === 1 ? branches[0].id : null);
    if (!branchId) {
      Alert.alert('Branch Required', 'Select a branch to import products into.');
      return;
    }
    setImporting(true);
    try {
      const res: any = await ApiClient.post('/products/bulk-import', {
        branch_id: branchId,
        csv: importCsv,
      });
      const data = res?.data ?? res;
      const errLines = (data.errors ?? [])
        .slice(0, 5)
        .map((e: any) => `Row ${e.row}: ${e.error}`)
        .join('\n');
      Alert.alert(
        'Import Complete',
        `Categories created: ${data.categories_created}\n` +
        `Products created: ${data.products_created}\n` +
        `Products updated: ${data.products_updated}\n` +
        `Errors: ${data.errors?.length ?? 0}` +
        (errLines ? `\n\n${errLines}` : '')
      );
      setImportVisible(false);
      setImportCsv('');
      setImportBranchId(null);
    } catch (e: any) {
      Alert.alert(
        'Import Failed',
        e?.response?.data?.message ?? e?.message ?? 'Unknown error'
      );
    } finally {
      setImporting(false);
    }
  };

  // ── Manual sync ──────────────────────────────────────────────
  const handleManualSync = async () => {
    setManualSyncLoading(true);
    try {
      const result = await SyncManager.syncPendingTransactions('');
      Alert.alert(
        'Sync Complete',
        `Synced: ${result.synced}, Failed: ${result.failed}`
      );
    } catch (e: any) {
      Alert.alert('Sync Failed', e?.message ?? 'Failed to sync transactions');
    } finally {
      setManualSyncLoading(false);
    }
  };

  // ── Add staff ────────────────────────────────────────────────
  const handleAddStaff = async () => {
    if (!addEmail.trim() || !addFirstName.trim()) {
      Alert.alert('Required', 'Email and first name are required.');
      return;
    }
    if (!addUsername.trim()) {
      Alert.alert('Required', 'Username is required.');
      return;
    }
    if (addPassword.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    setAddLoading(true);
    try {
      const response: any = await ApiClient.post('/auth/register', {
        email: addEmail.trim().toLowerCase(),
        username: addUsername.trim().toLowerCase(),
        password: addPassword,
        first_name: addFirstName.trim(),
        last_name: addLastName.trim(),
        role: addRole,
        store_id: user?.store_id,
      });

      const newStaff = response?.data ?? response;
      if (newStaff && newStaff.id) {
        setStaff((prev) => [newStaff, ...prev]);
      }

      Alert.alert('Staff Added', `${addFirstName} has been added as ${addRole}.`);
      setAddStaffVisible(false);
      setAddEmail('');
      setAddUsername('');
      setAddPassword('');
      setAddFirstName('');
      setAddLastName('');
      setAddRole('cashier');
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.message ?? e?.message ?? 'Failed to add staff member.'
      );
    } finally {
      setAddLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwStaff) return;
    if (resetPwValue.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    setResetPwLoading(true);
    try {
      await ApiClient.patch(`/auth/users/${resetPwStaff.id}/reset-password`, {
        password: resetPwValue,
      });
      Alert.alert(
        'Password Reset',
        `${resetPwStaff.first_name}'s password has been updated.`
      );
      setResetPwVisible(false);
      setResetPwValue('');
      setResetPwStaff(null);
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.message ?? e?.message ?? 'Failed to reset password.'
      );
    } finally {
      setResetPwLoading(false);
    }
  };

  // ── Change role ──────────────────────────────────────────────
  const handleChangeRole = async () => {
    if (!selectedStaff) return;
    setRoleLoading(true);
    try {
      await ApiClient.patch(`/auth/users/${selectedStaff.id}`, { role: newRole });
      Alert.alert('Updated', `${selectedStaff.first_name}'s role changed to ${newRole}.`);
      setChangeRoleVisible(false);
      loadStaff();
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.message ?? e?.message ?? 'Failed to update role.'
      );
    } finally {
      setRoleLoading(false);
    }
  };

  // ── Deactivate ───────────────────────────────────────────────
  const handleDeactivate = async () => {
    if (!selectedStaff) return;
    setDeactivateLoading(true);
    try {
      await ApiClient.patch(`/auth/users/${selectedStaff.id}/deactivate`, {});
      Alert.alert('Deactivated', `${selectedStaff.first_name} has been deactivated.`);
      setDeactivateVisible(false);
      loadStaff();
    } catch (e: any) {
      Alert.alert(
        'Error',
        e?.response?.data?.message ?? e?.message ?? 'Failed to deactivate user.'
      );
    } finally {
      setDeactivateLoading(false);
    }
  };

  // ── Branch management ────────────────────────────────────────
  const loadBranches = async () => {
    const cached = await DatabaseService.getApiCache<Branch[]>('settings_branches');
    if (cached && cached.length > 0) {
      setBranches(cached);
    } else {
      setBranchLoading(true);
    }

    try {
      const data: any = await ApiClient.get('/branches');
      const fresh: Branch[] = Array.isArray(data) ? data : data?.data ?? [];
      setBranches(fresh);
      DatabaseService.setApiCache('settings_branches', fresh);
    } catch (e) {
      console.error('Branch load error:', e);
    } finally {
      setBranchLoading(false);
    }
  };

  const openNewBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchFormVisible(true);
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchAddress(b.address ?? '');
    setBranchPhone(b.phone ?? '');
    setBranchFormVisible(true);
  };

  const handleSaveBranch = async () => {
    if (!branchName.trim()) {
      Alert.alert('Required', 'Branch name is required.');
      return;
    }
    setSavingBranch(true);
    try {
      if (editingBranch) {
        await ApiClient.patch(`/branches/${editingBranch.id}`, {
          name: branchName.trim(),
          address: branchAddress.trim() || null,
          phone: branchPhone.trim() || null,
        });
        Alert.alert('Updated', `"${branchName}" updated.`);
      } else {
        await ApiClient.post('/branches', {
          name: branchName.trim(),
          address: branchAddress.trim() || null,
          phone: branchPhone.trim() || null,
        });
        Alert.alert('Created', `Branch "${branchName}" created.`);
      }
      setBranchFormVisible(false);
      loadBranches();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? e?.message ?? 'Operation failed.');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleDeactivateBranch = (b: Branch) => {
    Alert.alert(
      'Deactivate Branch',
      `Deactivate "${b.name}"? Staff and data are preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApiClient.patch(`/branches/${b.id}/deactivate`, {});
              loadBranches();
            } catch (e: any) {
              Alert.alert(
                'Error',
                e?.response?.data?.message ?? e?.message ?? 'Failed.'
              );
            }
          },
        },
      ]
    );
  };

  const openBranchStaff = async (b: Branch) => {
    setSelectedBranch(b);
    setBranchStaff([]);
    setBranchStaffVisible(true);
    setBranchStaffLoading(true);
    try {
      const data: any = await ApiClient.get(`/branches/${b.id}/staff`);
      setBranchStaff(Array.isArray(data) ? data : data?.data ?? []);
    } catch (e) {
      console.error('Branch staff load error:', e);
    } finally {
      setBranchStaffLoading(false);
    }
  };

  const openAssignStaff = async () => {
    try {
      const all: any = await ApiClient.get('/analytics/users');
      const allStaff: StaffUser[] = Array.isArray(all) ? all : all?.data ?? [];
      const currentIds = new Set(branchStaff.map((s) => s.id));
      setUnassignedStaff(allStaff.filter((s) => !currentIds.has(s.id)));
      setSelectedAssignStaff([]);
      setAssignStaffVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Could not load staff list.');
    }
  };

  const handleAssignStaff = async () => {
    if (!selectedBranch || selectedAssignStaff.length === 0) return;
    setAssigningStaff(true);
    try {
      await Promise.all(
        selectedAssignStaff.map((userId) =>
          ApiClient.post(`/branches/${selectedBranch.id}/staff`, { user_id: userId })
        )
      );
      Alert.alert(
        'Assigned',
        `${selectedAssignStaff.length} staff assigned to ${selectedBranch.name}.`
      );
      setAssignStaffVisible(false);
      const data: any = await ApiClient.get(`/branches/${selectedBranch.id}/staff`);
      setBranchStaff(Array.isArray(data) ? data : data?.data ?? []);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? e?.message ?? 'Failed.');
    } finally {
      setAssigningStaff(false);
    }
  };

  const handleRemoveFromBranch = (userId: string, name: string) => {
    Alert.alert(
      'Remove from Branch',
      `Remove ${name} from ${selectedBranch?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await (ApiClient as any).delete(
                `/branches/${selectedBranch!.id}/staff/${userId}`
              );
              setBranchStaff((prev) => prev.filter((s) => s.id !== userId));
            } catch (e: any) {
              Alert.alert(
                'Error',
                e?.response?.data?.message ?? e?.message ?? 'Failed.'
              );
            }
          },
        },
      ]
    );
  };

  // ── Sign out ─────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (Platform.OS !== 'web') {
              await Promise.all([
                SecureStore.deleteItemAsync('access_token'),
                SecureStore.deleteItemAsync('refresh_token'),
                SecureStore.deleteItemAsync('auth_user'),
              ]);
            }
          } catch {}
          dispatch(logout());
        },
      },
    ]);
  };

  // ── Derived values ────────────────────────────────────────────
  const firstLetter =
    user?.first_name?.charAt(0)?.toUpperCase() ??
    user?.email?.charAt(0)?.toUpperCase() ??
    '?';
  const fullName =
    user?.first_name
      ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
      : user?.email ?? 'Unknown';
  const canManageStaff = ['admin', 'manager'].includes(user?.role ?? '');
  const isAdmin = user?.role === 'admin';
  const staffCount = staff.length;
  const branchCount = branches.length;

  const formatLastLogin = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ── Responsive design ────────────────────────────────────────
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  // ── Render ───────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: isTablet ? spacing.lg : spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ── */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageEyebrow, { fontSize: fontSize.xs }]}>Settings</Text>
          <Text style={[styles.pageTitle, { fontSize: isTablet ? 32 : 26 }]}>Account</Text>
        </View>

        {/* ── Profile hero card ── */}
        <LinearGradient
          colors={[C.accent, C.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {/* decorative orb */}
          <View style={styles.heroOrb} />

          <View style={[styles.heroRow, { paddingHorizontal: isTablet ? spacing.lg : spacing.md }]}>
            {/* Square avatar */}
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{firstLetter}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroName}>{fullName}</Text>
              <Text style={styles.heroEmail}>{user?.email ?? ''}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                <Text style={styles.heroBadge}>
                  {(user?.role ?? 'cashier').toUpperCase()}
                </Text>
                <Text style={styles.heroBadge}>{user?.store_id ?? 'STORE_001'}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* ── Quick stats grid ── */}
        <View style={styles.statsRow}>
          {/* Staff */}
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: C.accent + '1A' }]}>
              <MaterialCommunityIcons name="account-group" size={16} color={C.accent} />
            </View>
            <Text style={[styles.statValue, { fontFamily: monoFont }]}>
              {staffCount}
            </Text>
            <Text style={styles.statLabel}>Staff</Text>
          </View>

          {/* Branches */}
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: C.amber + '1A' }]}>
              <MaterialCommunityIcons name="source-branch" size={16} color={C.amber} />
            </View>
            <Text style={[styles.statValue, { fontFamily: monoFont }]}>
              {branchCount}
            </Text>
            <Text style={styles.statLabel}>Branches</Text>
          </View>

          {/* Online */}
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: C.green + '1A' }]}>
              <MaterialCommunityIcons name="wifi" size={16} color={C.green} />
            </View>
            <Text style={[styles.statValue, { fontFamily: monoFont }]}>
              {sync.mode === 'OFFLINE' ? 'No' : 'Yes'}
            </Text>
            <Text style={styles.statLabel}>Online</Text>
          </View>
        </View>

        {/* ══════════ PLATFORM — STORES (super-admin only) ══════════ */}
        {isSuperAdmin && (
          <>
            <SectionHeader
              label="Platform — Stores"
              actionLabel="+ Create"
              onAction={() => setCreateStoreVisible(true)}
            />

            <View style={[styles.card, { padding: 6, marginBottom: 14 }]}>
              {storesLoading ? (
                <ActivityIndicator style={{ marginVertical: 24 }} color={C.accent} />
              ) : stores.length === 0 ? (
                <Text style={styles.emptyText}>No stores yet — tap “+ Create”.</Text>
              ) : (
                stores.map((s, idx) => (
                  <View
                    key={s.id}
                    style={[
                      styles.staffRow,
                      idx < stores.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View
                      style={[
                        styles.staffAvatar,
                        {
                          backgroundColor: s.is_active ? C.violetBg : C.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="storefront-outline"
                        size={20}
                        color={s.is_active ? C.accent : C.muted}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.staffName,
                          !s.is_active && { color: C.muted },
                        ]}
                      >
                        {s.name}
                        {!s.is_active ? '  (inactive)' : ''}
                      </Text>
                      <Text
                        style={[styles.staffEmail, { fontFamily: monoFont }]}
                      >
                        {s.id} · {s.currency}
                      </Text>
                      <View style={styles.staffMeta}>
                        <Text style={styles.txCount}>
                          {s.branch_count} {s.branch_count === 1 ? 'branch' : 'branches'}
                        </Text>
                        <Text style={styles.txCount}>·</Text>
                        <Text style={styles.txCount}>
                          {s.user_count} {s.user_count === 1 ? 'user' : 'users'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ══════════ ADMIN (super-admin only) ══════════ */}
        {isSuperAdmin && (
          <>
            <SectionHeader label="Admin" />

            <TouchableOpacity
              style={[styles.card, styles.navRow, { marginBottom: 14 }]}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('AdminSubscriptions')}
            >
              <View style={[styles.navIcon, { backgroundColor: C.accent + '1A' }]}>
                <MaterialCommunityIcons
                  name="receipt"
                  size={20}
                  color={C.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navTitle}>Manage subscriptions</Text>
                <Text style={styles.navSubtitle}>
                  Plans, billing & expirations across all stores
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={C.muted}
              />
            </TouchableOpacity>
          </>
        )}

        {/* ══════════ STAFF MANAGEMENT ══════════ */}
        {canManageStaff && (
          <>
            <SectionHeader
              label="Staff Management"
              actionLabel={isAdmin ? '+ Add' : undefined}
              onAction={isAdmin ? () => setAddStaffVisible(true) : undefined}
            />

            <View style={[styles.card, { padding: 6, marginBottom: 4 }]}>
              {staffLoading ? (
                <ActivityIndicator
                  style={{ marginVertical: 24 }}
                  color={C.accent}
                />
              ) : staff.length === 0 ? (
                <Text style={styles.emptyText}>No staff members found</Text>
              ) : (
                staff.map((member, idx) => (
                  <View
                    key={member.id}
                    style={[
                      styles.staffRow,
                      idx < staff.length - 1 && styles.rowDivider,
                    ]}
                  >
                    {/* Avatar */}
                    <View
                      style={[
                        styles.staffAvatar,
                        { backgroundColor: ROLE_BG_HEX[member.role] },
                      ]}
                    >
                      <Text
                        style={[
                          styles.staffAvatarText,
                          { color: ROLE_COLOR[member.role] },
                        ]}
                      >
                        {member.first_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName}>
                        {member.first_name} {member.last_name}
                        {member.id === user?.id ? '  (you)' : ''}
                      </Text>
                      <Text style={styles.staffEmail}>{member.email}</Text>
                      <View style={styles.staffMeta}>
                        <View
                          style={[
                            styles.rolePill,
                            { backgroundColor: ROLE_BG_HEX[member.role] },
                          ]}
                        >
                          <Text
                            style={[
                              styles.rolePillText,
                              { color: ROLE_COLOR[member.role] },
                            ]}
                          >
                            {member.role}
                          </Text>
                        </View>
                        <Text style={styles.txCount}>
                          {member._count?.transactions ?? 0} txns
                        </Text>
                        <Text style={styles.lastLogin}>
                          {formatLastLogin(member.last_login_at)}
                        </Text>
                      </View>
                    </View>

                    {/* Actions */}
                    {member.id !== user?.id ? (
                      <View style={styles.staffActions}>
                        {isAdmin && (
                          <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => {
                              setSelectedStaff(member);
                              setNewRole(member.role);
                              setChangeRoleVisible(true);
                            }}
                          >
                            <MaterialCommunityIcons
                              name="shield-edit-outline"
                              size={18}
                              color={C.accent}
                            />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[styles.iconBtn, isAdmin && { marginTop: 6 }]}
                          onPress={() => {
                            setResetPwStaff(member);
                            setResetPwValue('');
                            setResetPwVisible(true);
                          }}
                        >
                          <MaterialCommunityIcons
                            name="lock-reset"
                            size={18}
                            color={C.amber}
                          />
                        </TouchableOpacity>
                        {isAdmin && (
                          <TouchableOpacity
                            style={[styles.iconBtn, { marginTop: 6 }]}
                            onPress={() => {
                              setSelectedStaff(member);
                              setDeactivateVisible(true);
                            }}
                          >
                            <MaterialCommunityIcons
                              name="account-off-outline"
                              size={18}
                              color={C.rose}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => {
                          setResetPwStaff(member);
                          setResetPwValue('');
                          setResetPwVisible(true);
                        }}
                      >
                        <MaterialCommunityIcons
                          name="lock-reset"
                          size={18}
                          color={C.amber}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ══════════ CUSTOMER PERMISSIONS ══════════ */}
        {canManageStaff && (
          <>
            <SectionHeader label="Customer Permissions" />

            <View style={[styles.card, { padding: 4, marginBottom: 14 }]}>
              <View style={[styles.toggleRow, styles.rowDivider]}>
                <View style={[styles.toggleIcon, { backgroundColor: C.accent + '1A' }]}>
                  <MaterialCommunityIcons
                    name="account-plus-outline"
                    size={18}
                    color={C.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Cashiers can add customers</Text>
                  <Text style={styles.toggleDesc}>
                    Allow cashier accounts to create new customers
                  </Text>
                </View>
                <Toggle value={allowCashierAdd} onValueChange={handleToggleCashierAdd} />
              </View>

              <View style={styles.toggleRow}>
                <View style={[styles.toggleIcon, { backgroundColor: C.amber + '1A' }]}>
                  <MaterialCommunityIcons
                    name="account-edit-outline"
                    size={18}
                    color={C.amber}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Cashiers can edit customers</Text>
                  <Text style={styles.toggleDesc}>
                    Allow cashier accounts to edit customer details
                  </Text>
                </View>
                <Toggle value={allowCashierEdit} onValueChange={handleToggleCashierEdit} />
              </View>
            </View>
          </>
        )}

        {/* ══════════ BRANCH MANAGEMENT (admin only) ══════════ */}
        {isAdmin && (
          <>
            <SectionHeader
              label="Branch Management"
              actionLabel="+ New"
              onAction={openNewBranch}
            />

            <View style={[styles.card, { padding: 6, marginBottom: 4 }]}>
              {branchLoading ? (
                <ActivityIndicator
                  style={{ marginVertical: 24 }}
                  color={C.accent}
                />
              ) : branches.length === 0 ? (
                <Text style={styles.emptyText}>No branches yet</Text>
              ) : (
                branches.map((branch, idx) => (
                  <View
                    key={branch.id}
                    style={[
                      styles.staffRow,
                      idx < branches.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View
                      style={[
                        styles.staffAvatar,
                        {
                          backgroundColor: branch.is_active
                            ? C.violetBg
                            : C.border,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="store-outline"
                        size={20}
                        color={branch.is_active ? C.accent : C.muted}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.staffName,
                          !branch.is_active && { color: C.muted },
                        ]}
                      >
                        {branch.name}
                        {!branch.is_active ? '  (inactive)' : ''}
                      </Text>
                      {branch.address ? (
                        <Text style={styles.staffEmail}>{branch.address}</Text>
                      ) : null}
                      {branch.phone ? (
                        <Text style={styles.txCount}>{branch.phone}</Text>
                      ) : null}
                    </View>

                    <View style={styles.staffActions}>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => openBranchStaff(branch)}
                      >
                        <MaterialCommunityIcons
                          name="account-group-outline"
                          size={18}
                          color={C.accent}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.iconBtn, { marginTop: 6 }]}
                        onPress={() => openEditBranch(branch)}
                      >
                        <MaterialCommunityIcons
                          name="pencil-outline"
                          size={18}
                          color={C.muted}
                        />
                      </TouchableOpacity>
                      {branch.is_active && (
                        <TouchableOpacity
                          style={[styles.iconBtn, { marginTop: 6 }]}
                          onPress={() => handleDeactivateBranch(branch)}
                        >
                          <MaterialCommunityIcons
                            name="close-circle-outline"
                            size={18}
                            color={C.rose}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* ══════════ PREFERENCES ══════════ */}
        <SectionHeader label="Preferences" />

        <View style={[styles.card, { padding: 4, marginBottom: 14 }]}>
          {/* Low Stock Alerts */}
          <View style={[styles.toggleRow, styles.rowDivider]}>
            <View style={[styles.toggleIcon, { backgroundColor: C.amber + '1A' }]}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={18}
                color={C.amber}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Low Stock Alerts</Text>
              <Text style={styles.toggleDesc}>
                Notify when a product runs low after a sale
              </Text>
            </View>
            <Toggle
              value={notifLowStock}
              onValueChange={() =>
                handleNotifToggle(NOTIF_LOW_STOCK_KEY, notifLowStock, setNotifLowStock)
              }
            />
          </View>

          {/* Sale Completed */}
          <View style={[styles.toggleRow, styles.rowDivider]}>
            <View style={[styles.toggleIcon, { backgroundColor: C.green + '1A' }]}>
              <MaterialCommunityIcons
                name="cart-check"
                size={18}
                color={C.green}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Sale Completed</Text>
              <Text style={styles.toggleDesc}>
                Notify each time a sale is processed
              </Text>
            </View>
            <Toggle
              value={notifSale}
              onValueChange={() =>
                handleNotifToggle(NOTIF_SALE_KEY, notifSale, setNotifSale)
              }
            />
          </View>

          {/* Daily Sales Summary */}
          <View style={[styles.toggleRow, styles.rowDivider]}>
            <View style={[styles.toggleIcon, { backgroundColor: C.accent + '1A' }]}>
              <MaterialCommunityIcons
                name="calendar-clock"
                size={18}
                color={C.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Daily Sales Summary</Text>
              <Text style={styles.toggleDesc}>
                Daily 8 PM reminder to review sales
              </Text>
            </View>
            <Toggle
              value={notifDaily}
              onValueChange={() =>
                handleNotifToggle(NOTIF_DAILY_KEY, notifDaily, setNotifDaily, true)
              }
            />
          </View>

          {/* Biometric Login */}
          <View style={[styles.toggleRow, styles.rowDivider]}>
            <View style={[styles.toggleIcon, { backgroundColor: C.green + '1A' }]}>
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={18}
                color={C.green}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Biometric Login</Text>
              <Text style={styles.toggleDesc}>
                {biometricAvailable
                  ? 'Use fingerprint or face ID to sign in'
                  : 'No biometric hardware detected'}
              </Text>
            </View>
            {biometricLoading ? (
              <ActivityIndicator size="small" color={C.green} />
            ) : (
              <Toggle
                value={auth.biometric_enabled}
                onValueChange={handleBiometricToggle}
                disabled={!biometricAvailable}
              />
            )}
          </View>

          {/* Auto-sync */}
          <View style={[styles.toggleRow, styles.rowDivider]}>
            <View style={[styles.toggleIcon, { backgroundColor: C.amber + '1A' }]}>
              <MaterialCommunityIcons
                name="download-outline"
                size={18}
                color={C.amber}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Auto-sync</Text>
              <Text style={styles.toggleDesc}>
                Automatically sync when connection is restored
              </Text>
            </View>
            <Toggle value={autoSync} onValueChange={handleAutoSyncToggle} />
          </View>

          {/* Manual sync button */}
          <View style={styles.toggleRow}>
            <View style={[styles.toggleIcon, { backgroundColor: C.rose + '1A' }]}>
              <MaterialCommunityIcons
                name="sync"
                size={18}
                color={C.rose}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Manual Sync</Text>
              <Text style={styles.toggleDesc}>
                {sync.pendingSyncCount > 0
                  ? `${sync.pendingSyncCount} item${sync.pendingSyncCount !== 1 ? 's' : ''} pending`
                  : 'All synced'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.healthBtn, manualSyncLoading && { opacity: 0.6 }]}
              onPress={handleManualSync}
              disabled={manualSyncLoading || sync.pendingSyncCount === 0}
              activeOpacity={0.7}
            >
              {manualSyncLoading ? (
                <ActivityIndicator size="small" color={C.rose} />
              ) : (
                <MaterialCommunityIcons
                  name="sync"
                  size={15}
                  color={sync.pendingSyncCount > 0 ? C.rose : C.muted}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ══════════ RECEIPT SETTINGS ══════════ */}
        {canManageStaff && (
          <>
            <SectionHeader label="Receipt Settings" />

            <View style={[styles.card, { padding: 16, marginBottom: 14 }]}>
              <TextInput
                label="Business Name"
                value={businessName}
                onChangeText={setBusinessName}
                mode="outlined"
                dense
                style={styles.input}
                left={<TextInput.Icon icon="store-outline" />}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <TextInput
                label="Receipt Footer Message"
                value={receiptFooter}
                onChangeText={setReceiptFooter}
                mode="outlined"
                dense
                style={styles.input}
                multiline
                numberOfLines={2}
                left={<TextInput.Icon icon="text-box-outline" />}
                placeholder="e.g. Thank you for shopping with us!"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <TouchableOpacity
                style={[
                  styles.solidBtn,
                  savingBiz && { opacity: 0.6 },
                ]}
                onPress={handleSaveBizSettings}
                disabled={savingBiz}
                activeOpacity={0.8}
              >
                {savingBiz ? (
                  <ActivityIndicator size="small" color={C.bg} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="content-save-outline"
                      size={16}
                      color={C.bg}
                    />
                    <Text style={styles.solidBtnText}>Save Settings</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════ INVENTORY SETTINGS ══════════ */}
        {canManageStaff && (
          <>
            <SectionHeader label="Inventory Settings" />

            <View style={[styles.card, { padding: 16, marginBottom: 14 }]}>
              <TextInput
                label="Low Stock Alert Threshold"
                value={lowStockThreshold}
                onChangeText={(v) => setLowStockThreshold(v.replace(/[^0-9]/g, ''))}
                mode="outlined"
                dense
                style={styles.input}
                keyboardType="number-pad"
                left={<TextInput.Icon icon="alert-circle-outline" />}
                right={<TextInput.Affix text="units" />}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <Text style={[styles.toggleDesc, { marginBottom: 14, lineHeight: 18 }]}>
                Global default — new products inherit this value automatically.{' '}
                <Text style={{ fontWeight: '700', color: C.accent }}>
                  Apply to All
                </Text>{' '}
                resets every existing product to this level. To set a per-product
                threshold, use the ⚡ icon in the Inventory screen.
              </Text>
              <TouchableOpacity
                style={[
                  styles.solidBtn,
                  savingThreshold && { opacity: 0.6 },
                ]}
                onPress={handleSaveThreshold}
                disabled={savingThreshold}
                activeOpacity={0.8}
              >
                {savingThreshold ? (
                  <ActivityIndicator size="small" color={C.bg} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={16}
                      color={C.bg}
                    />
                    <Text style={styles.solidBtnText}>Apply to All Products</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════ BULK IMPORT (admin only) ══════════ */}
        {isAdmin && (
          <>
            <SectionHeader label="Bulk Import" />
            <View style={[styles.card, { padding: 16, marginBottom: 14 }]}>
              <Text style={[styles.toggleDesc, { marginBottom: 12, lineHeight: 18 }]}>
                Upload a CSV to bulk-create products and categories for a branch.
                Required columns:{' '}
                <Text style={{ fontWeight: '700', color: C.ink }}>
                  category, name, sku, selling_price
                </Text>
                . Optional:{' '}
                <Text style={{ color: C.ink }}>
                  barcode, cost_price, tax_rate, unit, initial_stock,
                  low_stock_threshold, description
                </Text>
                . See{' '}
                <Text style={{ fontWeight: '700', color: C.accent }}>products_template.csv</Text>
                .
              </Text>
              <TouchableOpacity
                style={styles.solidBtn}
                onPress={() => setImportVisible(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="file-upload-outline"
                  size={16}
                  color={C.bg}
                />
                <Text style={styles.solidBtnText}>Import Products from CSV</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ══════════ SYSTEM & CONNECTIVITY ══════════ */}
        <SectionHeader label="System & Connectivity" />

        <View style={[styles.card, { marginBottom: 14 }]}>
          <View style={[styles.infoRow, styles.rowDivider]}>
            <Text style={styles.infoLabel}>Connection</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: sync.isConnected ? C.green : C.rose,
                  },
                ]}
              />
              <Text
                style={[
                  styles.infoValue,
                  { color: sync.isConnected ? C.green : C.rose },
                ]}
              >
                {sync.isConnected ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={[styles.infoRow, styles.rowDivider]}>
            <Text style={styles.infoLabel}>Pending Sync</Text>
            <Text
              style={[
                styles.infoValue,
                { color: sync.pendingSyncCount > 0 ? C.amber : C.ink },
              ]}
            >
              {sync.pendingSyncCount}{' '}
              {sync.pendingSyncCount === 1 ? 'item' : 'items'}
            </Text>
          </View>

          <View style={[styles.infoRow, styles.rowDivider]}>
            <Text style={styles.infoLabel}>Last Sync</Text>
            <Text style={styles.infoValue}>
              {sync.lastSyncAt
                ? new Date(sync.lastSyncAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'}
            </Text>
          </View>

          <View style={[styles.infoRow, styles.rowDivider]}>
            <Text style={styles.infoLabel}>API URL</Text>
            <Text
              style={[styles.infoValue, { fontSize: 11, color: C.muted }]}
              numberOfLines={1}
            >
              {API_BASE_URL}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Server Health</Text>
            <TouchableOpacity
              style={styles.healthBtn}
              onPress={handleHealthCheck}
              activeOpacity={0.7}
            >
              {healthStatus === 'checking' ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  {healthStatus === 'ok' && (
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={15}
                      color={C.green}
                    />
                  )}
                  {healthStatus === 'error' && (
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={15}
                      color={C.rose}
                    />
                  )}
                  {healthStatus === 'idle' && (
                    <MaterialCommunityIcons
                      name="refresh"
                      size={15}
                      color={C.accent}
                    />
                  )}
                  <Text
                    style={[
                      styles.healthBtnText,
                      healthStatus === 'ok' && { color: C.green },
                      healthStatus === 'error' && { color: C.rose },
                    ]}
                  >
                    {healthStatus === 'idle'
                      ? 'Check Now'
                      : healthStatus === 'ok'
                      ? 'Healthy'
                      : 'Unreachable'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ══════════ DANGER ZONE ══════════ */}
        <SectionHeader label="Danger Zone" />

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="logout" size={18} color={C.red} />
          <Text style={styles.logoutBtnText}>Log out</Text>
        </TouchableOpacity>

        {/* ══════════ ABOUT ══════════ */}
        <View style={styles.about}>
          <Text style={styles.aboutVersion}>
            POS v2.4.1 · build 2026-05-15
          </Text>
          <Text style={styles.aboutCopyright}>© 2026 Lusaworks</Text>
          <Text style={styles.aboutDev}>Developed by Gana David Ndagba</Text>
        </View>
      </ScrollView>

      {/* ══════════════ Dialogs ══════════════ */}
      <Portal>

        {/* ── Add Staff ── */}
        <Dialog
          visible={addStaffVisible}
          onDismiss={() => setAddStaffVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Add Staff Member</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 420 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              <TextInput
                label="Email *"
                value={addEmail}
                onChangeText={setAddEmail}
                mode="outlined"
                style={styles.dialogInput}
                keyboardType="email-address"
                autoCapitalize="none"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <TextInput
                label="Username *"
                value={addUsername}
                onChangeText={setAddUsername}
                mode="outlined"
                style={styles.dialogInput}
                autoCapitalize="none"
                placeholder="Used to log in"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <TextInput
                label="First Name *"
                value={addFirstName}
                onChangeText={setAddFirstName}
                mode="outlined"
                style={styles.dialogInput}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <TextInput
                label="Last Name"
                value={addLastName}
                onChangeText={setAddLastName}
                mode="outlined"
                style={styles.dialogInput}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <TextInput
                label="Password *"
                value={addPassword}
                onChangeText={setAddPassword}
                mode="outlined"
                style={styles.dialogInput}
                secureTextEntry
                autoCapitalize="none"
                placeholder="At least 6 characters"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
              />
              <Text style={styles.radioLabel}>Role</Text>
              <RadioButton.Group
                onValueChange={(v) => setAddRole(v as any)}
                value={addRole}
              >
                {(['cashier', 'manager', 'admin'] as const).map((r) => (
                  <RadioButton.Item
                    key={r}
                    label={r.charAt(0).toUpperCase() + r.slice(1)}
                    value={r}
                    color={C.accent}
                    style={{ paddingVertical: 2 }}
                  />
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setAddStaffVisible(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              onPress={handleAddStaff}
              loading={addLoading}
              disabled={addLoading}
              textColor={C.accent}
            >
              Add Member
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Change Role ── */}
        <Dialog
          visible={changeRoleVisible}
          onDismiss={() => setChangeRoleVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Change Role</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: C.muted, marginBottom: 14 }}>
              Updating role for{' '}
              <Text style={{ fontWeight: '700', color: C.ink }}>
                {selectedStaff?.first_name} {selectedStaff?.last_name}
              </Text>
            </Text>
            <RadioButton.Group
              onValueChange={(v) => setNewRole(v as any)}
              value={newRole}
            >
              {(['cashier', 'manager', 'admin'] as const).map((r) => (
                <RadioButton.Item
                  key={r}
                  label={r.charAt(0).toUpperCase() + r.slice(1)}
                  value={r}
                  color={C.accent}
                  style={{ paddingVertical: 2 }}
                />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setChangeRoleVisible(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              onPress={handleChangeRole}
              loading={roleLoading}
              disabled={roleLoading}
              textColor={C.accent}
            >
              Update Role
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Deactivate ── */}
        <Dialog
          visible={deactivateVisible}
          onDismiss={() => setDeactivateVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Deactivate Staff</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: C.muted, lineHeight: 22 }}>
              Are you sure you want to deactivate{' '}
              <Text style={{ fontWeight: '700', color: C.rose }}>
                {selectedStaff?.first_name} {selectedStaff?.last_name}
              </Text>
              ?{'\n\n'}They will immediately lose access to the POS system.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeactivateVisible(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              onPress={handleDeactivate}
              loading={deactivateLoading}
              disabled={deactivateLoading}
              textColor={C.rose}
            >
              Deactivate
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Reset Password ── */}
        <Dialog
          visible={resetPwVisible}
          onDismiss={() => setResetPwVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Reset Password</Dialog.Title>
          <Dialog.Content>
            {resetPwStaff?.id === user?.id ? (
              <Text style={{ color: C.muted, marginBottom: 14 }}>
                Choose a new password for your own account.
              </Text>
            ) : (
              <Text style={{ color: C.muted, marginBottom: 14 }}>
                Set a new password for{' '}
                <Text style={{ fontWeight: '700', color: C.ink }}>
                  {resetPwStaff?.first_name} {resetPwStaff?.last_name}
                </Text>
                . Share it with them directly.
              </Text>
            )}
            <TextInput
              label="New Password *"
              value={resetPwValue}
              onChangeText={setResetPwValue}
              mode="outlined"
              style={styles.dialogInput}
              secureTextEntry
              autoCapitalize="none"
              placeholder="At least 6 characters"
              outlineColor={C.border}
              activeOutlineColor={C.accent}
              theme={{ colors: { background: C.card } }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setResetPwVisible(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              onPress={handleResetPassword}
              loading={resetPwLoading}
              disabled={resetPwLoading}
              textColor={C.accent}
            >
              Save Password
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Branch Form (Create / Edit) ── */}
        <Dialog
          visible={branchFormVisible}
          onDismiss={() => setBranchFormVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>
            {editingBranch ? `Edit "${editingBranch.name}"` : 'New Branch'}
          </Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 380 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              <TextInput
                label="Branch Name *"
                value={branchName}
                onChangeText={setBranchName}
                mode="outlined"
                style={styles.dialogInput}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
                left={<TextInput.Icon icon="store-outline" />}
              />
              <TextInput
                label="Address"
                value={branchAddress}
                onChangeText={setBranchAddress}
                mode="outlined"
                style={styles.dialogInput}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
                left={<TextInput.Icon icon="map-marker-outline" />}
                multiline
                numberOfLines={2}
              />
              <TextInput
                label="Phone"
                value={branchPhone}
                onChangeText={setBranchPhone}
                mode="outlined"
                style={styles.dialogInput}
                keyboardType="phone-pad"
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
                left={<TextInput.Icon icon="phone-outline" />}
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setBranchFormVisible(false)} textColor={C.muted}>
              Cancel
            </Button>
            <Button
              onPress={handleSaveBranch}
              loading={savingBranch}
              disabled={savingBranch}
              textColor={C.accent}
            >
              {editingBranch ? 'Save Changes' : 'Create Branch'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Branch Staff Management ── */}
        <Dialog
          visible={branchStaffVisible}
          onDismiss={() => setBranchStaffVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>
            {selectedBranch?.name ?? 'Branch'} — Staff
          </Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 400 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
              {branchStaffLoading ? (
                <ActivityIndicator
                  style={{ marginVertical: 24 }}
                  color={C.accent}
                />
              ) : branchStaff.length === 0 ? (
                <Text style={[styles.emptyText, { paddingVertical: 24 }]}>
                  No staff assigned to this branch yet
                </Text>
              ) : (
                branchStaff.map((member, idx) => (
                  <View
                    key={member.id}
                    style={[
                      styles.staffRow,
                      { paddingHorizontal: 4 },
                      idx < branchStaff.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View
                      style={[
                        styles.staffAvatar,
                        { backgroundColor: ROLE_BG_HEX[member.role] },
                      ]}
                    >
                      <Text
                        style={[
                          styles.staffAvatarText,
                          { color: ROLE_COLOR[member.role] },
                        ]}
                      >
                        {member.first_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName}>
                        {member.first_name} {member.last_name}
                      </Text>
                      <View style={styles.staffMeta}>
                        <View
                          style={[
                            styles.rolePill,
                            { backgroundColor: ROLE_BG_HEX[member.role] },
                          ]}
                        >
                          <Text
                            style={[
                              styles.rolePillText,
                              { color: ROLE_COLOR[member.role] },
                            ]}
                          >
                            {member.role}
                          </Text>
                        </View>
                        <Text style={styles.staffEmail}>{member.email}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.iconBtn,
                        {
                          borderColor: C.roseBg,
                          backgroundColor: C.roseBg,
                        },
                      ]}
                      onPress={() =>
                        handleRemoveFromBranch(
                          member.id,
                          `${member.first_name} ${member.last_name}`
                        )
                      }
                    >
                      <MaterialCommunityIcons
                        name="account-remove-outline"
                        size={18}
                        color={C.rose}
                      />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions
            style={{ justifyContent: 'space-between', paddingHorizontal: 8 }}
          >
            <Button
              onPress={openAssignStaff}
              icon="account-plus-outline"
              textColor={C.accent}
            >
              Assign Staff
            </Button>
            <Button onPress={() => setBranchStaffVisible(false)} textColor={C.muted}>
              Close
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Assign Staff to Branch ── */}
        <Dialog
          visible={assignStaffVisible}
          onDismiss={() => setAssignStaffVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Assign to {selectedBranch?.name}</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 400 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
              {unassignedStaff.length === 0 ? (
                <Text style={[styles.emptyText, { paddingVertical: 24 }]}>
                  All staff are already assigned to a branch
                </Text>
              ) : (
                unassignedStaff.map((member, idx) => {
                  const isSelected = selectedAssignStaff.includes(member.id);
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.staffRow,
                        { paddingHorizontal: 4 },
                        isSelected && { backgroundColor: C.violetBg },
                        idx < unassignedStaff.length - 1 && styles.rowDivider,
                      ]}
                      onPress={() =>
                        setSelectedAssignStaff((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== member.id)
                            : [...prev, member.id]
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.staffAvatar,
                          {
                            backgroundColor: isSelected
                              ? C.violetBg
                              : ROLE_BG_HEX[member.role],
                          },
                        ]}
                      >
                        {isSelected ? (
                          <MaterialCommunityIcons
                            name="check"
                            size={20}
                            color={C.accent}
                          />
                        ) : (
                          <Text
                            style={[
                              styles.staffAvatarText,
                              { color: ROLE_COLOR[member.role] },
                            ]}
                          >
                            {member.first_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.staffName,
                            isSelected && { color: C.accent },
                          ]}
                        >
                          {member.first_name} {member.last_name}
                        </Text>
                        <View style={styles.staffMeta}>
                          <View
                            style={[
                              styles.rolePill,
                              { backgroundColor: ROLE_BG_HEX[member.role] },
                            ]}
                          >
                            <Text
                              style={[
                                styles.rolePillText,
                                { color: ROLE_COLOR[member.role] },
                              ]}
                            >
                              {member.role}
                            </Text>
                          </View>
                          <Text style={styles.staffEmail}>{member.email}</Text>
                          {member.branch_id && (
                            <Text style={[styles.txCount, { color: C.amber }]}>
                              (in another branch)
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button
              onPress={() => setAssignStaffVisible(false)}
              textColor={C.muted}
            >
              Cancel
            </Button>
            <Button
              onPress={handleAssignStaff}
              loading={assigningStaff}
              disabled={assigningStaff || selectedAssignStaff.length === 0}
              textColor={C.accent}
            >
              Assign ({selectedAssignStaff.length})
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* ── Bulk Import CSV ── */}
        <Dialog
          visible={importVisible}
          onDismiss={() => setImportVisible(false)}
          style={styles.dialog}
        >
          <Dialog.Title>Bulk Import Products</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 460 }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
              <Text style={{ color: C.muted, marginBottom: 10, lineHeight: 18 }}>
                Paste CSV content below. Required header columns:{' '}
                <Text style={{ fontWeight: '700', color: C.ink }}>
                  category, name, sku, selling_price
                </Text>
                .
              </Text>

              {branches.length > 1 && (
                <>
                  <Text style={styles.radioLabel}>Import into branch</Text>
                  <RadioButton.Group
                    onValueChange={(v) => setImportBranchId(v)}
                    value={importBranchId ?? ''}
                  >
                    {branches.map((b) => (
                      <RadioButton.Item
                        key={b.id}
                        label={b.name}
                        value={b.id}
                        color={C.accent}
                        style={{ paddingVertical: 2 }}
                      />
                    ))}
                  </RadioButton.Group>
                </>
              )}

              <TextInput
                label="CSV content"
                value={importCsv}
                onChangeText={setImportCsv}
                mode="outlined"
                style={[styles.dialogInput, { minHeight: 200 }]}
                multiline
                numberOfLines={10}
                outlineColor={C.border}
                activeOutlineColor={C.accent}
                theme={{ colors: { background: C.card } }}
                placeholder="category,name,sku,marked_price,..."
              />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button
              onPress={() => setImportVisible(false)}
              textColor={C.muted}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onPress={handleBulkImport}
              loading={importing}
              disabled={importing}
              textColor={C.accent}
            >
              Import
            </Button>
          </Dialog.Actions>
        </Dialog>

      </Portal>

      {/* Create Store wizard — provides its own Portal */}
      <CreateStoreWizard
        visible={createStoreVisible}
        onClose={() => setCreateStoreVisible(false)}
        onCreated={loadStores}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    paddingTop: 52,
    paddingBottom: 110,
    paddingHorizontal: 16,
  },

  // Page header
  pageHeader: {
    marginBottom: 20,
  },
  pageEyebrow: {
    fontSize: 13,
    color: C.muted,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: C.ink,
  },

  // Hero card
  heroCard: {
    borderRadius: R.xl,
    padding: 20,
    overflow: 'hidden',
    marginBottom: 14,
  },
  heroOrb: {
    position: 'absolute',
    right: -30,
    bottom: -30,
    width: 140,
    height: 140,
    borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroAvatar: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontWeight: '800',
    fontSize: 26,
    color: '#FFFFFF',
  },
  heroName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  heroEmail: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.85,
  },
  heroBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    textTransform: 'uppercase',
    overflow: 'hidden',
  },

  // Stats grid
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontWeight: '800',
    fontSize: 20,
    color: C.ink,
  },
  statLabel: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },

  // Card wrapper
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
  },

  // Navigation row (used by Manage Subscriptions, etc.)
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  navSubtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },

  // Section header
  // (defined in sub-component style object below)

  // Staff rows
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  staffAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  staffName: {
    fontWeight: '600',
    fontSize: 13,
    color: C.ink,
  },
  staffEmail: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  staffMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  txCount: {
    fontSize: 11,
    color: C.muted,
  },
  lastLogin: {
    fontSize: 10,
    color: C.border,
  },
  staffActions: {
    alignItems: 'center',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
  },
  toggleDesc: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  // Toggle widget
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 999,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  infoLabel: {
    fontSize: 13,
    color: C.muted,
  },
  infoValue: {
    fontSize: 13,
    color: C.ink,
    fontWeight: '500',
    maxWidth: 200,
    textAlign: 'right',
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  healthBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  healthBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.accent,
  },

  // Form inputs
  input: {
    marginBottom: 10,
    backgroundColor: C.card,
  },

  // Solid button (save / apply)
  solidBtn: {
    backgroundColor: C.ink,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  solidBtnText: {
    color: C.bg,
    fontSize: 14,
    fontWeight: '700',
  },

  // Logout button
  logoutBtn: {
    width: '100%',
    padding: 14,
    borderRadius: R.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(225,29,107,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 0,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.red,
  },

  // Empty state
  emptyText: {
    textAlign: 'center',
    color: C.muted,
    paddingVertical: 20,
    fontSize: 14,
  },

  // Dialogs
  dialog: {
    borderRadius: 20,
    marginHorizontal: 16,
    backgroundColor: C.card,
  },
  dialogInput: {
    marginBottom: 12,
    backgroundColor: C.card,
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
    marginBottom: 4,
    marginTop: 4,
  },

  // About
  about: {
    alignItems: 'center',
    marginTop: 20,
    gap: 4,
  },
  aboutVersion: {
    fontSize: 11,
    color: C.muted,
  },
  aboutCopyright: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
  },
  aboutDev: {
    fontSize: 11,
    color: C.muted,
  },
});

// ─── Section header sub-component styles ──────────────────────
const sh = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: C.muted,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 999,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    position: 'absolute',
  },
});
