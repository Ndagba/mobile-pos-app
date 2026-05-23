import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ScrollView, TextInput as RNTextInput, ActivityIndicator,
  Alert, Platform, Share, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C, R, S, F } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize, responsiveMinTouchTarget } from '../utils/responsiveDesign';

// ─── Types ────────────────────────────────────────────────────
type StatusFilter = 'all' | 'completed' | 'refunded';
type DateFilter   = 'today' | 'week';

interface TxItem {
  id?: string;
  product_id?: string;
  product_name?: string;
  name?: string;
  item_name?: string;
  quantity?: number;
  qty?: number;
  unit_price?: number;
  price?: number;
  total_price?: number;
  line_total?: number;
  subtotal?: number;
  total?: number;
  product?: { name?: string; product_name?: string; price?: number; selling_price?: number };
}

interface NormalizedItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface UserObj {
  first_name?: string; last_name?: string;
  name?: string; username?: string; email?: string;
}

interface Transaction {
  id: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  cashier?: string | UserObj;
  cashier_name?: string;
  user_name?: string;
  staff_name?: string;
  employee_name?: string;
  created_by?: string | UserObj;
  user?: UserObj; staff?: UserObj; employee?: UserObj;
  item_count?: number; items_count?: number;
  branch_name?: string;
  items?: TxItem[];
  transaction_items?: TxItem[];
  line_items?: TxItem[];
  order_items?: TxItem[];
  cart_items?: TxItem[];
  notes?: string;
  vat?: number;
}

// ─── Constants ────────────────────────────────────────────────
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', mobile_wallet: 'Transfer', transfer: 'Transfer',
};
const METHOD_ICONS: Record<string, string> = {
  cash: 'cash', card: 'credit-card-outline',
  mobile_wallet: 'bank-transfer', transfer: 'bank-transfer',
};
const MONO = { fontFamily: F.mono } as const;

// ─── Helpers ──────────────────────────────────────────────────
const resolveName = (tx: Transaction): string => {
  const fromObj = (u?: UserObj | null): string | null => {
    if (!u || typeof u !== 'object') return null;
    if (u.first_name || u.last_name)
      return [u.first_name, u.last_name].filter(Boolean).join(' ');
    return u.name ?? u.username ?? u.email ?? null;
  };
  if (tx.cashier_name) return tx.cashier_name;
  if (tx.user_name)    return tx.user_name;
  if (tx.staff_name)   return tx.staff_name;
  if (tx.employee_name) return tx.employee_name;
  if (tx.cashier) {
    if (typeof tx.cashier === 'string') return tx.cashier;
    const n = fromObj(tx.cashier); if (n) return n;
  }
  if (tx.created_by) {
    if (typeof tx.created_by === 'string') return tx.created_by;
    const n = fromObj(tx.created_by); if (n) return n;
  }
  return fromObj(tx.user) ?? fromObj(tx.staff) ?? fromObj(tx.employee) ?? 'Unknown';
};

const resolveItemCount = (tx: Transaction | null): number => {
  if (!tx) return 0;
  return tx.item_count ?? tx.items_count ?? tx.items?.length
    ?? tx.transaction_items?.length ?? tx.line_items?.length
    ?? tx.order_items?.length ?? tx.cart_items?.length ?? 0;
};

const normalizeItems = (tx: Transaction | null): NormalizedItem[] => {
  if (!tx) return [];
  const raw: TxItem[] = tx.items ?? tx.transaction_items ?? tx.line_items
    ?? tx.order_items ?? tx.cart_items ?? [];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((it, i) => {
    const productName = it.product_name ?? it.name ?? it.item_name
      ?? it.product?.name ?? it.product?.product_name ?? `Item ${i + 1}`;
    const qty      = Number(it.quantity ?? it.qty ?? 1) || 0;
    const price    = Number(it.unit_price ?? it.price ?? it.product?.price ?? it.product?.selling_price ?? 0) || 0;
    const total    = Number(it.total_price ?? it.line_total ?? it.subtotal ?? it.total ?? qty * price) || 0;
    return { id: String(it.id ?? it.product_id ?? i), product_name: productName, quantity: qty, unit_price: price, total_price: total };
  });
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
};

const getDateRange = (filter: DateFilter) => {
  const to = new Date(); to.setHours(23, 59, 59, 999);
  const from = new Date();
  if (filter === 'today') { from.setHours(0, 0, 0, 0); }
  else { from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); }
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  completed: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981' },
  refunded:  { bg: 'rgba(225,29,107,0.10)', fg: '#E11D6B' },
  pending:   { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B' },
};

