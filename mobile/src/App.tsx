import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider, useSelector } from 'react-redux';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PaperProvider } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

import { store, RootState } from './redux/store';
import DatabaseService from './services/DatabaseService';
import ApiClient from './services/ApiClient';
import { SyncManager } from './services/SyncManager';
import NotificationService from './services/NotificationService';
import { setConnected, setLastSyncAt, setSyncMode, clearSyncQueue } from './redux/slices/syncSlice';
import { setStoreSettings } from './redux/slices/settingsSlice';
import FloatingTabBar from './components/ui/FloatingTabBar';
import { useResponsive, responsiveSpacing, responsiveFontSize } from './utils/responsiveDesign';
import { C } from './theme';

// Icons + labels used in the tablet sidebar — kept in sync with the role
// permissions table below.
type SidebarIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const SIDEBAR_META: Record<string, { icon: SidebarIcon; label: string }> = {
  Dashboard: { icon: 'view-dashboard',   label: 'Home'      },
  Inventory: { icon: 'package-variant',  label: 'Inventory' },
  Customers: { icon: 'account-multiple', label: 'Customers' },
  Suppliers: { icon: 'truck-outline',    label: 'Suppliers' },
  Analytics: { icon: 'chart-bar',        label: 'Analytics' },
  Admin:     { icon: 'shield-account',   label: 'Admin'     },
  Settings:  { icon: 'cog',              label: 'Settings'  },
};

// Push any transactions made offline up to the server, then mark them synced.
async function runPendingSync() {
  try {
    const unsynced = await DatabaseService.getUnsyncedTransactions();
    if (unsynced && unsynced.length > 0) {
      const deviceId = (await SecureStore.getItemAsync('device_id')) || 'unknown';
      const result = await SyncManager.syncPendingTransactions(deviceId);
      if (result.synced > 0) {
        store.dispatch(setLastSyncAt(new Date().toISOString()));
      }
      const remaining = await DatabaseService.getUnsyncedTransactions();
      if (!remaining || remaining.length === 0) {
        store.dispatch(clearSyncQueue());
        store.dispatch(setSyncMode('ONLINE'));
      }
    } else {
      store.dispatch(setSyncMode('ONLINE'));
    }
  } catch {
    // offline or sync failed — will retry on the next reconnect
  }
}

async function prefetchSettings() {
  try {
    const res: any = await ApiClient.get('/settings');
    const data = res?.data ?? res;
    store.dispatch(setStoreSettings({
      allow_cashier_add_customers: data?.allow_cashier_add_customers ?? true,
      allow_cashier_edit_customers: data?.allow_cashier_edit_customers ?? true,
      customer_menu_enabled: data?.customer_menu_enabled ?? true,
      supplier_menu_enabled: data?.supplier_menu_enabled ?? true,
    }));
  } catch (e) {
    console.warn('Failed to prefetch store settings:', e);
  }
}

// Cache customers locally so the Customers screen works with no connection.
async function prefetchCustomers() {
  try {
    const res: any = await ApiClient.get('/customers?limit=200');
    const items = Array.isArray(res) ? res : res?.data ?? [];
    if (items.length > 0) await DatabaseService.saveCustomers(items);
  } catch {
    // offline — the Customers screen falls back to whatever is already cached
  }
}

// Screens
import AuthScreen          from './screens/AuthScreen';
import DashboardScreen     from './screens/DashboardScreen';
import CheckoutScreen      from './screens/CheckoutScreen';
import InventoryScreen     from './screens/InventoryScreen';
import AnalyticsScreen     from './screens/AnalyticsScreen';
import SettingsScreen      from './screens/SettingsScreen';
import TransactionsScreen  from './screens/TransactionsScreen';
import CustomersScreen     from './screens/CustomersScreen';
import CustomerLedgerScreen from './screens/CustomerLedgerScreen';
import SuppliersScreen from './screens/SuppliersScreen';
import SupplierLedgerScreen from './screens/SupplierLedgerScreen';
import AdminSubscriptionsScreen from './screens/AdminSubscriptionsScreen';
import AdminScreen from './screens/AdminScreen';
import StockCountsScreen from './screens/StockCountsScreen';
import CashShiftsScreen from './screens/CashShiftsScreen';
import EODReportsScreen from './screens/EODReportsScreen';
import AuditLogsScreen from './screens/AuditLogsScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Role-based tab access ────────────────────────────────────
const ROLE_TABS: Record<string, string[]> = {
  admin:   ['Dashboard', 'Inventory', 'Customers', 'Suppliers', 'Analytics', 'Admin', 'Settings'],
  manager: ['Dashboard', 'Inventory', 'Customers', 'Suppliers', 'Analytics', 'Admin', 'Settings'],
  cashier: ['Dashboard', 'Customers', 'Suppliers', 'Settings'],
};

