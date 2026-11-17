import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { reportRangePresets, reportTableToCsv, type ReportCatalog, type ReportTable } from '@jaypos/shared';

import { barApi, barErrorMessage } from '../services/barApi';
import { DayPicker } from '../components/bar/BarBits';
import { C, naira } from '../theme';
import {
  OfflineBanner, PurchasingHeader as ScreenHeader, useIsOnline,
} from '../components/purchasing/PurchasingBits';

/**
 * Bar / Lounge reports (Phase 5). Without a `report` param: the catalogue.
 * With one: a generic viewer for any report — every report returns the same
 * columns + rows + totals shape, so this one screen renders all ten, with date
 * presets, a scrollable table, and CSV sharing (opens in Excel / Sheets).
 * Managers see all ten; Bar Controllers a daily-operations subset for recent days.
 */
export default function BarReportsScreen() {
  const route = useRoute<any>();
  return route.params?.report ? <ReportView reportKey={route.params.report} title={route.params.title} /> : <Catalog />;
}

function Catalog() {
  const navigation = useNavigation<any>();
  const [cat, setCat] = useState<ReportCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    barApi.reportCatalog().then(setCat).catch((e) => setError(barErrorMessage(e, 'Could not load reports.')));
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="Bar" title="Reports" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!cat && !error && <ActivityIndicator color={C.accent} />}
        {cat?.max_days_back && (
          <Text style={[styles.muted, { marginBottom: 10 }]}>Bar Controllers can see the last {cat.max_days_back} days.</Text>
        )}
        {cat?.reports.map((r) => (
          <TouchableOpacity
            key={r.key}
            style={styles.item}
            onPress={() => navigation.push('BarReports', { report: r.key, title: r.title })}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{r.title}</Text>
              <Text style={styles.muted}>{r.description}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={C.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function fmt(v: unknown, type: string) {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money' && typeof v === 'number') return naira(v);
  if (type === 'percent' && typeof v === 'number') return `${v}%`;
  if (type === 'number' && typeof v === 'number') return v.toLocaleString('en-NG');
  return String(v);
}

function ReportView({ reportKey, title }: { reportKey: string; title?: string }) {
  const navigation = useNavigation<any>();
  const online = useIsOnline();
  const [today, setToday] = useState<string | null>(null);
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState<string | undefined>(undefined);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await barApi.report(reportKey, from, to);
      setTable(t);
      if (!today) setToday(t.to);
      setError(null);
    } catch (e) {
      setError(barErrorMessage(e, 'Could not load the report.'));
    } finally {
      setLoading(false);
    }
  }, [reportKey, from, to, today]);

  useEffect(() => {
    load();
  }, [reportKey, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const presets = useMemo(() => (today ? reportRangePresets(today) : []), [today]);
  const single = reportKey === 'outstanding'; // "as of now" report: no range

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Bar report"
        title={table?.title ?? title ?? 'Report'}
        onBack={() => navigation.goBack()}
        right={
          table ? (
            <TouchableOpacity
              onPress={() => Share.share({ message: reportTableToCsv(table), title: `${table.title}.csv` }).catch(() => {})}
              style={styles.share}
              accessibilityLabel="Share as CSV"
            >
              <MaterialCommunityIcons name="file-delimited-outline" size={18} color={C.accentFg} />
              <Text style={styles.shareText}>CSV</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      {!online && <OfflineBanner message="You're offline. Reports need a connection." />}
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.accent} />}>
        {!!table?.description && <Text style={[styles.muted, { marginBottom: 8 }]}>{table.description}</Text>}

        {!single && today && (
          <>
            <View style={styles.presets}>
              {presets.map((p) => {
                const active = table?.from === p.from && table?.to === p.to;
                return (
                  <TouchableOpacity key={p.key} onPress={() => { setFrom(p.from); setTo(p.to); }} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {table && (
              <View style={styles.rangeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rangeLabel}>From</Text>
                  <DayPicker date={table.from} today={table.to} onChange={setFrom} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rangeLabel}>To</Text>
                  <DayPicker date={table.to} today={today} onChange={setTo} />
                </View>
              </View>
            )}
          </>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
        {table && table.rows.length === 0 && <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>Nothing in this period.</Text>}
        {table && table.rows.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.tableWrap}>
            <View>
              <View style={[styles.tr, styles.thead]}>
                {table.columns.map((c) => (
                  <Text key={c.key} style={[styles.th, isNumeric(c.type) && styles.right]}>{c.label}</Text>
                ))}
              </View>
              {table.rows.map((r, i) => (
                <View key={i} style={[styles.tr, i % 2 === 1 && styles.zebra]}>
                  {table.columns.map((c) => (
                    <Text key={c.key} style={[styles.td, isNumeric(c.type) && styles.right, typeof r[c.key] === 'number' && (r[c.key] as number) < 0 && { color: C.red }]} numberOfLines={2}>
                      {fmt(r[c.key], c.type)}
                    </Text>
                  ))}
                </View>
              ))}
              {table.totals && (
                <View style={[styles.tr, styles.tfoot]}>
                  {table.columns.map((c) => (
                    <Text key={c.key} style={[styles.td, styles.bold, isNumeric(c.type) && styles.right]}>
                      {table.totals![c.key] === undefined ? '' : fmt(table.totals![c.key], c.type)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </ScrollView>
    </View>
  );
}

const isNumeric = (t: string) => t === 'money' || t === 'number' || t === 'percent';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
  error: { color: C.red, marginVertical: 8 },
  muted: { fontSize: 12, color: C.muted, lineHeight: 17 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 8 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 2 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.accent },
  shareText: { color: C.accentFg, fontWeight: '700', fontSize: 13 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { backgroundColor: C.ink, borderColor: C.ink },
  chipText: { fontSize: 12, fontWeight: '700', color: C.ink },
  chipTextActive: { color: C.card },
  rangeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  rangeLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textAlign: 'center', textTransform: 'uppercase' },
  tableWrap: { marginTop: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border },
  tr: { flexDirection: 'row' },
  thead: { borderBottomWidth: 1, borderBottomColor: C.border },
  tfoot: { borderTopWidth: 1, borderTopColor: C.border },
  zebra: { backgroundColor: 'rgba(14,14,16,0.025)' },
  th: { width: 130, padding: 10, fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase' },
  td: { width: 130, padding: 10, fontSize: 13, color: C.ink, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  bold: { fontWeight: '800' },
});