// ─── Main Screen ──────────────────────────────────────────────
export default function TransactionsScreen() {
  const insets   = useSafeAreaInsets();
  const nav      = useNavigation<any>();
  const route    = useRoute<any>();
  const user     = useSelector((s: RootState) => s.auth.user);
  const isAdmin  = ['admin', 'manager'].includes(user?.role ?? '');
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);
  const minTouchTarget = responsiveMinTouchTarget(deviceType);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(true);

  const [showSearch, setShowSearch]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    route.params?.mode === 'refund' ? 'completed' : 'all',
  );
  const [dateFilter, setDateFilter]     = useState<DateFilter>('week');

  const [selectedTx, setSelectedTx]       = useState<Transaction | null>(null);
  const [receiptOpen, setReceiptOpen]      = useState(false);
  const [refundOpen, setRefundOpen]        = useState(false);
  const [refundReason, setRefundReason]    = useState('');
  const [refunding, setRefunding]          = useState(false);
  const [txDetail, setTxDetail]           = useState<Transaction | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const receiptItems = useMemo(
    () => normalizeItems(txDetail ?? selectedTx),
    [txDetail, selectedTx],
  );

  const searchRef      = useRef<RNTextInput>(null);
  const reqId          = useRef(0);
  const loadingMoreRef = useRef(false);
  const firstFocusDone = useRef(false);
  const receiptOpenRef = useRef(false);
  const PAGE_SIZE = 20;

  // ── Net total for the header summary card ─────────────────────
  const netTotal = useMemo(
    () => transactions.reduce((sum, t) => {
      const amt = Number(t.total_amount) || 0;
      return sum + (t.status === 'refunded' ? -amt : amt);
    }, 0),
    [transactions],
  );
  const avgSale = transactions.length
    ? Math.round(Math.abs(netTotal) / transactions.length)
    : 0;

  // ── Load ──────────────────────────────────────────────────────
  const load = useCallback(async (opts: {
    pg?: number; refresh?: boolean; status?: StatusFilter;
    date?: DateFilter; q?: string;
  } = {}) => {
    if (receiptOpenRef.current) {
      if (__DEV__) console.warn('[TX] load() suppressed – receipt open', opts);
      return;
    }
    if (__DEV__) console.trace('[TX] load()', opts);

    const {
      pg = 1, refresh = false,
      status = statusFilter,
      date   = dateFilter,
      q      = searchQuery,
    } = opts;

    const myReq = ++reqId.current;
    if (pg === 1) { setLoading(true); setError(null); loadingMoreRef.current = false; }
    else          { setLoadingMore(true); loadingMoreRef.current = true; }

    try {
      const { dateFrom, dateTo } = getDateRange(date);
      const params = [
        `page=${pg}`, `limit=${PAGE_SIZE}`,
        ...(status !== 'all' ? [`status=${status}`] : []),
        ...(q.trim() ? [`search=${encodeURIComponent(q.trim())}`] : []),
        `dateFrom=${encodeURIComponent(dateFrom)}`,
        `dateTo=${encodeURIComponent(dateTo)}`,
      ];
      const res: any = await ApiClient.get(`/transactions?${params.join('&')}`);
      if (myReq !== reqId.current) return;

      const list: Transaction[] = Array.isArray(res)
        ? res : (res.transactions ?? res.data ?? res.items ?? []);

      if (pg === 1) {
        setTransactions(list);
      } else {
        setTransactions(prev => {
          const seen  = new Set(prev.map(t => t.id));
          const fresh = list.filter(t => !seen.has(t.id));
          return [...prev, ...fresh];
        });
      }
      setHasMore(list.length >= PAGE_SIZE);
      setPage(pg);
    } catch {
      if (myReq === reqId.current && pg === 1) setError('Could not load transactions. Pull down to retry.');
    } finally {
      if (myReq === reqId.current) {
        setLoading(false); setLoadingMore(false);
        setRefreshing(false); loadingMoreRef.current = false;
      }
    }
  }, [statusFilter, dateFilter, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      if (firstFocusDone.current) return;
      firstFocusDone.current = true;
      load();
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load({ pg: 1, q: text }), 400);
  };

  const handleStatusChange = (s: StatusFilter) => {
    if (s === statusFilter) return;
    setStatusFilter(s);
    load({ pg: 1, status: s });
  };

  const handleDateChange = (d: DateFilter) => {
    if (d === dateFilter) return;
    setDateFilter(d);
    load({ pg: 1, date: d });
  };

  const handleRefresh = () => { setRefreshing(true); load({ pg: 1, refresh: true }); };
  const handleLoadMore = () => {
    if (!hasMore || loadingMoreRef.current || loading) return;
    load({ pg: page + 1 });
  };

  // ── Receipt ───────────────────────────────────────────────────
  const openReceipt = async (tx: Transaction) => {
    receiptOpenRef.current = true;
    setSelectedTx(tx); setReceiptOpen(true);
    setTxDetail(null); setDetailLoading(true);
    try {
      const detail: any = await ApiClient.get(`/transactions/${tx.id}`);
      setTxDetail(detail);
    } catch { setTxDetail(tx); }
    finally { setDetailLoading(false); }
  };

  const closeReceipt = () => {
    receiptOpenRef.current = false;
    setReceiptOpen(false); setSelectedTx(null);
    setTxDetail(null); setRefundOpen(false); setRefundReason('');
  };

  const shareReceipt = async () => {
    if (!selectedTx) return;
    const tx = txDetail ?? selectedTx;
    const items = normalizeItems(tx);
    const lines = [
      '===== RECEIPT =====',
      `Date:    ${fmtDateTime(tx.created_at)}`,
      `ID:      #${tx.id.slice(-8).toUpperCase()}`,
      `Cashier: ${resolveName(tx)}`,
      `Method:  ${METHOD_LABELS[tx.payment_method] ?? tx.payment_method}`,
      `Status:  ${tx.status.toUpperCase()}`,
      '',
      ...(items.length > 0
        ? items.map(it => `  ${it.product_name} x${it.quantity}  ₦${it.total_price.toLocaleString()}`)
        : [`  ${resolveItemCount(tx)} item(s)`]),
      '',
      `TOTAL:   ₦${tx.total_amount.toLocaleString()}`,
      '===================',
    ];
    try { await Share.share({ message: lines.join('\n'), title: 'Receipt' }); } catch {}
  };

  const confirmRefund = async () => {
    if (!selectedTx) return;
    setRefunding(true);
    try {
      await ApiClient.post(`/transactions/${selectedTx.id}/refund`, {
        reason: refundReason.trim() || 'Customer request',
      });
      setTransactions(prev =>
        prev.map(t => t.id === selectedTx.id ? { ...t, status: 'refunded' } : t),
      );
      setRefundOpen(false); setRefundReason(''); setReceiptOpen(false);
      Alert.alert('Refund Processed', `₦${(Number(selectedTx.total_amount) || 0).toLocaleString()} has been refunded.`);
    } catch (e: any) {
      Alert.alert('Refund Failed', e?.response?.data?.message ?? 'Please try again.');
    } finally { setRefunding(false); }
  };

  // ─── Row ──────────────────────────────────────────────────────
  const renderRow = ({ item: t }: { item: Transaction }) => {
    const isRefund  = t.status === 'refunded';
    const cashier   = resolveName(t);
    const itemCount = resolveItemCount(t);
    const sc        = STATUS_COLORS[t.status] ?? STATUS_COLORS.completed;

    return (
      <TouchableOpacity style={s.row} onPress={() => openReceipt(t)} activeOpacity={0.75}>
        <View style={[s.rowIcon, {
          backgroundColor: isRefund ? 'rgba(225,29,107,0.10)' : 'rgba(16,185,129,0.12)',
        }]}>
          <MaterialCommunityIcons
            name={isRefund ? 'cash-refund' : 'arrow-top-right'}
            size={20}
            color={isRefund ? '#E11D6B' : '#10B981'}
          />
        </View>

        <View style={s.rowBody}>
          <View style={s.rowTop}>
            <Text style={s.rowTitle} numberOfLines={1}>{cashier}</Text>
            <Text style={[s.rowAmount, MONO, { color: isRefund ? '#E11D6B' : C.ink }]}>
              {isRefund ? '−' : '+'}<Text style={{ opacity: 0.55 }}>₦</Text>
              {(Number(t.total_amount) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <View style={s.rowBottom}>
            <Text style={s.rowMeta} numberOfLines={1}>
              {METHOD_LABELS[t.payment_method] ?? t.payment_method}
              {' · '}{itemCount} item{itemCount !== 1 ? 's' : ''}
              {' · '}{timeAgo(t.created_at)}
            </Text>
            <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
              <Text style={[s.statusPillText, { color: sc.fg }]}>
                {t.status.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render ───────────────────────────────────────────────────
  if (isTablet) {
    return (
      <View style={[s.screen, { paddingTop: insets.top, flexDirection: 'row' }]}>
        {/* ── Left panel: Transactions list ────────────────────── */}
        <View style={{ flex: 0.5, borderRightWidth: 1, borderRightColor: C.border }}>
          {/* Header */}
          <View style={s.headerWrap}>
            <View style={s.titleRow}>
              <TouchableOpacity onPress={() => nav.goBack()} style={s.iconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="arrow-left" size={20} color={C.ink} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[s.headerTitle, { fontSize: isTablet ? 22 : 20 }]}>Transactions</Text>
              </View>
              <TouchableOpacity
                style={[s.iconBtn, showSearch && { backgroundColor: C.violetBg, borderColor: C.accent }]}
                onPress={() => {
                  if (showSearch) { setShowSearch(false); setSearchQuery(''); load({ pg: 1, q: '' }); }
                  else { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }
                }}
              >
                <MaterialCommunityIcons
                  name={showSearch ? 'close' : 'magnify'}
                  size={20}
                  color={showSearch ? C.accent : C.ink}
                />
              </TouchableOpacity>
            </View>

            {showSearch && (
              <View style={s.searchBar}>
                <MaterialCommunityIcons name="magnify" size={16} color={C.muted} />
                <RNTextInput
                  ref={searchRef}
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  placeholder="Search cashier, amount…"
                  placeholderTextColor={C.muted}
                  style={s.searchInput}
                  autoCapitalize="none" autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); load({ pg: 1, q: '' }); }}>
                    <MaterialCommunityIcons name="close-circle" size={15} color={C.muted} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Filter chips - horizontal scroll */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              style={s.filterScroll}
              contentContainerStyle={s.filterContent}
            >
              {(['all', 'completed', 'refunded'] as StatusFilter[]).map(f => (
                <TouchableOpacity key={f}
                  style={[s.chip, statusFilter === f && s.chipActive]}
                  onPress={() => handleStatusChange(f)} activeOpacity={0.8}>
                  <Text style={[s.chipText, statusFilter === f && s.chipTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={s.chipDivider} />
              {(['today', 'week'] as DateFilter[]).map(d => (
                <TouchableOpacity key={d}
                  style={[s.chip, dateFilter === d && s.chipActive]}
                  onPress={() => handleDateChange(d)} activeOpacity={0.8}>
                  <Text style={[s.chipText, dateFilter === d && s.chipTextActive]}>
                    {d === 'today' ? 'Today' : 'Week'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* List */}
          {loading && transactions.length === 0 ? (
            <View style={s.centre}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : error ? (
            <View style={s.centre}>
              <MaterialCommunityIcons name="alert-circle-outline" size={32} color={C.rose} />
              <Text style={[s.centreText, { color: C.rose, fontSize: 13 }]}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={t => t.id}
              renderItem={({ item: t }) => (
                <TouchableOpacity
                  style={[s.row, selectedTx?.id === t.id && { backgroundColor: C.violetBg }]}
                  onPress={() => openReceipt(t)}
                  activeOpacity={0.7}
                >
                  <View style={[s.rowIcon, { backgroundColor: t.status === 'refunded' ? 'rgba(225,29,107,0.10)' : 'rgba(16,185,129,0.12)' }]}>
                    <MaterialCommunityIcons
                      name={t.status === 'refunded' ? 'cash-refund' : 'arrow-top-right'}
                      size={18}
                      color={t.status === 'refunded' ? '#E11D6B' : '#10B981'}
                    />
                  </View>
                  <View style={s.rowBody}>
                    <Text style={[s.rowTitle, { fontSize: 13 }]} numberOfLines={1}>{resolveName(t)}</Text>
                    <Text style={[s.rowMeta, { fontSize: 11 }]} numberOfLines={1}>
                      {METHOD_LABELS[t.payment_method] ?? t.payment_method} · {timeAgo(t.created_at)}
                    </Text>
                  </View>
                  <Text style={[s.rowAmount, MONO, { fontSize: 13, color: t.status === 'refunded' ? '#E11D6B' : C.ink }]}>
                    {t.status === 'refunded' ? '−' : '+'}₦{(Number(t.total_amount) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                  </Text>
                </TouchableOpacity>
              )}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              contentContainerStyle={{ paddingHorizontal: spacing.sm, paddingBottom: 20 }}
              ItemSeparatorComponent={() => <View style={s.separator} />}
            />
          )}
        </View>

        {/* ── Right panel: Receipt detail ──────────────────────── */}
        <View style={{ flex: 0.5, backgroundColor: C.bg }}>
          {selectedTx ? (
            <ScrollView style={{ paddingHorizontal: spacing.md }} showsVerticalScrollIndicator={false}>
              {/* ── Hero amount card ────────────────────────────── */}
              <LinearGradient
                colors={[C.accent, C.accent2]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[m.heroCard, { marginTop: spacing.md, marginBottom: spacing.md }]}
              >
                <Text style={[m.heroLabel, { fontSize: fontSize.sm }]}>
                  {selectedTx.status === 'refunded' ? 'REFUNDED' : 'TOTAL PAID'}
                </Text>
                <Text style={[m.heroAmount, MONO, { fontSize: 28 }]}>
                  {selectedTx.status === 'refunded' && <Text>−</Text>}
                  <Text style={{ opacity: 0.7 }}>₦</Text>
                  {(Number(selectedTx.total_amount) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                </Text>
              </LinearGradient>

              {/* ── Meta info ───────────────────────────────────── */}
              <View style={[m.metaCard, { marginBottom: spacing.md }]}>
                <MetaRow label="Date" value={fmtDateTime(selectedTx.created_at)} last={false} />
                <MetaRow label="Cashier" value={resolveName(selectedTx)} avatar={resolveName(selectedTx)[0]?.toUpperCase()} last={false} />
                <MetaRow label="Method" value={METHOD_LABELS[selectedTx.payment_method] ?? selectedTx.payment_method} icon={METHOD_ICONS[selectedTx.payment_method]} last />
              </View>

              {/* ── Items ───────────────────────────────────────── */}
              {receiptItems.length > 0 && (
                <>
                  <Text style={[m.sectionLabel, { fontSize: fontSize.xs, marginBottom: spacing.sm }]}>ITEMS</Text>
                  <View style={m.itemsCard}>
                    {receiptItems.map((it, i) => (
                      <View key={it.id} style={[m.itemRow, i > 0 && m.itemRowBorder]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[m.itemName, { fontSize: 13 }]} numberOfLines={1}>{it.product_name}</Text>
                          <Text style={[m.itemQty, MONO, { fontSize: 11 }]}>×{it.quantity} @ ₦{it.unit_price.toLocaleString()}</Text>
                        </View>
                        <Text style={[m.itemTotal, MONO, { fontSize: 12 }]}>₦{it.total_price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* ── Actions ─────────────────────────────────────── */}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingBottom: spacing.xl }}>
                <TouchableOpacity style={[m.shareBtn, { flex: 1 }]} onPress={shareReceipt} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="share-outline" size={16} color={C.accent} />
                  <Text style={[m.shareBtnText, { fontSize: 13 }]}>Share</Text>
                </TouchableOpacity>
                {isAdmin && (
                  <TouchableOpacity
                    style={[m.refundBtn, { flex: 1 }, selectedTx.status === 'refunded' && m.refundBtnDisabled]}
                    onPress={selectedTx.status === 'refunded' ? undefined : () => setRefundOpen(true)}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="cash-refund" size={16} color={selectedTx.status === 'refunded' ? C.muted : '#fff'} />
                    <Text style={[m.refundBtnText, { fontSize: 13 }, selectedTx.status === 'refunded' && { color: C.muted }]}>
                      {selectedTx.status === 'refunded' ? 'Refunded' : 'Refund'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          ) : (
            <View style={s.centre}>
              <MaterialCommunityIcons name="receipt-text-outline" size={48} color={C.border} />
              <Text style={[s.centreText, { color: C.muted }]}>Select a transaction to view details</Text>
            </View>
          )}
        </View>

        {/* ── Refund modal (tablet still uses modal) ────────────── */}
        <Modal visible={refundOpen} transparent animationType="fade" onRequestClose={() => setRefundOpen(false)}>
          <View style={r.overlay}>
            <View style={r.box}>
              <View style={r.iconWrap}>
                <MaterialCommunityIcons name="cash-refund" size={28} color={C.red} />
              </View>
              <Text style={r.title}>Process Refund</Text>
              <Text style={r.sub}>
                Refund <Text style={[r.amount, MONO]}>₦{(Number(selectedTx?.total_amount) || 0).toLocaleString()}</Text> to the customer?
              </Text>
              <Text style={r.label}>Reason (optional)</Text>
              <RNTextInput
                value={refundReason} onChangeText={setRefundReason}
                placeholder="e.g. Wrong item, Customer changed mind"
                placeholderTextColor={C.muted}
                style={r.input} multiline numberOfLines={2}
              />
              <View style={r.btnRow}>
                <TouchableOpacity style={r.cancelBtn} onPress={() => setRefundOpen(false)} disabled={refunding}>
                  <Text style={r.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={r.confirmBtn} onPress={confirmRefund} disabled={refunding} activeOpacity={0.85}>
                  {refunding
                    ? <ActivityIndicator size={15} color="#fff" />
                    : <MaterialCommunityIcons name="check" size={15} color="#fff" />}
                  <Text style={r.confirmText}>{refunding ? 'Processing…' : 'Confirm Refund'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ─── Phone layout ──────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>

      {/* ── Header ────────────────────────────────────────────── */}
      <View style={s.headerWrap}>
        {/* title row */}
        <View style={s.titleRow}>
          <TouchableOpacity onPress={() => nav.goBack()} style={s.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={C.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Transactions</Text>
            <Text style={s.headerSub}>
              {transactions.length > 0
                ? <Text style={MONO}>{transactions.length}</Text>
                : null}
              {transactions.length > 0 ? ' records' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.iconBtn, showSearch && { backgroundColor: C.violetBg, borderColor: C.accent }]}
            onPress={() => {
              if (showSearch) { setShowSearch(false); setSearchQuery(''); load({ pg: 1, q: '' }); }
              else { setShowSearch(true); setTimeout(() => searchRef.current?.focus(), 80); }
            }}
          >
            <MaterialCommunityIcons
              name={showSearch ? 'close' : 'magnify'}
              size={20}
              color={showSearch ? C.accent : C.ink}
            />
          </TouchableOpacity>
        </View>

        {/* search bar */}
        {showSearch && (
          <View style={s.searchBar}>
            <MaterialCommunityIcons name="magnify" size={16} color={C.muted} />
            <RNTextInput
              ref={searchRef}
              value={searchQuery}
              onChangeText={handleSearchChange}
              placeholder="Search cashier, amount…"
              placeholderTextColor={C.muted}
              style={s.searchInput}
              autoCapitalize="none" autoCorrect={false} returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); load({ pg: 1, q: '' }); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close-circle" size={15} color={C.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Net summary card */}
        <View style={s.summaryWrap}>
          <LinearGradient
            colors={[C.accent, C.accent2]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.summaryCard}
          >
            <View style={s.summaryOrb} />
            <View style={s.summaryRow}>
              <View>
                <Text style={s.summaryLabel}>
                  NET {dateFilter === 'today' ? 'TODAY' : 'THIS WEEK'}
                </Text>
                <Text style={[s.summaryAmount, MONO]}>
                  <Text style={{ opacity: 0.7 }}>₦</Text>
                  {Math.abs(netTotal).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.summaryAvgLabel}>Avg sale</Text>
                <Text style={[s.summaryAvgAmt, MONO]}>
                  <Text style={{ opacity: 0.7 }}>₦</Text>
                  {avgSale.toLocaleString()}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* filter chips */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterContent}
        >
          {(['all', 'completed', 'refunded'] as StatusFilter[]).map(f => (
            <TouchableOpacity key={f}
              style={[s.chip, statusFilter === f && s.chipActive]}
              onPress={() => handleStatusChange(f)} activeOpacity={0.8}>
              <Text style={[s.chipText, statusFilter === f && s.chipTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={s.chipDivider} />
          {(['today', 'week'] as DateFilter[]).map(d => (
            <TouchableOpacity key={d}
              style={[s.chip, dateFilter === d && s.chipActive]}
              onPress={() => handleDateChange(d)} activeOpacity={0.8}>
              <Text style={[s.chipText, dateFilter === d && s.chipTextActive]}>
                {d === 'today' ? 'Today' : 'Week'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── List ─────────────────────────────────────────────── */}
      {loading && transactions.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={s.centreText}>Loading transactions…</Text>
        </View>
      ) : error ? (
        <View style={s.centre}>
          <MaterialCommunityIcons name="alert-circle-outline" size={44} color={C.rose} />
          <Text style={[s.centreText, { color: C.rose }]}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => load({ pg: 1 })}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={t => t.id}
          renderItem={renderRow}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={
            <View style={s.centre}>
              <MaterialCommunityIcons name="receipt-text-outline" size={52} color={C.border} />
              <Text style={[s.centreText, { fontWeight: '700', color: C.ink, marginBottom: 2 }]}>
                No transactions yet
              </Text>
              <Text style={s.centreText}>Try a different filter.</Text>
              {(statusFilter !== 'all') && (
                <TouchableOpacity style={s.retryBtn} onPress={() => {
                  setStatusFilter('all'); load({ pg: 1, status: 'all' });
                }}>
                  <Text style={s.retryText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={loadingMore
            ? <View style={{ paddingVertical: 20 }}><ActivityIndicator size="small" color={C.accent} /></View>
            : null}
        />
      )}

      {/* ══════════════════════════════════════════════════════
          RECEIPT MODAL
      ══════════════════════════════════════════════════════ */}
      <Modal visible={receiptOpen} transparent animationType="slide" onRequestClose={closeReceipt}>
        <View style={m.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={closeReceipt} activeOpacity={1} />
          <View style={[m.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            {/* drag handle */}
            <View style={m.handle} />

            {/* title row */}
            <View style={m.titleRow}>
              <View>
                <Text style={m.title}>Receipt</Text>
                {selectedTx && (
                  <Text style={[m.subId, MONO]}>#{selectedTx.id.slice(-8).toUpperCase()}</Text>
                )}
              </View>
              <TouchableOpacity onPress={closeReceipt} style={m.closeCircle}>
                <MaterialCommunityIcons name="close" size={16} color={C.ink} />
              </TouchableOpacity>
            </View>

            {detailLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <ActivityIndicator size="large" color={C.accent} />
              </View>
            ) : selectedTx ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* ── Hero amount card ────────────────────────── */}
                <LinearGradient
                  colors={[C.accent, C.accent2]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={m.heroCard}
                >
                  <View style={m.heroOrb} />
                  <View style={{ position: 'relative' }}>
                    <Text style={m.heroLabel}>
                      {selectedTx.status === 'refunded' ? 'REFUNDED' : 'TOTAL PAID'}
                    </Text>
                    <Text style={[m.heroAmount, MONO]}>
                      {selectedTx.status === 'refunded' && <Text>−</Text>}
                      <Text style={{ opacity: 0.7 }}>₦</Text>
                      {(Number(selectedTx.total_amount) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                    </Text>
                    <View style={m.heroPill}>
                      <View style={m.heroDot} />
                      <Text style={m.heroPillText}>{selectedTx.status.toUpperCase()}</Text>
                    </View>
                  </View>
                </LinearGradient>

                {/* ── Meta rows ───────────────────────────────── */}
                <View style={m.metaCard}>
                  <MetaRow label="Date"    value={fmtDateTime(selectedTx.created_at)} last={false} />
                  <MetaRow
                    label="Cashier"
                    value={resolveName(selectedTx)}
                    avatar={resolveName(selectedTx)[0]?.toUpperCase()}
                    last={false}
                  />
                  <MetaRow
                    label="Method"
                    value={METHOD_LABELS[selectedTx.payment_method] ?? selectedTx.payment_method}
                    icon={METHOD_ICONS[selectedTx.payment_method] ?? 'cash'}
                    last={false}
                  />
                  {selectedTx.branch_name && (
                    <MetaRow label="Branch" value={selectedTx.branch_name} last={false} />
                  )}
                  <MetaRow
                    label="ID"
                    value={`#${selectedTx.id.slice(-8).toUpperCase()}`}
                    mono last
                  />
                </View>

                {/* ── Items ───────────────────────────────────── */}
                <View style={m.sectionHeaderRow}>
                  <Text style={m.sectionLabel}>ITEMS</Text>
                  <Text style={[m.sectionLabel, MONO]}> · {receiptItems.length || resolveItemCount(txDetail ?? selectedTx)}</Text>
                </View>
                <View style={m.itemsCard}>
                  {receiptItems.length > 0 ? (
                    receiptItems.map((it, i) => (
                      <View key={it.id} style={[m.itemRow, i > 0 && m.itemRowBorder]}>
                        <View style={{ flex: 1 }}>
                          <Text style={m.itemName} numberOfLines={2}>{it.product_name}</Text>
                          <Text style={[m.itemQty, MONO]}>
                            ×{it.quantity} @ ₦{it.unit_price.toLocaleString()}
                          </Text>
                        </View>
                        <Text style={[m.itemTotal, MONO]}>
                          <Text style={{ opacity: 0.55 }}>₦</Text>
                          {it.total_price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={m.itemRow}>
                      <Text style={m.itemName}>
                        {resolveItemCount(txDetail ?? selectedTx) > 0
                          ? `${resolveItemCount(txDetail ?? selectedTx)} item(s)`
                          : 'Item details unavailable'}
                      </Text>
                      <Text style={[m.itemTotal, MONO]}>
                        <Text style={{ opacity: 0.55 }}>₦</Text>
                        {(Number(selectedTx.total_amount) || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  )}
                </View>

                {/* ── Totals ──────────────────────────────────── */}
                {receiptItems.length > 0 && (() => {
                  const subtotal = receiptItems.reduce((s, it) => s + it.total_price, 0);
                  const rawVat   = (txDetail ?? selectedTx)?.vat;
                  const vatAmt   = rawVat != null
                    ? Number(rawVat) || 0
                    : Math.round(subtotal * 0.075);
                  return (
                    <View style={m.totalsBox}>
                      <TotalRow label="Subtotal" value={subtotal} />
                      <TotalRow label="VAT (7.5%)" value={vatAmt} />
                      <View style={m.totalsDivider} />
                      <TotalRow label="TOTAL" value={selectedTx.total_amount} big />
                    </View>
                  );
                })()}

                {/* ── Receipt preview text ─────────────────────── */}
                <Text style={m.sectionLabel2}>RECEIPT</Text>
                <View style={m.receiptPreview}>
                  <Text style={[m.receiptText, m.receiptCenter]}>===== RECEIPT =====</Text>
                  <Text style={m.receiptText}>{`Date:    ${fmtDateTime(selectedTx.created_at)}`}</Text>
                  <Text style={m.receiptText}>{`ID:      #${selectedTx.id.slice(-8).toUpperCase()}`}</Text>
                  <Text style={m.receiptText}>{`Cashier: ${resolveName(txDetail ?? selectedTx)}`}</Text>
                  <Text style={m.receiptText}>{`Method:  ${METHOD_LABELS[selectedTx.payment_method] ?? selectedTx.payment_method}`}</Text>
                  <Text style={m.receiptText}>{`Status:  ${selectedTx.status.toUpperCase()}`}</Text>
                  <Text style={m.receiptText}>{' '}</Text>
                  {receiptItems.length > 0
                    ? receiptItems.map((it, i) => (
                        <Text key={i} style={m.receiptText}>
                          {`  ${it.product_name} x${it.quantity}  ₦${it.total_price.toLocaleString()}`}
                        </Text>
                      ))
                    : <Text style={m.receiptText}>{`  ${resolveItemCount(txDetail ?? selectedTx)} item(s)`}</Text>
                  }
                  <Text style={m.receiptText}>{' '}</Text>
                  <Text style={[m.receiptText, m.receiptBold]}>
                    {`TOTAL:   ₦${(Number(selectedTx.total_amount) || 0).toLocaleString()}`}
                  </Text>
                  <Text style={[m.receiptText, m.receiptCenter]}>{'==================='}</Text>
                </View>

                {selectedTx.notes ? <Text style={m.notes}>Note: {selectedTx.notes}</Text> : null}
              </ScrollView>
            ) : null}

            {/* ── Action buttons ───────────────────────────────── */}
            {selectedTx && !detailLoading && (
              <View style={m.actions}>
                <TouchableOpacity style={m.shareBtn} onPress={shareReceipt} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="share-outline" size={17} color={C.accent} />
                  <Text style={m.shareBtnText}>Share</Text>
                </TouchableOpacity>
                {isAdmin && (
                  <TouchableOpacity
                    style={[m.refundBtn, selectedTx.status === 'refunded' && m.refundBtnDisabled]}
                    onPress={selectedTx.status === 'refunded' ? undefined : () => setRefundOpen(true)}
                    activeOpacity={selectedTx.status === 'refunded' ? 1 : 0.85}
                  >
                    <MaterialCommunityIcons name="cash-refund" size={17}
                      color={selectedTx.status === 'refunded' ? C.muted : '#fff'} />
                    <Text style={[m.refundBtnText,
                      selectedTx.status === 'refunded' && { color: C.muted }]}>
                      {selectedTx.status === 'refunded' ? 'Refunded' : 'Process Refund'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════
          REFUND CONFIRM MODAL
      ══════════════════════════════════════════════════════ */}
      <Modal visible={refundOpen} transparent animationType="fade" onRequestClose={() => setRefundOpen(false)}>
        <View style={r.overlay}>
          <View style={r.box}>
            <View style={r.iconWrap}>
              <MaterialCommunityIcons name="cash-refund" size={28} color={C.red} />
            </View>
            <Text style={r.title}>Process Refund</Text>
            <Text style={r.sub}>
              Refund <Text style={[r.amount, MONO]}>₦{(Number(selectedTx?.total_amount) || 0).toLocaleString()}</Text> to the customer?
            </Text>
            <Text style={r.label}>Reason (optional)</Text>
            <RNTextInput
              value={refundReason} onChangeText={setRefundReason}
              placeholder="e.g. Wrong item, Customer changed mind"
              placeholderTextColor={C.muted}
              style={r.input} multiline numberOfLines={2}
            />
            <View style={r.btnRow}>
              <TouchableOpacity style={r.cancelBtn} onPress={() => setRefundOpen(false)} disabled={refunding}>
                <Text style={r.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={r.confirmBtn} onPress={confirmRefund} disabled={refunding} activeOpacity={0.85}>
                {refunding
                  ? <ActivityIndicator size={15} color="#fff" />
                  : <MaterialCommunityIcons name="check" size={15} color="#fff" />}
                <Text style={r.confirmText}>{refunding ? 'Processing…' : 'Confirm Refund'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── MetaRow ──────────────────────────────────────────────────
function MetaRow({
  label, value, avatar, icon, mono, last,
}: {
  label: string; value: string;
  avatar?: string; icon?: string; mono?: boolean; last?: boolean;
}) {
  return (
    <View style={[mr.row, last && { borderBottomWidth: 0 }]}>
      <Text style={mr.label}>{label}</Text>
      <View style={mr.valueRow}>
        {avatar ? (
          <View style={mr.avatar}>
            <Text style={mr.avatarLetter}>{avatar}</Text>
          </View>
        ) : icon ? (
          <MaterialCommunityIcons name={icon as any} size={14} color={C.accent} />
        ) : null}
        <Text style={[mr.value, mono && MONO]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ─── TotalRow ─────────────────────────────────────────────────
function TotalRow({ label, value, big }: { label: string; value: number; big?: boolean }) {
  const amount = Number(value) || 0;
  return (
    <View style={tr.row}>
      <Text style={[tr.label, big && tr.labelBig]}>{label}</Text>
      <Text style={[tr.value, MONO, big && tr.valueBig]}>
        <Text style={{ opacity: 0.55 }}>₦</Text>
        {amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: C.bg },

  // Header area (white card bg)
  headerWrap: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  titleRow:   { flexDirection: 'row', alignItems: 'center', padding: S.xl, gap: 12, paddingBottom: S.md },
  iconBtn: {
    width: 40, height: 40, borderRadius: R.sm,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.44 },
  headerSub:   { fontSize: 12, color: C.muted, marginTop: 1 },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderRadius: R.sm,
    marginHorizontal: S.xl, marginBottom: S.md,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    gap: 8, borderWidth: 1, borderColor: C.accent,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },

  // Summary card
  summaryWrap: { paddingHorizontal: S.xl, paddingBottom: S.md },
  summaryCard: { borderRadius: 18, padding: 16, overflow: 'hidden', position: 'relative' },
  summaryOrb:  {
    position: 'absolute', right: -30, top: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, opacity: 0.8, color: '#fff', textTransform: 'uppercase' },
  summaryAmount:{ fontSize: 26, fontWeight: '700', color: '#fff', marginTop: 4 },
  summaryAvgLabel: { fontSize: 11, opacity: 0.8, color: '#fff' },
  summaryAvgAmt:   { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Filters
  filterScroll:  { flexGrow: 0 },
  filterContent: { paddingHorizontal: S.xl, paddingBottom: S.md, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip:          {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: R.pill, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.card,
  },
  chipActive:    { backgroundColor: C.accent, borderColor: C.accent },
  chipText:      { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive:{ color: C.accentFg },
  chipDivider:   { width: 1, height: 20, backgroundColor: C.border, marginHorizontal: 4 },

  // Row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: S.xl, paddingVertical: 14, gap: 14,
    backgroundColor: C.card,
  },
  rowIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowBody:   { flex: 1, minWidth: 0 },
  rowTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle:  { flex: 1, fontSize: 14, fontWeight: '700', color: C.ink },
  rowAmount: { fontSize: 14, fontWeight: '800', flexShrink: 0 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  rowMeta:   { fontSize: 11, color: C.muted, flex: 1 },
  statusPill:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.pill },
  statusPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  separator: { height: 1, backgroundColor: C.border },

  // Empty / Error
  centre:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 60 },
  centreText:{ fontSize: 13, color: C.muted, textAlign: 'center', paddingHorizontal: 32 },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 9, borderRadius: R.sm, backgroundColor: C.accent, marginTop: 4 },
  retryText: { color: C.accentFg, fontWeight: '700', fontSize: 13 },
});

// Receipt modal styles
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(14,14,16,0.55)' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: S.xl, maxHeight: '92%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.25, shadowRadius: 60, elevation: 24,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16, gap: 12,
  },
  title:   { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.44 },
  subId:   { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '600' },
  closeCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Hero gradient card
  heroCard: {
    borderRadius: 20, padding: 20, overflow: 'hidden',
    position: 'relative', marginBottom: 14,
  },
  heroOrb: {
    position: 'absolute', right: -30, top: -30,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1, opacity: 0.8, color: '#fff', textTransform: 'uppercase' },
  heroAmount: { fontSize: 36, fontWeight: '700', color: '#fff', marginTop: 6 },
  heroPill:   {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill,
  },
  heroDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  heroPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: '#fff' },

  // Meta card
  metaCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, paddingHorizontal: 14, marginBottom: 14,
  },

  // Items
  sectionHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  sectionLabel:  { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2 },
  sectionLabel2: { fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 14, marginBottom: 8 },
  itemsCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 16, paddingHorizontal: 14, marginBottom: 14,
  },
  itemRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  itemName:  { fontSize: 14, fontWeight: '700', color: C.ink },
  itemQty:   { fontSize: 11, color: C.muted, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: '800', color: C.ink },

  // Totals
  totalsBox:     { marginBottom: 14, paddingHorizontal: 4, gap: 6 },
  totalsDivider: { height: 1, backgroundColor: C.border, marginVertical: 4 },

  // Receipt preview
  receiptPreview: {
    backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 12,
  },
  receiptText:   { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12, color: C.ink, lineHeight: 22 },
  receiptCenter: { textAlign: 'center', color: C.muted },
  receiptBold:   { fontWeight: '700', fontSize: 13 },

  notes: { fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 8 },

  // Actions
  actions: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  shareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: C.violetBg, borderWidth: 1, borderColor: 'rgba(110,86,247,0.22)',
  },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: C.accent },
  refundBtn: {
    flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: '#E11D6B',
    shadowColor: '#FB7185', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6, shadowRadius: 24, elevation: 8,
  },
  refundBtnDisabled: { backgroundColor: C.border, shadowOpacity: 0 },
  refundBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// MetaRow styles
const mr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 12,
  },
  label:       { fontSize: 12, fontWeight: '600', color: C.muted, minWidth: 72 },
  valueRow:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  value:       { fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'right', flexShrink: 1 },
  avatar:      {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: C.violetBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter:{ fontSize: 9, fontWeight: '700', color: C.accent },
});

// TotalRow styles
const tr = StyleSheet.create({
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label:    { fontSize: 12, fontWeight: '600', color: C.muted },
  labelBig: { fontSize: 14, fontWeight: '800', color: C.ink, letterSpacing: 0.4, textTransform: 'uppercase' },
  value:    { fontSize: 13, fontWeight: '700', color: C.ink },
  valueBig: { fontSize: 22, fontWeight: '800' },
});

// Refund modal styles
const r = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: S.xl },
  box:     { width: '100%', backgroundColor: C.card, borderRadius: R.xl, padding: S.xl, alignItems: 'center' },
  iconWrap:{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title:   { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 6 },
  sub:     { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 16 },
  amount:  { color: C.red, fontWeight: '700' },
  label:   { alignSelf: 'flex-start', fontSize: 12, fontWeight: '600', color: C.muted, marginBottom: 6 },
  input:   {
    width: '100%', borderWidth: 1, borderColor: C.border, borderRadius: R.sm,
    padding: 12, fontSize: 14, color: C.ink, backgroundColor: C.bg,
    textAlignVertical: 'top', minHeight: 70, marginBottom: 20,
  },
  btnRow:    { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: R.md, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText:{ fontSize: 14, fontWeight: '700', color: C.ink },
  confirmBtn:{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: R.md, backgroundColor: C.red },
  confirmText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
