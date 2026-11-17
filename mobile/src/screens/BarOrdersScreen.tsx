import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { BarOrder } from '@jaypos/shared';

import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { BarOrderCard } from '../components/bar/BarBits';
import { C } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Bar order lists (planning Phase 2).
 *  - mode 'mine'  — an Attendant's own orders (server-scoped), refreshes every 10 s.
 *  - mode 'queue' — the Bar Controller's queue for their branch, oldest first,
 *                   refreshes every 5 s.
 * Polling only runs while the screen is focused and the app is in the foreground.
 */

type Mode = 'mine' | 'queue';
const TABS: { key: string; label: string; status?: string }[] = [
  { key: 'open', label: 'Open', status: undefined },
  { key: 'released', label: 'Released', status: 'fulfilled' },
  { key: 'closed', label: 'Closed', status: 'cancelled,rejected,reversed' },
];

export default function BarOrdersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const online = useIsOnline();
  const mode: Mode = route.params?.mode === 'queue' ? 'queue' : 'mine';
  const { can } = useBusinessMode();

  const [tab, setTab] = useState('open');
  const [orders, setOrders] = useState<BarOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const status = TABS.find((t) => t.key === tab)?.status;

  const load = useCallback(async () => {
    try {
      const list =
        mode === 'queue'
          ? await barApi.queue(status)
          : await barApi.mine(status ?? 'submitted,accepted');
      setOrders(list);
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load orders.'));
    }
  }, [mode, status]);

  usePolling(load, mode === 'queue' ? 5000 : 10000);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const allowed = mode === 'queue' ? can('bar.order.queue.view') : can('bar.order.create');
  const title = mode === 'queue' ? 'Order queue' : 'My orders';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Bar"
        title={title}
        onBack={() => navigation.goBack()}
        right={
          mode === 'mine' && allowed ? (
            <TouchableOpacity onPress={() => navigation.navigate('BarNewOrder')} accessibilityLabel="New order" style={styles.newBtn}>
              <MaterialCommunityIcons name="plus" size={18} color={C.accentFg} />
              <Text style={styles.newText}>New</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      {!online && <OfflineBanner message="You're offline. The list may be out of date." />}

      {!allowed ? (
        <View style={[styles.card, { margin: 16 }]}>
          <Text style={styles.body}>You don't have access to this list.</Text>
        </View>
      ) : (
        <>
          <View style={styles.tabs}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => {
                  setTab(t.key);
                  setOrders(null);
                }}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.label}
                  {t.key === 'open' && orders && tab === 'open' ? ` (${orders.length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <FlatList
            data={orders ?? []}
            keyExtractor={(o) => o.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
            ListEmptyComponent={
              orders === null ? null : (
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 32 }]}>
                  {tab === 'open'
                    ? mode === 'queue'
                      ? 'No orders waiting. New orders appear here automatically.'
                      : 'No open orders.'
                    : 'Nothing here yet.'}
                </Text>
              )
            }
            renderItem={({ item }) => (
              <BarOrderCard
                order={item}
                showAttendant={mode === 'queue'}
                onPress={() => navigation.navigate('BarOrderDetail', { id: item.id })}
              />
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
  body: { fontSize: 14, color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  error: { color: C.red, fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  tabActive: { backgroundColor: C.ink, borderColor: C.ink },
  tabText: { fontSize: 13, fontWeight: '700', color: C.ink },
  tabTextActive: { color: C.card },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.accent },
  newText: { color: C.accentFg, fontWeight: '700', fontSize: 13 },
});
