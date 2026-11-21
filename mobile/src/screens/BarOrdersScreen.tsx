import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { barOrderAmount, reportRangePresets, type BarOrder } from '@jaypos/shared';

import { RootState } from '../redux/store';

import { barApi, barErrorMessage } from '../services/barApi';
import { usePolling } from '../hooks/usePolling';
import { useBarCache } from '../hooks/useBarCache';
import { barBusinessToday } from '../utils/barBusinessDate';
import { useBusinessMode } from '../hooks/useBusinessMode';
import { BarOrderCard, DayPicker } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Bar order lists (planning Phase 2).
 *  - mode 'mine'  — an Attendant's own orders (server-scoped), refreshes every 10 s.
 *  - mode 'queue' — the Bar Controller's queue for their branch, oldest first,
 *                   refreshes every 5 s.
 * Polling only runs while the screen is focused and the app is in the foreground.
 * The queue can be narrowed to one Attendant (client-side; default All), and a
 * header Refresh button reloads on demand for slow networks.
 *
 * Tabs: Open = waiting / being prepared; Released = drinks handed over (sold);
 * Closed = finished WITHOUT a sale: cancelled by the Attendant, rejected by the
 * Bar Controller, or reversed by a manager. Closed is history only; there is no
 * "close" action, orders land there by those three routes.
 *
 * Attendant (mode 'mine') Released / Closed tabs have a business-date filter
 * (presets + From/To, default Today), filtered server-side on submission time.
 * Each tab keeps its last list in memory, so switching tabs or coming back
 * shows it at once while it refreshes.
 */

type Mode = 'mine' | 'queue';
const TABS: { key: string; label: string; status?: string; hint?: string }[] = [
  { key: 'open', label: 'Open', status: undefined },
  { key: 'released', label: 'Released', status: 'fulfilled,reversal_requested' },
  {
    key: 'closed',
    label: 'Closed',
    status: 'cancelled,rejected,reversed',
    hint: 'Orders that ended without a sale: cancelled by the Attendant, rejected by the Bar Controller, or reversed by a manager. Nothing to action here.',
  },
];

