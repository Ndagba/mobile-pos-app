import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, Platform, Modal, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import Svg, { Polyline, Polygon, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import { C, R, S, naira } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize } from '../utils/responsiveDesign';

// ─── Types ────────────────────────────────────────────────────
interface Branch { id: string; name: string; is_active: boolean; }

interface DashboardData {
  transaction_count: number;
  total_revenue: number;
  avg_transaction: number;
  total_items_sold: number;
  weekly_revenue: number;
  product_count: number;
  low_stock_count: number;
  payment_breakdown: Array<{ method: string; count: number; total: number }>;
  top_products: Array<{ id: string; name: string; sku: string; total_sold: number; total_revenue: number }>;
  recent_transactions: Array<{
    id: string; total_amount: number; payment_method: string;
    status: string; created_at: string; cashier: string; item_count: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────
const greet = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const today = new Date().toLocaleDateString('en-NG', {
  weekday: 'long', day: 'numeric', month: 'short',
});

const PAY_COLORS: Record<string, string> = {
  cash: C.accent, card: C.green, mobile_wallet: C.amber,
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', mobile_wallet: 'Transfer',
};

// ─── Sparkline shapes (placeholder trend, not to scale) ───────
const SPARK_TODAY = [4, 6, 9, 7, 12, 15, 18, 22, 26, 24, 31, 28];
const SPARK_WEEK  = [68, 72, 51, 90, 84, 102, 95];

// ─── Mini sparkline (SVG line + fill) ────────────────────────
function Sparkline({ data, color = 'rgba(255,255,255,0.9)', height = 50 }: {
  data: number[]; color?: string; height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');
  const area = `0,100 ${pts} 100,100`;
  return (
    <Svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <Defs>
        <SvgGradient id="sfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </SvgGradient>
      </Defs>
      <Polygon points={area} fill="url(#sfill)" />
      <Polyline
        points={pts} fill="none"
        stroke={color} strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round" strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────
function KpiTile({ icon, tone, label, value, sub }: {
  icon: string; tone: string; label: string; value: string; sub: string;
}) {
  const { deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  const iconSize = deviceType === 'large_tablet' ? 24 : deviceType === 'tablet' ? 20 : 18;
  const boxSize = deviceType === 'large_tablet' ? 44 : deviceType === 'tablet' ? 40 : 34;

  return (
    <View style={[kpi.tile, { flex: 1, padding: spacing.md }]}>
      <View style={[kpi.icon, { backgroundColor: tone + '1A', width: boxSize, height: boxSize, marginBottom: spacing.sm }]}>
        <MaterialCommunityIcons name={icon as any} size={iconSize} color={tone} />
      </View>
      <Text style={[kpi.label, { fontSize: fontSize.xs }]}>{label}</Text>
      <Text style={[kpi.value, { fontSize: fontSize.xxl }]}>{value}</Text>
      <Text style={[kpi.sub, { fontSize: fontSize.sm }]}>{sub}</Text>
    </View>
  );
}

const kpi = StyleSheet.create({
  tile: {
    backgroundColor: C.card, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.border,
  },
  icon: {
    borderRadius: R.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { color: C.muted, fontWeight: '600' },
  value: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '800', marginTop: 2, color: C.ink },
  sub: { color: C.muted, marginTop: 2 },
});

// ─── Section header ───────────────────────────────────────────
function SectionHdr({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  return (
    <View style={sh.row}>
      <Text style={sh.label}>{label}</Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={sh.action}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingVertical: 12 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.muted },
  action: { fontSize: 13, fontWeight: '600', color: C.accent },
});

// ─── IconBtn ─────────────────────────────────────────────────
function IconBtn({ icon, onPress }: { icon: string; onPress?: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={ib.btn} activeOpacity={0.7}>
      <MaterialCommunityIcons name={icon as any} size={20} color={C.ink} />
    </TouchableOpacity>
  );
}
const ib = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: R.sm,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Main Screen ──────────────────────────────────────────────
export default function DashboardScreen() {
  const navigation = useNavigation();
  const auth  = useSelector((state: RootState) => state.auth);
  const sync  = useSelector((state: RootState) => state.sync);
  const isAdmin = ['admin', 'manager'].includes(auth.user?.role ?? '');
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  const [data, setData]             = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange]           = useState<'today' | 'week'>('today');
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    loadBranches();
    load(null);
  }, []));

  const loadBranches = async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const list: Branch[] = Array.isArray(res) ? res : (res.branches ?? res.data ?? []);
      setBranches(list.filter((b: Branch) => b.is_active));
    } catch (e) {
      console.warn('loadBranches error', e);
    }
  };

