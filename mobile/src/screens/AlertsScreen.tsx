import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { C } from '../theme';
import { useAlerts } from '../hooks/useAlerts';
import { AlertKind, AppAlert } from '../utils/alerts';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICON: Record<AlertKind, IconName> = {
  sync: 'cloud-off-outline',
  out_of_stock: 'package-variant-remove',
  low_stock: 'package-variant-minus',
  expiring: 'calendar-clock',
};

// Where a tap leads. Stock alerts open Purchasing (to reorder), batches open
// Batches & expiry, pending syncs open sales history.
const TARGET: Record<AlertKind, string> = {
  sync: 'Transactions',
  out_of_stock: 'Purchasing',
  low_stock: 'Purchasing',
  expiring: 'Batches',
};

/**
 * Alerts (every role) — mobile counterpart of the desktop notifications bell:
 * sales waiting to sync for everyone, plus out-of-stock, low-stock and expiring
 * batches for admins and managers. Opened from the bell on the Dashboard.
 */
export default function AlertsScreen() {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const { alerts, loading, reload, canInventory } = useAlerts();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: AppAlert }) => {
    const danger = item.tone === 'danger';
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => navigation.navigate(TARGET[item.kind])}>
        <View style={[styles.icon, { backgroundColor: danger ? C.redBg : C.amberBg }]}>
          <MaterialCommunityIcons name={ICON[item.kind]} size={18} color={danger ? C.red : '#B45309'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{item.sub}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={C.muted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Dashboard" title="Alerts" onBack={() => navigation.goBack()} />
      {!online && canInventory && (
        <OfflineBanner message="You're offline. Stock and expiry alerts may be out of date; pending-sync is current." />
      )}

      {loading && alerts.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={a => a.key}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="check-circle-outline" size={48} color={C.green} />
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.sub}>
                {canInventory ? 'No pending syncs, low stock or expiring batches.' : 'No sales are waiting to sync.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 },
  listContent: { paddingHorizontal: 16, paddingBottom: 48, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: C.ink },
  sub: { fontSize: 12, color: C.muted, marginTop: 2 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginTop: 6 },
});
