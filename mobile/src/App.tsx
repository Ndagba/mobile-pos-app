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
import { setSubscriptionAccess } from './redux/slices/subscriptionSlice';
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
  Analytics: { icon: 'chart-bar',        label: 'Analytics' },
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

// Ask the server whether this store's subscription is active and record the
// answer. We FAIL OPEN on a network error (leave accessActive untouched) so a
// connectivity blip never locks a paying store out — only a confirmed-inactive
// answer (or a 404 = no subscription) gates the app.
async function checkSubscriptionAccess() {
  try {
    const sub: any = await ApiClient.get('/subscriptions');
    store.dispatch(setSubscriptionAccess({ active: !!sub?.is_active }));
  } catch (error: any) {
    if (error?.response?.status === 404) {
      store.dispatch(setSubscriptionAccess({ active: false }));
    }
    // any other error (network/5xx) → leave current access state as-is
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
import AdminSubscriptionsScreen from './screens/AdminSubscriptionsScreen';
import SubscriptionLockedScreen from './screens/SubscriptionLockedScreen';
import OnboardingPaymentScreen from './screens/OnboardingPaymentScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ─── Role-based tab access ────────────────────────────────────
const ROLE_TABS: Record<string, string[]> = {
  admin:   ['Dashboard', 'Inventory', 'Customers', 'Analytics', 'Settings'],
  manager: ['Dashboard', 'Inventory', 'Customers', 'Analytics', 'Settings'],
  cashier: ['Dashboard', 'Customers', 'Settings'],
};

// ─── Main tabs (no Checkout — it lives in the Stack as a modal) ──
function MainTabs() {
  const auth = useSelector((state: RootState) => state.auth);
  const role = auth.user?.role ?? 'cashier';
  const allowedTabs = ROLE_TABS[role] ?? ROLE_TABS['cashier'];
  const can = (tab: string) => allowedTabs.includes(tab);

  return (
    <Tab.Navigator
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
      {can('Analytics') && (
        <Tab.Screen name="Analytics" component={AnalyticsScreen} />
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
  const allowedTabs = ROLE_TABS[role] ?? ROLE_TABS['cashier'];
  const can = (tab: string) => allowedTabs.includes(tab);
  const [selectedTab, setSelectedTab] = useState('Dashboard');

  // Tab config with components — Dashboard and Settings are always available;
  // the rest are gated by role.
  const tabScreens = [
    { name: 'Dashboard', component: DashboardScreen },
    ...(can('Inventory') ? [{ name: 'Inventory', component: InventoryScreen }] : []),
    ...(can('Customers') ? [{ name: 'Customers', component: CustomersScreen }] : []),
    ...(can('Analytics') ? [{ name: 'Analytics', component: AnalyticsScreen }] : []),
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
      {/* Super-admin only: gating is enforced at the screen entry point */}
      <Stack.Screen
        name="AdminSubscriptions"
        component={AdminSubscriptionsScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

// ─── Subscription-locked root ─────────────────────────────────
// Replaces the whole authenticated app when the store's subscription is
// confirmed inactive. Only the lockout screen and the renewal flow are
// reachable — no Dashboard, no sales, nothing.
function SubscriptionLockedRoot() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SubscriptionLocked" component={SubscriptionLockedScreen} />
      <Stack.Screen name="OnboardingPayment" component={OnboardingPaymentScreen} />
    </Stack.Navigator>
  );
}

// ─── App navigator (auth gate) ────────────────────────────────
function AppNavigator() {
  const [isLoading, setIsLoading] = useState(true);
  const auth = useSelector((state: RootState) => state.auth);
  const subscription = useSelector((state: RootState) => state.subscription);

  useEffect(() => {
    bootstrapAsync();
  }, []);

  // After login — cache customers and check subscription access. NetInfo only
  // fires on connectivity changes, so a fresh login while already online would
  // otherwise miss both.
  useEffect(() => {
    if (auth.isAuthenticated) {
      prefetchCustomers();
      checkSubscriptionAccess();
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
          prefetchCustomers();
          // Re-verify access on reconnect so an expiry that happened while
          // offline gates the app as soon as connectivity returns.
          if (store.getState().auth.isAuthenticated) checkSubscriptionAccess();
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

  // Whole-store lockout: once the server confirms the subscription is inactive
  // (accessChecked && !accessActive), every role is gated behind the renewal
  // screen. Super admins are exempt so they can always manage the platform.
  const locked =
    subscription.accessChecked &&
    !subscription.accessActive &&
    !auth.user?.is_super_admin;

  return (
    <NavigationContainer>
      {auth.isAuthenticated ? (
        locked ? (
          <SubscriptionLockedRoot />
        ) : (
          <AuthenticatedRoot />
        )
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