  const load = async (branchId?: string | null) => {
    const bId = branchId !== undefined ? branchId : selectedBranchId;
    const params = bId ? `?branch_id=${bId}` : '';
    const cacheKey = `dashboard${params}`;

    // Stale-while-revalidate: render cached data instantly, refresh in background.
    const cached = await DatabaseService.getApiCache<DashboardData>(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const results = await Promise.allSettled([
      ApiClient.get(`/analytics/dashboard${params}`),
    ]);
    if (results[0].status === 'fulfilled') {
      const fresh = results[0].value as DashboardData;
      setData(fresh);
      DatabaseService.setApiCache(cacheKey, fresh);
    }
    setLoading(false);
  };

  const handleBranchSelect = (branchId: string | null) => {
    setSelectedBranchId(branchId);
    setBranchDropdownOpen(false);
    load(branchId);
  };

  const onRefresh = async () => { setRefreshing(true); await load(selectedBranchId); setRefreshing(false); };

  const openCheckout = () => (navigation as any).navigate('Checkout');

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  const payTotal = data?.payment_breakdown?.reduce((sum, p) => sum + p.total, 0) ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.content, { paddingHorizontal: spacing.xl }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerDate}>{today}</Text>
          <Text style={s.headerGreet}>{greet()}, {auth.user?.first_name ?? 'there'} 👋</Text>
        </View>
        <IconBtn icon="bell-outline" />
      </View>

      {/* ── Hero gradient card ──────────────────────────────── */}
      <LinearGradient
        colors={[C.accent, C.accent2]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[s.hero, { padding: spacing.xl }]}
      >
        {/* decorative orbs — pointerEvents none so they never eat touches */}
        <View pointerEvents="none" style={[s.orb, { right: -40, top: -40, width: 180, height: 180 }]} />
        <View pointerEvents="none" style={[s.orb, { right: 20, top: 80, width: 90, height: 90, opacity: 0.06 }]} />