export default function BarOrdersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const online = useIsOnline();
  const mode: Mode = route.params?.mode === 'queue' ? 'queue' : 'mine';
  const { can } = useBusinessMode();

  // Managers also get a Reversals tab (Phase 3: requests waiting for approval).
  const tabs =
    mode === 'queue' && can('bar.reversal.approve')
      ? [...TABS, { key: 'reversals', label: 'Reversals', status: 'reversal_requested' }]
      : TABS;
  const [tab, setTab] = useState<string>(route.params?.tab ?? 'open');

  // Date filter (Attendant history tabs only). Business "today" from store settings.
  const settings = useSelector((s: RootState) => s.settings.settings);
  const today = barBusinessToday({ cutoffHour: settings?.bar_business_day_cutoff_hour, timeZone: settings?.bar_timezone });
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const from = range?.from ?? today;
  const to = range?.to ?? today;
  const dated = mode === 'mine' && (tab === 'released' || tab === 'closed');
  const presets = useMemo(() => reportRangePresets(today), [today]);

  const [orders, setOrders] = useBarCache<BarOrder[] | null>(
    `orders:${mode}:${tab}${dated ? `:${from}:${to}` : ''}`,
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloading, setReloading] = useState(false);
  // Attendant filter (queue only). Remember every attendant seen so a chip doesn't
  // vanish when their orders leave the current tab.
  const [attendant, setAttendant] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});

  const status = tabs.find((t) => t.key === tab)?.status;

  const load = useCallback(async () => {
    try {
      const list =
        mode === 'queue'
          ? await barApi.queue(status)
          : await barApi.mine(status ?? 'submitted,accepted', dated ? { from, to } : {});
      setOrders(list);
      setError(null);
      if (mode === 'queue' && list.length) {
        setSeen((m) => {
          let changed = false;
          const out = { ...m };
          for (const o of list) {
            if (o.initiated_by?.id && !out[o.initiated_by.id]) {
              out[o.initiated_by.id] = o.initiated_by.name || 'Attendant';
              changed = true;
            }
          }
          return changed ? out : m;
        });
      }
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load orders.'));
    }
  }, [mode, status, dated, from, to, setOrders]);

  usePolling(load, mode === 'queue' ? 5000 : 10000);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const onReloadPress = async () => {
    if (reloading) return;
    setReloading(true);
    await load();
    setReloading(false);
  };

  const attendants = useMemo(
    () => Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1])),
    [seen]
  );
  const shown = useMemo(
    () => (orders && attendant ? orders.filter((o) => o.initiated_by?.id === attendant) : orders),
    [orders, attendant]
  );
  const hint = tabs.find((t) => t.key === tab)?.hint;

  const allowed = mode === 'queue' ? can('bar.order.queue.view') : can('bar.order.create');
  const title = mode === 'queue' ? 'Order queue' : 'My orders';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Bar"
        title={title}
        onBack={() => navigation.goBack()}
        right={
          allowed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={onReloadPress}
                disabled={reloading}
                accessibilityLabel="Refresh"
                style={styles.refreshBtn}
              >
                {reloading ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <MaterialCommunityIcons name="refresh" size={20} color={C.ink} />
                )}
              </TouchableOpacity>
              {mode === 'mine' && (
                <TouchableOpacity onPress={() => navigation.navigate('BarNewOrder')} accessibilityLabel="New order" style={styles.newBtn}>
                  <MaterialCommunityIcons name="plus" size={18} color={C.accentFg} />
                  <Text style={styles.newText}>New</Text>
                </TouchableOpacity>
              )}
            </View>
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
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.label}
                  {t.key === 'open' && shown && tab === 'open' ? ` (${shown.length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'queue' && attendants.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.filterRow}
            >
              <Text style={styles.filterLabel}>Attendant</Text>
              {[[null, 'All'] as [string | null, string], ...attendants].map(([id, name]) => {
                const active = attendant === id;
                return (
                  <TouchableOpacity
                    key={id ?? '__all'}
                    onPress={() => setAttendant(id)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.filterText, active && { color: C.accentFg }]} numberOfLines={1}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          {dated && (
            <View style={styles.dateBox}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {presets.map((p) => {
                  const active = from === p.from && to === p.to;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => setRange({ from: p.from, to: p.to })}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.filterText, active && { color: C.accentFg }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.rangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rangeLabel}>From</Text>
                  <DayPicker date={from} today={to} onChange={(d) => setRange({ from: d, to })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rangeLabel}>To</Text>
                  <DayPicker date={to} today={today} onChange={(d) => setRange({ from: d < from ? d : from, to: d })} />
                </View>
              </View>
              {shown && shown.length > 0 && (
                <Text style={styles.rangeSummary}>
                  {shown.length} order{shown.length === 1 ? '' : 's'}
                  {tab === 'released' ? ` · ${naira(shown.reduce((a, o) => a + barOrderAmount(o), 0))}` : ''}
                </Text>
              )}
            </View>
          )}
          {!!hint && <Text style={styles.hint}>{hint}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <FlatList
            data={shown ?? []}
            keyExtractor={(o) => o.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
            ListEmptyComponent={
              orders === null ? null : (
                <Text style={[styles.muted, { textAlign: 'center', marginTop: 32 }]}>
                  {attendant && orders?.length
                    ? 'No orders from this Attendant here.'
                    : tab === 'open'
                    ? mode === 'queue'
                      ? 'No orders waiting. New orders appear here automatically.'
                      : 'No open orders.'
                    : dated
                    ? 'No orders in this period.'
                    : 'Nothing here yet.'}
                </Text>
              )
            }
            renderItem={({ item }) => (
              <BarOrderCard
                order={item}
                showAttendant={mode === 'queue'}
                onPress={() => navigation.navigate('BarOrderDetail', { id: item.id, preview: item })}
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
  refreshBtn: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  filterLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginRight: 2 },
  filterChip: { maxWidth: 160, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  filterChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterText: { fontSize: 12, fontWeight: '700', color: C.ink },
  dateBox: { paddingBottom: 6 },
  rangeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  rangeLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center', textTransform: 'uppercase' },
  rangeSummary: { fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'center', paddingTop: 4 },
  hint: { fontSize: 12, lineHeight: 17, color: C.muted, paddingHorizontal: 16, marginBottom: 8 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.accent },
  newText: { color: C.accentFg, fontWeight: '700', fontSize: 13 },
});