// ─── Main tabs (no Checkout — it lives in the Stack as a modal) ──
function MainTabs() {
  const auth = useSelector((state: RootState) => state.auth);
  const settings = useSelector((state: RootState) => state.settings.settings);
  const role = auth.user?.role ?? 'cashier';
  const allowedTabs = ROLE_TABS[role] ?? ROLE_TABS['cashier'];
  const can = (tab: string) => {
    if (tab === 'Customers') {
      const isEnabled = settings?.customer_menu_enabled ?? true;
      if (role === 'cashier' && !isEnabled) return false;
    }
    if (tab === 'Suppliers') {
      const isEnabled = settings?.supplier_menu_enabled ?? true;
      if (role === 'cashier' && !isEnabled) return false;
    }
    return allowedTabs.includes(tab);
  };

  return (
    <Tab.Navigator
      id="tabs"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // The actual tab bar is our custom component; hide the default one
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {can('Inventory') && (
        <Tab.Screen name="Inventory" component={InventoryScreen} />
      )}
      {can('Customers') && (
        <Tab.Screen name="Customers" component={CustomersScreen} />
      )}
      {can('Suppliers') && (
        <Tab.Screen name="Suppliers" component={SuppliersScreen} />
      )}
      {can('Analytics') && (
        <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      )}
      {can('Admin') && (
        <Tab.Screen name="Admin" component={AdminScreen} />
      )}
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ─── Tablet navigation root ───────────────────────────────────
// Wraps the persistent sidebar layout (TabletMain) plus secondary flows
// that should appear as modals on top of it (Checkout, Transactions, etc).
// Role-based filtering happens inside TabletMainContent where the sidebar
// is actually rendered.
function TabletNavigationRoot() {
  return (
    <Stack.Navigator id="tablet" screenOptions={{ headerShown: false }}>
      {/* Tablet sidebar navigation with screens */}
      <Stack.Screen
        name="TabletMain"
        component={TabletMainContent}
        options={{ headerShown: false }}
      />
      {/* Modals that appear on top of tablet layout */}
      <Stack.Group screenOptions={{ presentation: 'modal', animation: 'slide_from_bottom' }}>
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} />
        <Stack.Screen name="CustomerLedger" component={CustomerLedgerScreen} />
        <Stack.Screen name="SupplierLedger" component={SupplierLedgerScreen} />
        <Stack.Screen name="StockCounts" component={StockCountsScreen} />
        <Stack.Screen name="CashShifts" component={CashShiftsScreen} />
        <Stack.Screen name="EODReports" component={EODReportsScreen} />
        <Stack.Screen name="AuditLogs" component={AuditLogsScreen} />
        {/* Super-admin only: gating is enforced at the screen entry point */}
        <Stack.Screen name="AdminSubscriptions" component={AdminSubscriptionsScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}

// ─── Tablet main content with sidebar ──────────────────────────
function TabletMainContent({ navigation }: any) {
  const auth = useSelector((state: RootState) => state.auth);
  const insets = useSafeAreaInsets();
  const { isPortrait, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);
  const role = auth.user?.role ?? 'cashier';
  const settings = useSelector((state: RootState) => state.settings.settings);
  const allowedTabs = ROLE_TABS[role] ?? ROLE_TABS['cashier'];
  const can = (tab: string) => {
    if (tab === 'Customers') {
      const isEnabled = settings?.customer_menu_enabled ?? true;
      if (role === 'cashier' && !isEnabled) return false;
    }
    if (tab === 'Suppliers') {
      const isEnabled = settings?.supplier_menu_enabled ?? true;
      if (role === 'cashier' && !isEnabled) return false;
    }
    return allowedTabs.includes(tab);
  };
  const [selectedTab, setSelectedTab] = useState('Dashboard');

  // Tab config with components — Dashboard and Settings are always available;
  // the rest are gated by role.
  const tabScreens = [
    { name: 'Dashboard', component: DashboardScreen },
    ...(can('Inventory') ? [{ name: 'Inventory', component: InventoryScreen }] : []),
    ...(can('Customers') ? [{ name: 'Customers', component: CustomersScreen }] : []),
    ...(can('Suppliers') ? [{ name: 'Suppliers', component: SuppliersScreen }] : []),
    ...(can('Analytics') ? [{ name: 'Analytics', component: AnalyticsScreen }] : []),
    ...(can('Admin') ? [{ name: 'Admin', component: AdminScreen }] : []),
    { name: 'Settings', component: SettingsScreen },
  ];

  // Keep all sibling screens mounted but hidden so tab switches don't drop
  // state (scroll position, filters, in-progress edits). Each screen mounts
  // once on first visit and stays alive for the session.
  const [mounted, setMounted] = useState<Record<string, boolean>>({ Dashboard: true });
  useEffect(() => {
    if (!mounted[selectedTab]) {
      setMounted((m) => ({ ...m, [selectedTab]: true }));
    }
  }, [selectedTab]);

  const sidebarWidth = isPortrait ? '25%' : '20%';
  const openCheckout = () => navigation?.navigate?.('Checkout');

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      {/* Sidebar */}
      <View
        style={{
          width: sidebarWidth,
          backgroundColor: C.card,
          borderRightWidth: 1,
          borderRightColor: C.border,
          // Respect the status bar / notch so the top item is tappable.
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          paddingHorizontal: spacing.sm,
        }}
      >
        {/* "New Sale" CTA — the equivalent of the FAB on phone */}
        <TouchableOpacity
          onPress={openCheckout}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="New Sale"
          style={{
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: spacing.md,
          }}
        >
          <LinearGradient
            colors={[C.accent, C.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.sm,
            }}
          >
            <MaterialCommunityIcons
              name="cart-outline"
              size={fontSize.lg}
              color={C.accentFg}
            />
            <Text
              style={{
                fontSize: fontSize.sm,
                fontWeight: '800',
                color: C.accentFg,
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              NEW SALE
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ gap: spacing.xs }}>
          {tabScreens.map((tab) => {
            const meta = SIDEBAR_META[tab.name] ?? { icon: 'circle-outline', label: tab.name };
            const active = selectedTab === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => setSelectedTab(tab.name)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={meta.label}
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingVertical: spacing.sm + 2,
                  paddingHorizontal: spacing.sm,
                  borderRadius: 10,
                  backgroundColor: active ? C.violetBg : 'transparent',
                  // Left rail accent for clearer active state — helps
                  // accessibility (not just colour-coded).
                  borderLeftWidth: 3,
                  borderLeftColor: active ? C.accent : 'transparent',
                }}
              >
                <MaterialCommunityIcons
                  name={meta.icon}
                  size={fontSize.lg}
                  color={active ? C.accent : C.muted}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: fontSize.sm,
                    fontWeight: active ? '700' : '500',
                    color: active ? C.accent : C.ink,
                    flex: 1,
                  }}
                >
                  {meta.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Content area — render each screen exactly once, then toggle
          visibility. Avoids losing scroll/filter state across tab switches. */}
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        {tabScreens.map((tab) => {
          if (!mounted[tab.name]) return null;
          const Screen = tab.component;
          const active = selectedTab === tab.name;
          return (
            <View
              key={tab.name}
              // `display: none` keeps the component mounted but invisible.
              // pointerEvents prevents stray touches on hidden screens.
              style={[
                StyleSheet.absoluteFill,
                { display: active ? 'flex' : 'none' },
              ]}
              pointerEvents={active ? 'auto' : 'none'}
            >
              <Screen />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Authenticated root: tabs + Checkout modal (Phone) ─────────
function AuthenticatedRoot() {
  const { isTablet } = useResponsive();

  // Use tablet navigation on tablets, phone navigation on phones
  if (isTablet) {
    return <TabletNavigationRoot />;
  }

  return (
    <Stack.Navigator id="main" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="CustomerLedger"
        component={CustomerLedgerScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="SupplierLedger"
        component={SupplierLedgerScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="StockCounts" component={StockCountsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="CashShifts" component={CashShiftsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="EODReports" component={EODReportsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="AuditLogs" component={AuditLogsScreen} options={{ presentation: 'modal' }} />
      {/* Super-admin only: gating is enforced at the screen entry point */}
      <Stack.Screen
        name="AdminSubscriptions"
        component={AdminSubscriptionsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

// ─── App navigator (auth gate) ────────────────────────────────
function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const auth = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    bootstrapAsync();
  }, []);

  // After login — cache settings and customers so the app works offline.
  useEffect(() => {
    if (auth.isAuthenticated) {
      prefetchSettings();
      prefetchCustomers();
    }
  }, [auth.isAuthenticated]);

  const bootstrapAsync = async () => {
    try {
      await DatabaseService.initialize();
      await NotificationService.configure();
      await NotificationService.requestPermissions();
      await NotificationService.syncScheduled();
      NetInfo.addEventListener((state) => {
        const online = state.isConnected ?? false;
        ApiClient.setOnlineStatus(online);
        store.dispatch(setConnected(online));
        if (online) {
          runPendingSync();
          prefetchSettings();
          prefetchCustomers();
        }
      });
    } catch (error) {
      console.error('Bootstrap error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  // Subscription is managed manually by the super admin for now. The app no
  // longer auto-locks the whole store based on subscription status — renewal
  // and status changes are handled from the admin tooling, not by gating login.
  return (
    <NavigationContainer>
      {auth.isAuthenticated ? (
        <AuthenticatedRoot />
      ) : (
        <Stack.Navigator id="auth" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <PaperProvider>
        <AppNavigator />
      </PaperProvider>
    </Provider>
  );
}