        {/* Eyebrow + Today / Week toggle */}
        <View style={s.heroTopRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.heroEyebrow} numberOfLines={1}>
              {range === 'today' ? 'SALES TODAY' : 'SALES THIS WEEK'}
            </Text>
            {/* Branch dropdown pill — always visible so admin can filter */}
            <TouchableOpacity
              onPress={() => setBranchDropdownOpen(true)}
              activeOpacity={0.75}
              style={s.branchPill}
            >
              <MaterialCommunityIcons name="source-branch" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={s.branchPillText} numberOfLines={1}>
                {selectedBranchId
                  ? (branches.find(b => b.id === selectedBranchId)?.name ?? 'Branch')
                  : 'All Branches'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={13} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
          <View style={s.togglePill}>
            {(['today', 'week'] as const).map(k => (
              <TouchableOpacity
                key={k}
                onPress={() => setRange(k)}
                style={[s.toggleBtn, range === k && s.toggleBtnActive]}
                activeOpacity={0.75}
              >
                <Text style={[s.toggleText, range === k && s.toggleTextActive]}>
                  {k === 'today' ? 'Today' : 'Week'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Big amount */}
        <Text style={s.heroAmount}>
          <Text style={{ opacity: 0.7 }}>₦</Text>
          {Math.round(
            range === 'today' ? (data?.total_revenue ?? 0) : (data?.weekly_revenue ?? 0)
          ).toLocaleString()}
        </Text>

        {/* Delta pill + comparison label */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <View style={s.deltaPill}>
            <Text style={s.deltaText}>
              {range === 'today' ? '↗ +12.4%' : '↗ +18.4%'}
            </Text>
          </View>
          <Text style={s.heroCaption}>
            {range === 'today' ? 'vs yesterday' : 'vs last week'}
          </Text>
        </View>

        {/* Sub stats */}
        <Text style={s.heroSub}>
          {range === 'today'
            ? `${data?.transaction_count ?? 0} sales · avg ${naira(data?.avg_transaction ?? 0)}`
            : `Avg ${naira(Math.round((data?.weekly_revenue ?? 0) / 7))} / day · ${data?.transaction_count ?? 0} sales`}
        </Text>

        {/* Sparkline */}
        <View style={{ marginTop: 12, height: 42 }}>
          <Sparkline
            key={range}
            data={range === 'today' ? SPARK_TODAY : SPARK_WEEK}
            height={42}
          />
        </View>

        {/* Quick actions */}
        <View style={s.quickRow}>
          {[
            { icon: 'plus',        label: 'New Sale',  onPress: openCheckout },
            { icon: 'cash-refund', label: 'Refund',    onPress: () => (navigation as any).navigate('Transactions', { mode: 'refund' }) },
            { icon: 'receipt',     label: 'Receipts',  onPress: () => (navigation as any).navigate('Transactions') },
            { icon: 'qrcode-scan', label: 'Scan',      onPress: () => (navigation as any).navigate('Checkout', { autoScan: true }) },
          ].map((a) => (
            <TouchableOpacity key={a.label} onPress={a.onPress} activeOpacity={0.75} style={s.quickBtn}>
              <MaterialCommunityIcons name={a.icon as any} size={18} color={C.accentFg} />
              <Text style={s.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── Today at a glance ───────────────────────────────── */}
      <SectionHdr label="Today at a glance" />
      {isTablet ? (
        <View style={[s.kpiGrid, { gap: spacing.md }]}>
          <KpiTile icon="cash-multiple" tone={C.green} label="Revenue"
            value={naira(data?.total_revenue ?? 0)}
            sub={`${data?.transaction_count ?? 0} sales`} />
          <KpiTile icon="trending-up" tone={C.accent} label="Avg ticket"
            value={naira(data?.avg_transaction ?? 0)}
            sub="per transaction" />
          <KpiTile icon="package-variant" tone={C.amber} label="Items sold"
            value={String(data?.total_items_sold ?? 0)}
            sub="units today" />
          <KpiTile icon="alert-circle-outline" tone={C.rose} label="Low stock"
            value={String(data?.low_stock_count ?? 0)}
            sub="needs reorder" />
        </View>
      ) : (
        <>
          <View style={[s.kpiGrid, { gap: spacing.md }]}>
            <KpiTile icon="cash-multiple" tone={C.green} label="Revenue"
              value={naira(data?.total_revenue ?? 0)}
              sub={`${data?.transaction_count ?? 0} sales`} />
            <KpiTile icon="trending-up" tone={C.accent} label="Avg ticket"
              value={naira(data?.avg_transaction ?? 0)}
              sub="per transaction" />
          </View>
          <View style={[s.kpiGrid, { marginTop: spacing.md, gap: spacing.md }]}>
            <KpiTile icon="package-variant" tone={C.amber} label="Items sold"
              value={String(data?.total_items_sold ?? 0)}
              sub="units today" />
            <KpiTile icon="alert-circle-outline" tone={C.rose} label="Low stock"
              value={String(data?.low_stock_count ?? 0)}
              sub="needs reorder" />
          </View>
        </>
      )}

      {/* ── Payment mix ─────────────────────────────────────── */}
      {(data?.payment_breakdown?.length ?? 0) > 0 && (
        <>
          <SectionHdr label="Payment mix — today" />
          <View style={[s.card, { padding: spacing.xl }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '800', fontSize: 26, color: C.ink }}>
                <Text style={{ color: C.muted }}>₦</Text>
                {(data?.total_revenue ?? 0).toLocaleString()}
              </Text>
              <View style={[s.pill, { backgroundColor: C.greenBg }]}>
                <Text style={[s.pillText, { color: '#0F8A5B' }]}>↗ +12%</Text>
              </View>
            </View>
            {/* Stacked bar */}
            <View style={s.stackedBar}>
              {data!.payment_breakdown.map((p, i) => {
                const pct = payTotal > 0 ? (p.total / payTotal) * 100 : 0;
                return (
                  <View
                    key={p.method}
                    style={{ flex: pct || 1, backgroundColor: PAY_COLORS[p.method] ?? C.accent,
                      borderRadius: i === 0 ? 999 : i === data!.payment_breakdown.length - 1 ? 999 : 0 }}
                  />
                );
              })}
            </View>
            <View style={{ gap: 8, marginTop: 14 }}>
              {data!.payment_breakdown.map((p) => {
                const pct = payTotal > 0 ? Math.round((p.total / payTotal) * 100) : 0;
                return (
                  <View key={p.method} style={s.payRow}>
                    <View style={[s.payDot, { backgroundColor: PAY_COLORS[p.method] ?? C.accent }]} />
                    <Text style={s.payLabel}>{METHOD_LABELS[p.method] ?? p.method}</Text>
                    <Text style={s.payPct}>{pct}%</Text>
                    <Text style={s.payAmt}>
                      <Text style={{ color: C.muted }}>₦</Text>
                      {p.total.toLocaleString()}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}

      {/* ── Recent activity ──────────────────────────────────── */}
      <SectionHdr
        label="Recent activity"
        action="See all"
        onAction={() => (navigation as any).navigate('Transactions')}
      />
      <View style={[s.card, { padding: spacing.sm }]}>
        {(data?.recent_transactions?.length ?? 0) === 0 ? (
          <View style={s.empty}>
            <MaterialCommunityIcons name="receipt" size={32} color={C.border} />
            <Text style={s.emptyText}>No transactions yet</Text>
          </View>
        ) : (
          data!.recent_transactions.slice(0, 5).map((t, i) => {
            const isLast = i === Math.min(data!.recent_transactions.length, 5) - 1;
            return (
              <View key={t.id} style={[s.txRow, !isLast && s.txBorder]}>
                {(() => {
                  const isRefund = t.status === 'refunded';
                  return (
                    <View style={[s.txIcon, { backgroundColor: isRefund ? 'rgba(251,113,133,0.12)' : 'rgba(16,185,129,0.12)' }]}>
                      <MaterialCommunityIcons
                        name={isRefund ? 'cash-refund' : 'arrow-top-right'}
                        size={18}
                        color={isRefund ? '#FB7185' : '#10B981'}
                      />
                    </View>
                  );
                })()}
                <View style={{ flex: 1 }}>
                  <Text style={s.txAmt} numberOfLines={1}>
                    {t.cashier} · {t.item_count} item{t.item_count !== 1 ? 's' : ''}
                  </Text>
                  <Text style={s.txMeta}>
                    {METHOD_LABELS[t.payment_method] ?? t.payment_method} · {timeAgo(t.created_at)}
                  </Text>
                </View>
                {(() => {
                  const isRefund = t.status === 'refunded';
                  return (
                    <Text style={s.txTotal}>
                      <Text style={{ color: isRefund ? '#FB7185' : C.muted, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' }}>
                        {isRefund ? '−₦' : '+₦'}
                      </Text>
                      <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700', fontSize: 14, color: isRefund ? '#FB7185' : C.ink }}>
                        {t.total_amount.toLocaleString()}
                      </Text>
                    </Text>
                  );
                })()}
              </View>
            );
          })
        )}
        {/* "View all" footer — only when there are transactions */}
        {(data?.recent_transactions?.length ?? 0) > 0 && (
          <TouchableOpacity
            style={s.seeAllRow}
            onPress={() => (navigation as any).navigate('Transactions')}
            activeOpacity={0.7}
          >
            <Text style={s.seeAllText}>View all transactions</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={C.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Top products ─────────────────────────────────────── */}
      {(data?.top_products?.length ?? 0) > 0 && (
        <>
          <SectionHdr label="Top products — today" />
          <View style={[s.card, { padding: spacing.sm }]}>
            {data!.top_products.map((p, i) => {
              const isLast = i === data!.top_products.length - 1;
              return (
                <View key={p.id} style={[s.txRow, !isLast && s.txBorder]}>
                  <View style={s.rankBadge}>
                    <Text style={s.rankText}>{i + 1}</Text>
                  </View>
                  <View style={s.letterAvatar}>
                    <Text style={s.letterText}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.txAmt} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.txMeta}>{p.total_sold} sold</Text>
                  </View>
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700', fontSize: 13, color: C.ink }}>
                    <Text style={{ color: C.muted }}>₦</Text>
                    {p.total_revenue.toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={{ height: 110 }} />
    </ScrollView>

    {/* ── Branch dropdown Modal — lives OUTSIDE ScrollView ─── */}
    <Modal
      visible={branchDropdownOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setBranchDropdownOpen(false)}
    >
      <TouchableOpacity
        style={s.branchOverlay}
        activeOpacity={1}
        onPress={() => setBranchDropdownOpen(false)}
      >
        <View style={s.branchSheet}>
          <View style={s.branchSheetHeader}>
            <Text style={s.branchSheetTitle}>Select Branch</Text>
            <TouchableOpacity onPress={() => setBranchDropdownOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={20} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* All Branches option */}
          <TouchableOpacity
            style={[s.branchOption, selectedBranchId === null && s.branchOptionActive]}
            onPress={() => handleBranchSelect(null)}
          >
            <MaterialCommunityIcons
              name="domain"
              size={16}
              color={selectedBranchId === null ? C.accent : C.muted}
            />
            <Text style={[s.branchOptionText, selectedBranchId === null && { color: C.accent, fontWeight: '700' }]}>
              All Branches
            </Text>
            {selectedBranchId === null && (
              <MaterialCommunityIcons name="check" size={16} color={C.accent} style={{ marginLeft: 'auto' }} />
            )}
          </TouchableOpacity>

          {/* Individual branches */}
          {branches.length === 0 ? (
            <View style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>No branches found</Text>
            </View>
          ) : (
            branches.map(b => (
              <TouchableOpacity
                key={b.id}
                style={[s.branchOption, selectedBranchId === b.id && s.branchOptionActive]}
                onPress={() => handleBranchSelect(b.id)}
              >
                <MaterialCommunityIcons
                  name="source-branch"
                  size={16}
                  color={selectedBranchId === b.id ? C.accent : C.muted}
                />
                <Text style={[s.branchOptionText, selectedBranchId === b.id && { color: C.accent, fontWeight: '700' }]}>
                  {b.name}
                </Text>
                {selectedBranchId === b.id && (
                  <MaterialCommunityIcons name="check" size={16} color={C.accent} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </TouchableOpacity>
    </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  center:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingTop: 52 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerDate:  { fontSize: 13, color: C.muted, fontWeight: '500' },
  headerGreet: { fontSize: 22, fontWeight: '700', color: C.ink, marginTop: 2, letterSpacing: -0.4 },

  // Hero
  hero: {
    borderRadius: R.xxl,
    overflow: 'hidden', marginBottom: 4,
  },
  orb: {
    position: 'absolute', borderRadius: 9999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroEyebrow: { fontSize: 11, fontWeight: '700', opacity: 0.85, letterSpacing: 0.6, color: C.accentFg, flex: 1 },
  togglePill: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 999, padding: 3, gap: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  toggleBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999 },
  toggleBtnActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  toggleText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' } as const,
  toggleTextActive: { color: '#1A1A22' },
  deltaPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 2, paddingHorizontal: 7,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  deltaText: { fontSize: 11, fontWeight: '700', color: C.accentFg },
  heroCaption: { fontSize: 12, opacity: 0.8, color: C.accentFg },
  heroAmount: {
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700', fontSize: 38, letterSpacing: -1, color: C.accentFg,
  },
  heroSub: { marginTop: 8, fontSize: 13, opacity: 0.8, color: C.accentFg },

  quickRow: { marginTop: 14, flexDirection: 'row', gap: 8 },
  quickBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: R.sm, paddingVertical: 10, paddingHorizontal: 6,
    alignItems: 'center', gap: 6,
  },
  quickLabel: { fontSize: 11, fontWeight: '600', color: C.accentFg },

  // KPI grid
  kpiGrid: { flexDirection: 'row', gap: 10 },

  // Card
  card: {
    backgroundColor: C.card, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 4,
  },

  // Payment
  stackedBar: {
    flexDirection: 'row', height: 10, borderRadius: 999, overflow: 'hidden',
  },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payDot: { width: 8, height: 8, borderRadius: 4 },
  payLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: C.ink },
  payPct: { fontSize: 12, color: C.muted, fontWeight: '600', width: 36 },
  payAmt: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700', fontSize: 13, color: C.ink,
  },

  // Pill badge
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '600' },

  // Transactions
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  txIcon: { width: 38, height: 38, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txAmt: { fontSize: 14, fontWeight: '600', color: C.ink },
  txMeta: { fontSize: 12, color: C.muted },
  txTotal: {},

  // Rank
  rankBadge: {
    width: 28, height: 28, borderRadius: R.xs,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  rankText: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '800', fontSize: 12, color: C.muted },
  letterAvatar: {
    width: 36, height: 36, borderRadius: R.sm,
    backgroundColor: C.violetBg, alignItems: 'center', justifyContent: 'center',
  },
  letterText: { fontWeight: '700', fontSize: 15, color: C.accent },

  // See-all footer
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: 4,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { color: C.muted, fontSize: 13 },

  // Branch pill (inside hero)
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  branchPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    maxWidth: 120,
  },

  // Branch dropdown modal
  branchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  branchSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  branchSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  branchSheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  branchOptionActive: {
    backgroundColor: C.violetBg,
  },
  branchOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.ink,
    flex: 1,
  },
});
