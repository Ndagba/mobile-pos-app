import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  Share,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ApiClient from '../services/ApiClient';
import DatabaseService from '../services/DatabaseService';
import { RootState } from '../redux/store';
import { C, R, S, naira } from '../theme';
import { useResponsive, responsiveSpacing, responsiveFontSize } from '../utils/responsiveDesign';

// ─── Types ────────────────────────────────────────────────────
interface SaleDay {
  date: string;
  transactions: number;
  revenue: number;
  items_sold: number;
  profit?: number;
}

interface TopProduct {
  id: string;
  name: string;
  sku: string;
  total_sold: number;
  total_revenue: number;
  transaction_count: number;
  total_cost?: number;
  profit?: number;
}

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
}

interface PaymentMethod {
  payment_method: string;
  _count: { id: number };
  _sum: { total_amount: number };
}

interface StaffPerf {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  transaction_count: number;
  total_revenue: number;
  avg_transaction: number;
}

type Period = 'today' | 'week' | 'month';
type TabKey = 'overview' | 'products' | 'staff' | 'stock';
type ReportType = 'revenue' | 'transactions' | 'items' | 'avg_sale';
type SortKey = 'revenue' | 'units' | 'profit';

// ─── Constants ────────────────────────────────────────────────
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
};

const PERIOD_API_MAP: Record<Period, string> = {
  today: 'daily',
  week: 'weekly',
  month: 'monthly',
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mobile_wallet: 'Transfer',
};

const METHOD_COLORS: Record<string, string> = {
  cash: C.green,
  card: C.accent,
  mobile_wallet: C.amber,
};

const RANK_COLORS = [C.amber, '#9CA3AF', '#CD7F32', C.violet, C.muted];

const ROLE_COLORS: Record<string, string> = {
  admin: C.rose,
  manager: C.amber,
  cashier: C.green,
};

const PRODUCT_TONES = [C.accent, C.green, C.amber, C.rose, C.violet];

// ─── Helpers ──────────────────────────────────────────────────
const formatCurrency = (amount: number | null | undefined): string => {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toFixed(2)}`;
};

const getPeriodDates = (period: Period) => {
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  const from = new Date();
  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case 'week':
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case 'month':
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
  }

  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
};

const getPeriodSubtitle = (period: Period): string => {
  const now = new Date();
  switch (period) {
    case 'today':
      return now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    case 'month':
      return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
};

const getDayLabel = (dateStr: string, period: Period): string => {
  const d = new Date(dateStr + 'T12:00:00');
  if (period === 'month') return String(d.getDate());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
};

const MONO: any = { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' };

// ─── Chart point type ─────────────────────────────────────────
interface ChartPoint {
  label: string;
  value: number;
}

// ─── KPI Tile (matches DashboardScreen pattern) ───────────────
function KpiTile({
  icon,
  tone,
  label,
  value,
  sub,
  iconSize = 18,
  padding = 14,
  labelFontSize = 12,
  valueFontSize = 20,
  subFontSize = 11,
}: {
  icon: string;
  tone: string;
  label: string;
  value: string;
  sub: string;
  iconSize?: number;
  padding?: number;
  labelFontSize?: number;
  valueFontSize?: number;
  subFontSize?: number;
}) {
  const iconBoxSize = iconSize * 1.89;
  return (
    <View style={[kpi.tile, { flex: 1, padding }]}>
      <View style={[kpi.iconBox, { backgroundColor: tone + '1A', width: iconBoxSize, height: iconBoxSize }]}>
        <MaterialCommunityIcons name={icon as any} size={iconSize} color={tone} />
      </View>
      <Text style={[kpi.label, { fontSize: labelFontSize }]}>{label}</Text>
      <Text style={[kpi.value, MONO, { fontSize: valueFontSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
        {value}
      </Text>
      <Text style={[kpi.sub, { fontSize: subFontSize }]}>{sub}</Text>
    </View>
  );
}

const kpi = StyleSheet.create({
  tile: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconBox: {
    borderRadius: R.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  label: { color: C.muted, fontWeight: '600' },
  value: { fontWeight: '800', marginTop: 2, color: C.ink },
  sub: { color: C.muted, marginTop: 2 },
});

// ─── Bar chart (View-based) ───────────────────────────────────
function BarChart({ data, height = 130 }: { data: ChartPoint[]; height?: number }) {
  if (data.length === 0) {
    return (
      <View style={[bc.empty, { height }]}>
        <MaterialCommunityIcons name="chart-bar" size={32} color={C.border} />
        <Text style={bc.emptyText}>No data for this period</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <View>
      {/* bars + tooltip row */}
      <View style={[bc.barsRow, { height }]}>
        {data.map((d, i) => {
          const isPeak = i === peakIdx;
          const barHeightPct = Math.max(0.04, d.value / maxVal);
          const barHeight = barHeightPct * height;

          return (
            <View key={i} style={bc.barCol}>
              {/* tooltip above peak bar */}
              {isPeak && (
                <View style={bc.tooltip}>
                  <Text style={bc.tooltipText}>{formatCurrency(d.value)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <View
                style={[
                  bc.bar,
                  {
                    height: barHeight,
                    backgroundColor: isPeak ? C.accent : 'rgba(110,86,247,0.18)',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* x-axis labels */}
      <View style={bc.labelsRow}>
        {data.map((d, i) => (
          <Text key={i} style={bc.axisLabel} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const bc = StyleSheet.create({
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  tooltip: {
    backgroundColor: C.ink,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: 'center',
  },
  tooltipText: {
    color: C.accentFg,
    fontSize: 9,
    fontWeight: '700',
    ...MONO,
  },
  labelsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  axisLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: C.muted,
    fontWeight: '500',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
  },
});

// ─── Main Component ───────────────────────────────────────────
export default function AnalyticsScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const { isTablet, deviceType } = useResponsive();
  const spacing = responsiveSpacing(deviceType);
  const fontSize = responsiveFontSize(deviceType);

  const [period, setPeriod] = useState<Period>('week');
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [salesData, setSalesData] = useState<SaleDay[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [paymentsData, setPaymentsData] = useState<PaymentMethod[]>([]);
  const [staffData, setStaffData] = useState<StaffPerf[]>([]);
  const [outstanding, setOutstanding] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [sortBy, setSortBy] = useState<SortKey>('revenue');
  const [reportModal, setReportModal] = useState<ReportType | null>(null);

  // Branch filtering
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  // Ref so useFocusEffect never captures a stale selectedBranchId
  const selectedBranchRef = useRef<string | null>(null);
  // Request counter — drops responses from superseded calls
  const reqId = useRef(0);

  // Stock verification data (all products with inventory)
  const [allProducts, setAllProducts] = useState<any[]>([]);

  const isAdmin = user?.role === 'admin';
  const canManageStaff = ['admin', 'manager'].includes(user?.role ?? '');

  // ── Data loading ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadBranches();
      // Use ref so we always get the live branch even after a Modal focus event
      loadData(period, selectedBranchRef.current);
    }, [period])
  );

  const loadBranches = async () => {
    try {
      const data: any = await ApiClient.get('/branches');
      const list = Array.isArray(data) ? data : (data?.branches ?? data?.data ?? []);
      setBranches(list.filter((b: Branch) => b.is_active));
    } catch {}
  };

  const handleBranchSelect = (branchId: string | null) => {
    // Update ref synchronously BEFORE closing modal (avoids stale closure on focus re-fire)
    selectedBranchRef.current = branchId;
    setSelectedBranchId(branchId);
    setBranchDropdownOpen(false);
    loadData(period, branchId);
  };

  const loadData = async (p: Period, branchId: string | null = null) => {
    // Stamp this request; any response with an older stamp is discarded
    const myReq = ++reqId.current;
    setError(null);
    const cacheKey = `analytics_${p}_${branchId ?? 'all'}`;

    // Stale-while-revalidate: render last-known data instantly, refresh below.
    const cached = await DatabaseService.getApiCache<any>(cacheKey);
    if (cached) {
      if (cached.salesData) setSalesData(cached.salesData);
      if (cached.topProducts) setTopProducts(cached.topProducts);
      if (cached.paymentsData) setPaymentsData(cached.paymentsData);
      if (cached.staffData) setStaffData(cached.staffData);
      if (cached.allProducts) setAllProducts(cached.allProducts);
      if (cached.outstanding) setOutstanding(cached.outstanding);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const { dateFrom, dateTo } = getPeriodDates(p);
    const bp = branchId ? `&branch_id=${encodeURIComponent(branchId)}` : '';

    const requests: Promise<any>[] = [
      ApiClient.get(`/analytics/sales?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}${bp}`),
      ApiClient.get(`/analytics/top-products?period=${PERIOD_API_MAP[p]}&limit=10${bp}`),
      ApiClient.get(
        `/analytics/payments/methods?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}${bp}`
      ),
    ];

    if (canManageStaff) {
      requests.push(
        ApiClient.get(
          `/analytics/employee-performance?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}${bp}`
        )
      );
      // Products list for stock verification tab
      requests.push(ApiClient.get(`/products?limit=500${bp}`));
    }

    // Outstanding total always last so the conditional positions above stay stable.
    const outstandingIdx = requests.length;
    requests.push(ApiClient.get('/analytics/outstanding'));

    const results = await Promise.allSettled(requests);

    // Drop this response if a newer request has already been dispatched
    if (myReq !== reqId.current) return;

    // canManageStaff: indices [0]=sales [1]=topProducts [2]=payments [3]=staff [4]=allProducts [5]=outstanding
    // non-manager:   indices [0]=sales [1]=topProducts [2]=payments [3]=outstanding
    const [sales, topProductsResult, payments, staffResult, allProdsResult] = results;
    const outstandingResult = results[outstandingIdx];

    if (sales.status === 'fulfilled') {
      setSalesData(Array.isArray(sales.value) ? (sales.value as SaleDay[]) : []);
    }
    if (topProductsResult.status === 'fulfilled') {
      setTopProducts(
        Array.isArray(topProductsResult.value) ? (topProductsResult.value as TopProduct[]) : []
      );
    }
    if (payments.status === 'fulfilled') {
      setPaymentsData(Array.isArray(payments.value) ? (payments.value as PaymentMethod[]) : []);
    }
    if (staffResult && staffResult.status === 'fulfilled') {
      setStaffData(Array.isArray(staffResult.value) ? (staffResult.value as StaffPerf[]) : []);
    }
    if (allProdsResult && allProdsResult.status === 'fulfilled') {
      const p = allProdsResult.value;
      setAllProducts(Array.isArray(p) ? p : []);
    }
    if (outstandingResult && outstandingResult.status === 'fulfilled') {
      const o: any = outstandingResult.value;
      setOutstanding({
        total: Number(o?.total_outstanding ?? 0),
        count: Number(o?.customers_with_balance ?? 0),
      });
    }

    if (
      sales.status === 'rejected' &&
      topProductsResult.status === 'rejected' &&
      payments.status === 'rejected'
    ) {
      setError('Failed to load analytics. Please check your connection.');
    }

    // Persist the freshly-fetched bundle so the next visit renders instantly.
    const bundle: any = {};
    if (sales.status === 'fulfilled') bundle.salesData = Array.isArray(sales.value) ? sales.value : [];
    if (topProductsResult.status === 'fulfilled') bundle.topProducts = Array.isArray(topProductsResult.value) ? topProductsResult.value : [];
    if (payments.status === 'fulfilled') bundle.paymentsData = Array.isArray(payments.value) ? payments.value : [];
    if (staffResult && staffResult.status === 'fulfilled') bundle.staffData = Array.isArray(staffResult.value) ? staffResult.value : [];
    if (allProdsResult && allProdsResult.status === 'fulfilled') bundle.allProducts = Array.isArray(allProdsResult.value) ? allProdsResult.value : [];
    if (outstandingResult && outstandingResult.status === 'fulfilled') {
      const o: any = outstandingResult.value;
      bundle.outstanding = {
        total: Number(o?.total_outstanding ?? 0),
        count: Number(o?.customers_with_balance ?? 0),
      };
    }
    if (Object.keys(bundle).length > 0) {
      DatabaseService.setApiCache(cacheKey, bundle);
    }

    setLoading(false);
  };

  // ── Derived stats ─────────────────────────────────────────────
  const totalRevenue = salesData.reduce((s, d) => s + d.revenue, 0);
  const totalTransactions = salesData.reduce((s, d) => s + d.transactions, 0);
  const totalItems = salesData.reduce((s, d) => s + d.items_sold, 0);
  const avgSale = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  // Profit is computed directly from salesData so it matches the selected period
  const totalProfit = salesData.reduce((s, d) => s + (d.profit ?? 0), 0);
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // ── Stock verification items ───────────────────────────────────
  const soldMap = new Map(topProducts.map((p) => [p.id, p]));
  const stockVerifyItems = allProducts
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      sku: p.sku as string,
      category: (p.category?.name ?? '–') as string,
      stock_on_hand: Number(p.inventory?.quantity_on_hand ?? 0),
      units_sold: soldMap.get(p.id)?.total_sold ?? 0,
      total_revenue: soldMap.get(p.id)?.total_revenue ?? 0,
    }))
    .sort((a, b) => b.units_sold - a.units_sold);

  const totalPaymentsValue = paymentsData.reduce(
    (s, p) => s + Number(p._sum?.total_amount ?? 0),
    0
  );

  // ── Chart data ────────────────────────────────────────────────
  const chartPoints: ChartPoint[] = [...salesData]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      label: getDayLabel(d.date, period),
      value: d.revenue,
    }));

  // ── Sorted products ───────────────────────────────────────────
  const sortedProducts = [...topProducts].sort((a, b) => {
    if (sortBy === 'revenue') return b.total_revenue - a.total_revenue;
    if (sortBy === 'units') return b.total_sold - a.total_sold;
    return (b.profit ?? 0) - (a.profit ?? 0);
  });
  const maxProductVal =
    sortedProducts.length > 0
      ? Math.max(
          ...sortedProducts.map((p) =>
            sortBy === 'revenue'
              ? p.total_revenue
              : sortBy === 'units'
              ? p.total_sold
              : (p.profit ?? 0)
          ),
          1
        )
      : 1;

  // ── Report definitions ────────────────────────────────────────
  const fmtDate = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

  const sortedSalesData = [...salesData].sort((a, b) => a.date.localeCompare(b.date));

  type ReportDef = {
    title: string;
    icon: string;
    color: string;
    headers: string[];
    getRow: (d: SaleDay) => string[];
    summary: { label: string; value: string }[];
  };

  const reportDefs: Record<ReportType, ReportDef> = {
    revenue: {
      title: 'Revenue Report',
      icon: 'cash',
      color: C.green,
      headers: ['Date', 'Revenue (₦)', 'Transactions', 'Items'],
      getRow: (d) => [
        fmtDate(d.date),
        d.revenue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        String(d.transactions),
        String(d.items_sold),
      ],
      summary: [
        { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
        { label: 'Transactions', value: String(totalTransactions) },
        { label: 'Items Sold', value: String(totalItems) },
      ],
    },
    transactions: {
      title: 'Transactions Report',
      icon: 'swap-horizontal',
      color: C.accent,
      headers: ['Date', 'Transactions', 'Revenue (₦)', 'Avg Sale (₦)'],
      getRow: (d) => [
        fmtDate(d.date),
        String(d.transactions),
        d.revenue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        (d.transactions > 0 ? d.revenue / d.transactions : 0).toLocaleString('en', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      ],
      summary: [
        { label: 'Total Transactions', value: String(totalTransactions) },
        { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
        { label: 'Overall Avg', value: formatCurrency(avgSale) },
      ],
    },
    items: {
      title: 'Items Sold Report',
      icon: 'shopping-outline',
      color: '#0284C7',
      headers: ['Date', 'Items Sold', 'Revenue (₦)', 'Transactions'],
      getRow: (d) => [
        fmtDate(d.date),
        String(d.items_sold),
        d.revenue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        String(d.transactions),
      ],
      summary: [
        { label: 'Total Items', value: String(totalItems) },
        { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
        { label: 'Days', value: String(salesData.length) },
      ],
    },
    avg_sale: {
      title: 'Avg. Sale Report',
      icon: 'trending-up',
      color: C.amber,
      headers: ['Date', 'Avg Sale (₦)', 'Transactions', 'Revenue (₦)'],
      getRow: (d) => [
        fmtDate(d.date),
        (d.transactions > 0 ? d.revenue / d.transactions : 0).toLocaleString('en', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        String(d.transactions),
        d.revenue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ],
      summary: [
        { label: 'Overall Avg Sale', value: formatCurrency(avgSale) },
        { label: 'Total Transactions', value: String(totalTransactions) },
        { label: 'Total Revenue', value: formatCurrency(totalRevenue) },
      ],
    },
  };

  // ── CSV download / share ──────────────────────────────────────
  const handleDownloadCSV = async () => {
    if (!reportModal) return;
    const def = reportDefs[reportModal];

    const lines: string[] = [
      `# ${def.title}`,
      `# Period: ${getPeriodSubtitle(period)}`,
      `# Generated: ${new Date().toLocaleString()}`,
      '',
      def.headers.map((h) => `"${h}"`).join(','),
      ...sortedSalesData.map((d) =>
        def.getRow(d).map((c) => `"${c.replace(/"/g, '""')}"`).join(',')
      ),
      '',
      '# Summary',
      ...def.summary.map((s) => `"${s.label}","${s.value}"`),
    ];

    try {
      await Share.share({
        message: lines.join('\n'),
        title: def.title,
      });
    } catch {
      Alert.alert('Error', 'Could not share report.');
    }
  };

  // ── Stock verification CSV download ──────────────────────────
  const handleDownloadStockVerify = async () => {
    const lines = [
      '# Stock Verification Report',
      `# Period: ${getPeriodSubtitle(period)}`,
      `# Generated: ${new Date().toLocaleString()}`,
      '',
      '"Product Name","SKU","Category","Stock On Hand","Units Sold","Revenue (N)"',
      ...stockVerifyItems.map((item) =>
        [
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.sku}"`,
          `"${item.category}"`,
          `"${item.stock_on_hand}"`,
          `"${item.units_sold}"`,
          `"${item.total_revenue.toFixed(2)}"`,
        ].join(',')
      ),
    ];

    try {
      await Share.share({
        message: lines.join('\n'),
        title: 'Stock Verification Report',
      });
    } catch {
      Alert.alert('Error', 'Could not share report.');
    }
  };

  // ── Tab definitions ───────────────────────────────────────────
  const tabs = [
    { key: 'overview' as TabKey, label: 'Overview', icon: 'chart-box-outline' },
    { key: 'products' as TabKey, label: 'Products', icon: 'package-variant-closed' },
    ...(canManageStaff
      ? [
          { key: 'staff' as TabKey, label: 'Staff', icon: 'account-group-outline' },
          { key: 'stock' as TabKey, label: 'Stock', icon: 'clipboard-check-outline' },
        ]
      : []),
  ];

  // ── Render ─────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 52), paddingBottom: 110, paddingHorizontal: isTablet ? spacing.lg : spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerEyebrow, { fontSize: fontSize.xs }]}>
              Analytics · {getPeriodSubtitle(period)}
            </Text>
            <Text style={[s.headerTitle, { fontSize: isTablet ? 32 : 26 }]}>Performance</Text>
          </View>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => reportModal === null && setReportModal('revenue')}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="download-outline" size={20} color={C.ink} />
          </TouchableOpacity>
        </View>

        {/* ── Period segmented control ── */}
        <View style={s.periodContainer}>
          {(['today', 'week', 'month'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[s.periodBtn, period === p && s.periodBtnActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.8}
            >
              <Text style={[s.periodBtnText, period === p && s.periodBtnTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Branch filter chips (visible when branches exist) ── */}
        {branches.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 14 }}
            contentContainerStyle={s.branchScrollContent}
          >
            <TouchableOpacity
              style={[s.branchChip, selectedBranchId === null && s.branchChipActive]}
              onPress={() => handleBranchSelect(null)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="store-outline"
                size={13}
                color={selectedBranchId === null ? C.accentFg : C.accent}
              />
              <Text style={[s.branchChipText, selectedBranchId === null && s.branchChipTextActive]}>
                All Branches
              </Text>
            </TouchableOpacity>
            {branches.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[s.branchChip, selectedBranchId === b.id && s.branchChipActive]}
                onPress={() => handleBranchSelect(b.id)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="store-marker-outline"
                  size={13}
                  color={selectedBranchId === b.id ? C.accentFg : C.accent}
                />
                <Text style={[s.branchChipText, selectedBranchId === b.id && s.branchChipTextActive]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Hero chart card ── */}
        <View style={[s.heroCard, { padding: isTablet ? spacing.lg : 18 }]}>
          {/* top row */}
          <View style={s.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroEyebrow}>REVENUE</Text>
              <View style={s.heroAmountRow}>
                <Text style={[s.heroAmount, MONO]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {formatCurrency(totalRevenue)}
                </Text>
                <View style={s.greenPill}>
                  <Text style={s.greenPillText}>↗ +18.4%</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={s.branchSelectorBtn}
              onPress={() => setBranchDropdownOpen(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="store-outline" size={14} color={C.muted} />
              <Text style={s.branchSelectorText} numberOfLines={1}>
                {selectedBranchId
                  ? (branches.find((b) => b.id === selectedBranchId)?.name ?? 'Branch')
                  : 'All Branches'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={14} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* bar chart */}
          <View style={{ marginTop: 16 }}>
            <BarChart data={chartPoints} height={130} />
          </View>
        </View>

        {/* ── View toggle chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
          contentContainerStyle={s.tabChipsContent}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tabChip, activeTab === tab.key && s.tabChipActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={14}
                color={activeTab === tab.key ? C.accentFg : C.ink}
              />
              <Text style={[s.tabChipText, activeTab === tab.key && s.tabChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Loading / Error ── */}
        {loading ? (
          <View style={s.centreBox}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={s.centreText}>Loading analytics…</Text>
          </View>
        ) : error ? (
          <View style={s.centreBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={44} color={C.rose} />
            <Text style={[s.centreText, { color: C.rose }]}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => loadData(period)}>
              <Text style={s.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ══════════════════════════════════════════════════
                OVERVIEW TAB
            ══════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <>
                {/* KPI grid - 2 columns on phone, 4 on tablet */}
                <View style={[s.kpiGrid, isTablet && { flexDirection: 'row', flexWrap: 'wrap' }]}>
                  <TouchableOpacity
                    style={[{ flex: 1 }, isTablet && { width: '50%', paddingRight: spacing.sm }]}
                    activeOpacity={0.8}
                    onPress={() => setReportModal('revenue')}
                  >
                    <KpiTile
                      icon="cash-multiple"
                      tone={C.green}
                      label="Revenue"
                      value={formatCurrency(totalRevenue)}
                      sub={`${totalTransactions} sales`}
                      iconSize={isTablet ? 24 : 18}
                      padding={isTablet ? spacing.md : spacing.sm}
                      labelFontSize={isTablet ? fontSize.sm : fontSize.xs}
                      valueFontSize={isTablet ? 24 : 20}
                      subFontSize={isTablet ? 12 : 11}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[{ flex: 1 }, isTablet && { width: '50%', paddingLeft: spacing.xs }]}
                    activeOpacity={0.8}
                    onPress={() => setReportModal('transactions')}
                  >
                    <KpiTile
                      icon="swap-horizontal"
                      tone={C.accent}
                      label="Transactions"
                      value={String(totalTransactions)}
                      sub="this period"
                      iconSize={isTablet ? 24 : 18}
                      padding={isTablet ? spacing.md : spacing.sm}
                      labelFontSize={isTablet ? fontSize.sm : fontSize.xs}
                      valueFontSize={isTablet ? 24 : 20}
                      subFontSize={isTablet ? 12 : 11}
                    />
                  </TouchableOpacity>
                  {isTablet && (
                    <>
                      <TouchableOpacity
                        style={{ width: '50%', paddingRight: spacing.sm, marginTop: spacing.sm }}
                        activeOpacity={0.8}
                        onPress={() => setReportModal('avg_sale')}
                      >
                        <KpiTile
                          icon="trending-up"
                          tone={C.amber}
                          label="Avg. Sale"
                          value={formatCurrency(avgSale)}
                          sub="per transaction"
                          iconSize={24}
                          padding={spacing.md}
                          labelFontSize={fontSize.sm}
                          valueFontSize={24}
                          subFontSize={12}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ width: '50%', paddingLeft: spacing.xs, marginTop: spacing.sm }}
                        activeOpacity={0.8}
                        onPress={() => setReportModal('items')}
                      >
                        <KpiTile
                          icon="shopping-outline"
                          tone='#0284C7'
                          label="Items Sold"
                          value={String(totalItems)}
                          sub="units"
                          iconSize={24}
                          padding={spacing.md}
                          labelFontSize={fontSize.sm}
                          valueFontSize={24}
                          subFontSize={12}
                        />
                      </TouchableOpacity>
                    </>
                  )}
                  {!isTablet && (
                    <TouchableOpacity
                      style={{ flex: 1, marginTop: spacing.sm }}
                      activeOpacity={0.8}
                      onPress={() => setReportModal('avg_sale')}
                    >
                      <KpiTile
                        icon="trending-up"
                        tone={C.amber}
                        label="Avg. Sale"
                        value={formatCurrency(avgSale)}
                        sub="per transaction"
                        iconSize={18}
                        padding={spacing.sm}
                        labelFontSize={fontSize.xs}
                        valueFontSize={20}
                        subFontSize={11}
                      />
                    </TouchableOpacity>
                  )}
                  {!isTablet && (
                    <TouchableOpacity
                      style={{ flex: 1, marginTop: spacing.sm }}
                      activeOpacity={0.8}
                      onPress={() => setReportModal('items')}
                    >
                      <KpiTile
                        icon="shopping-outline"
                        tone='#0284C7'
                        label="Items Sold"
                        value={String(totalItems)}
                        sub="units"
                        iconSize={18}
                        padding={spacing.sm}
                        labelFontSize={fontSize.xs}
                        valueFontSize={20}
                        subFontSize={11}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Profit card */}
                <View style={s.profitCard}>
                  <View style={s.profitLeft}>
                    <View style={s.profitIconBox}>
                      <MaterialCommunityIcons name="chart-line" size={18} color={C.accent} />
                    </View>
                    <View>
                      <Text style={s.profitLabel}>Total Profit</Text>
                      <Text style={[s.profitValue, MONO]}>{formatCurrency(totalProfit)}</Text>
                    </View>
                  </View>
                  <View
                    style={[
                      s.marginBadge,
                      {
                        backgroundColor:
                          profitMargin >= 0 ? C.greenBg : C.roseBg,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={profitMargin >= 0 ? 'trending-up' : 'trending-down'}
                      size={13}
                      color={profitMargin >= 0 ? C.green : C.rose}
                    />
                    <Text
                      style={[
                        s.marginBadgeText,
                        { color: profitMargin >= 0 ? C.green : C.rose },
                      ]}
                    >
                      {Math.abs(profitMargin).toFixed(1)}% margin
                    </Text>
                  </View>
                </View>

                {/* Outstanding card — credit owed by customers */}
                <View style={s.profitCard}>
                  <View style={s.profitLeft}>
                    <View
                      style={[
                        s.profitIconBox,
                        { backgroundColor: C.amber + '1A' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="account-cash-outline"
                        size={18}
                        color={C.amber}
                      />
                    </View>
                    <View>
                      <Text style={s.profitLabel}>Total Outstanding</Text>
                      <Text style={[s.profitValue, MONO]}>
                        {formatCurrency(outstanding.total)}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      s.marginBadge,
                      { backgroundColor: outstanding.count > 0 ? C.amberBg : C.greenBg },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account-multiple-outline"
                      size={13}
                      color={outstanding.count > 0 ? C.amber : C.green}
                    />
                    <Text
                      style={[
                        s.marginBadgeText,
                        { color: outstanding.count > 0 ? C.amber : C.green },
                      ]}
                    >
                      {outstanding.count} {outstanding.count === 1 ? 'customer' : 'customers'}
                    </Text>
                  </View>
                </View>

                {/* Payment methods */}
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <View style={[s.cardIconBox, { backgroundColor: C.violetBg }]}>
                      <MaterialCommunityIcons
                        name="credit-card-multiple-outline"
                        size={15}
                        color={C.accent}
                      />
                    </View>
                    <Text style={s.cardTitle}>Payment Methods</Text>
                  </View>

                  {paymentsData.length === 0 ? (
                    <Text style={s.emptyText}>No payment data for this period</Text>
                  ) : (
                    paymentsData.map((p, i) => {
                      const method = p.payment_method ?? '';
                      const amount = Number(p._sum?.total_amount ?? 0);
                      const count = Number(p._count?.id ?? 0);
                      const pct = totalPaymentsValue > 0 ? amount / totalPaymentsValue : 0;
                      const color = METHOD_COLORS[method] ?? C.accent;

                      return (
                        <View key={i} style={s.paymentBlock}>
                          <View style={s.paymentTopRow}>
                            <View style={[s.paymentDot, { backgroundColor: color }]} />
                            <Text style={s.paymentLabel}>
                              {METHOD_LABELS[method] ?? method}
                            </Text>
                            <Text style={s.paymentCount}>{count} txns</Text>
                            <Text style={[s.paymentAmount, MONO, { color }]}>
                              {formatCurrency(amount)}
                            </Text>
                            <Text style={s.paymentPct}>{(pct * 100).toFixed(1)}%</Text>
                          </View>
                          <View style={s.payBarBg}>
                            <View
                              style={[
                                s.payBarFill,
                                { width: `${Math.max(2, pct * 100)}%`, backgroundColor: color },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}

            {/* ══════════════════════════════════════════════════
                PRODUCTS TAB
            ══════════════════════════════════════════════════ */}
            {activeTab === 'products' && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.cardIconBox, { backgroundColor: C.violetBg }]}>
                    <MaterialCommunityIcons
                      name="package-variant-closed"
                      size={15}
                      color={C.accent}
                    />
                  </View>
                  <Text style={s.cardTitle}>Top Products</Text>
                  <View style={s.sortToggle}>
                    {(['revenue', 'units', 'profit'] as SortKey[]).map((key) => (
                      <TouchableOpacity
                        key={key}
                        style={[s.sortBtn, sortBy === key && s.sortBtnActive]}
                        onPress={() => setSortBy(key)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[s.sortBtnText, sortBy === key && s.sortBtnTextActive]}
                        >
                          {key.charAt(0).toUpperCase() + key.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {sortedProducts.length === 0 ? (
                  <View style={s.emptyState}>
                    <MaterialCommunityIcons name="package-variant" size={44} color={C.border} />
                    <Text style={s.emptyText}>No product data for this period</Text>
                  </View>
                ) : (
                  sortedProducts.map((p, i) => {
                    const val =
                      sortBy === 'revenue'
                        ? p.total_revenue
                        : sortBy === 'units'
                        ? p.total_sold
                        : (p.profit ?? 0);
                    const pct = maxProductVal > 0 ? val / maxProductVal : 0;
                    const tone = PRODUCT_TONES[Math.min(i, PRODUCT_TONES.length - 1)];
                    const profit = p.profit ?? 0;
                    const profitPositive = profit >= 0;
                    const initial = p.name.charAt(0).toUpperCase();

                    return (
                      <View
                        key={p.id}
                        style={[
                          s.productRow,
                          i === sortedProducts.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        {/* Rank badge */}
                        <View style={s.rankBadge}>
                          <Text style={[s.rankNumber, MONO]}>{i + 1}</Text>
                        </View>

                        {/* Letter avatar */}
                        <View style={[s.letterAvatar, { backgroundColor: tone + '1A' }]}>
                          <Text style={[s.letterText, { color: tone }]}>{initial}</Text>
                        </View>

                        {/* Product info + bar */}
                        <View style={s.productBody}>
                          <Text style={s.productName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={s.productMeta}>
                            {p.total_sold} sold
                          </Text>
                          <View style={s.productBarBg}>
                            <View
                              style={[
                                s.productBarFill,
                                {
                                  width: `${Math.max(2, pct * 100)}%`,
                                  backgroundColor: tone,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        {/* Revenue */}
                        <View style={s.productValues}>
                          <Text style={[s.productRevenue, MONO]} numberOfLines={1}>
                            {formatCurrency(p.total_revenue)}
                          </Text>
                          <Text style={s.productTxns}>{p.transaction_count} txns</Text>
                          {p.profit !== undefined && (
                            <View style={s.productProfitRow}>
                              <MaterialCommunityIcons
                                name={profitPositive ? 'trending-up' : 'trending-down'}
                                size={10}
                                color={profitPositive ? C.green : C.rose}
                              />
                              <Text
                                style={[
                                  s.productProfit,
                                  MONO,
                                  { color: profitPositive ? C.green : C.rose },
                                ]}
                              >
                                {formatCurrency(profit)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ══════════════════════════════════════════════════
                STAFF TAB
            ══════════════════════════════════════════════════ */}
            {activeTab === 'staff' && canManageStaff && (
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <View style={[s.cardIconBox, { backgroundColor: C.violetBg }]}>
                    <MaterialCommunityIcons
                      name="account-group-outline"
                      size={15}
                      color={C.accent}
                    />
                  </View>
                  <Text style={s.cardTitle}>Employee Performance</Text>
                </View>

                {staffData.length === 0 ? (
                  <View style={s.emptyState}>
                    <MaterialCommunityIcons
                      name="account-multiple-outline"
                      size={44}
                      color={C.border}
                    />
                    <Text style={s.emptyText}>No performance data for this period</Text>
                  </View>
                ) : (
                  staffData.map((emp, i) => {
                    const initial =
                      (emp.first_name.charAt(0) + emp.last_name.charAt(0)).toUpperCase();
                    const roleColor = ROLE_COLORS[emp.role] ?? C.accent;

                    return (
                      <View
                        key={emp.id}
                        style={[
                          s.staffRow,
                          i === staffData.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        {/* Letter avatar */}
                        <View style={[s.staffAvatar, { backgroundColor: C.violetBg }]}>
                          <Text style={s.staffAvatarText}>{initial}</Text>
                        </View>

                        {/* Info */}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.staffName} numberOfLines={1}>
                            {emp.first_name} {emp.last_name}
                          </Text>
                          <Text style={s.staffMeta}>
                            <Text style={[s.roleText, { color: roleColor }]}>{emp.role}</Text>
                            {'  ·  '}{emp.transaction_count} txns
                          </Text>
                        </View>

                        {/* Revenue */}
                        <Text style={[s.staffRevenue, MONO]} numberOfLines={1}>
                          {formatCurrency(emp.total_revenue)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ══════════════════════════════════════════════════
                STOCK VERIFICATION TAB
            ══════════════════════════════════════════════════ */}
            {activeTab === 'stock' && canManageStaff && (
              <View style={s.card}>
                {/* Section header + download */}
                <View style={s.cardHeader}>
                  <View style={[s.cardIconBox, { backgroundColor: C.violetBg }]}>
                    <MaterialCommunityIcons
                      name="clipboard-check-outline"
                      size={15}
                      color={C.accent}
                    />
                  </View>
                  <Text style={s.cardTitle}>Stock Verification</Text>
                  <TouchableOpacity
                    style={s.csvBtn}
                    onPress={handleDownloadStockVerify}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="download" size={13} color={C.accentFg} />
                    <Text style={s.csvBtnText}>Share CSV</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.stockHelper}>
                  Compare physical shelf count against system stock.
                </Text>

                {/* Table header */}
                <View style={s.stockHeaderRow}>
                  <Text style={[s.stockHeaderCell, { flex: 1 }]}>Product / SKU</Text>
                  <Text style={[s.stockHeaderCell, { width: 68, textAlign: 'center' }]}>
                    On Hand
                  </Text>
                  <Text style={[s.stockHeaderCell, { width: 52, textAlign: 'center' }]}>
                    Sold
                  </Text>
                  <Text style={[s.stockHeaderCell, { width: 72, textAlign: 'right' }]}>
                    Revenue
                  </Text>
                </View>

                {allProducts.length === 0 ? (
                  <View style={s.emptyState}>
                    <MaterialCommunityIcons
                      name="clipboard-text-outline"
                      size={44}
                      color={C.border}
                    />
                    <Text style={s.emptyText}>No product data available</Text>
                  </View>
                ) : (
                  stockVerifyItems.map((item, i) => {
                    const isOut = item.stock_on_hand <= 0;
                    const isLow = item.stock_on_hand > 0 && item.stock_on_hand <= 5;
                    const qtyColor = isOut ? C.rose : isLow ? C.amber : C.green;

                    return (
                      <View
                        key={item.id}
                        style={[
                          s.stockRow,
                          i === stockVerifyItems.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.stockProductName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={s.stockProductSku}>
                            {item.sku} · {item.category}
                          </Text>
                        </View>
                        <View style={{ width: 68, alignItems: 'center' }}>
                          <Text style={[s.stockQty, MONO, { color: qtyColor }]}>
                            {item.stock_on_hand}
                          </Text>
                        </View>
                        <View style={{ width: 52, alignItems: 'center' }}>
                          <Text style={[s.stockSold, MONO]}>{item.units_sold}</Text>
                        </View>
                        <View style={{ width: 72, alignItems: 'flex-end' }}>
                          <Text style={[s.stockRevenue, MONO]}>
                            {formatCurrency(item.total_revenue)}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          BRANCH SELECTOR MODAL
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={branchDropdownOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setBranchDropdownOpen(false)}
      >
        <TouchableOpacity
          style={bd.overlay}
          activeOpacity={1}
          onPress={() => setBranchDropdownOpen(false)}
        >
          <View style={bd.sheet}>
            <View style={bd.handle} />
            <View style={bd.sheetHeader}>
              <Text style={bd.sheetTitle}>Select Branch</Text>
              <TouchableOpacity onPress={() => setBranchDropdownOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>

            {/* All Branches */}
            <TouchableOpacity
              style={[bd.option, selectedBranchId === null && bd.optionActive]}
              onPress={() => handleBranchSelect(null)}
            >
              <MaterialCommunityIcons name="domain" size={16} color={selectedBranchId === null ? C.accent : C.muted} />
              <Text style={[bd.optionText, selectedBranchId === null && { color: C.accent, fontWeight: '700' }]}>
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
              branches.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[bd.option, selectedBranchId === b.id && bd.optionActive]}
                  onPress={() => handleBranchSelect(b.id)}
                >
                  <MaterialCommunityIcons name="source-branch" size={16} color={selectedBranchId === b.id ? C.accent : C.muted} />
                  <Text style={[bd.optionText, selectedBranchId === b.id && { color: C.accent, fontWeight: '700' }]}>
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

      {/* ══════════════════════════════════════════════════
          REPORT DETAIL MODAL
      ══════════════════════════════════════════════════ */}
      <Modal
        visible={reportModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setReportModal(null)}
      >
        <View style={m.overlay}>
          <View style={m.sheet}>
            {/* Drag handle */}
            <View style={m.dragHandle} />

            {reportModal &&
              (() => {
                const def = reportDefs[reportModal];
                return (
                  <>
                    {/* Header */}
                    <View style={m.header}>
                      <View style={[m.iconBox, { backgroundColor: def.color + '18' }]}>
                        <MaterialCommunityIcons name={def.icon as any} size={20} color={def.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={m.title}>{def.title}</Text>
                        <Text style={m.sub}>{getPeriodSubtitle(period)}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setReportModal(null)}
                        style={m.closeBtn}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="close" size={20} color={C.muted} />
                      </TouchableOpacity>
                    </View>

                    {/* Summary chips */}
                    <View style={m.summaryRow}>
                      {def.summary.map((sm, i) => (
                        <View
                          key={i}
                          style={[m.summaryChip, { borderColor: def.color + '40' }]}
                        >
                          <Text style={[m.summaryValue, MONO, { color: def.color }]}>
                            {sm.value}
                          </Text>
                          <Text style={m.summaryLabel}>{sm.label}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Table */}
                    <ScrollView
                      style={m.tableScroll}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: 8 }}
                    >
                      {/* Table header */}
                      <View style={[m.tableRow, m.tableHeaderRow]}>
                        {def.headers.map((h, i) => (
                          <Text
                            key={i}
                            style={[
                              m.tableHeaderCell,
                              i === 0 ? m.tableDateCell : m.tableValueCell,
                            ]}
                            numberOfLines={1}
                          >
                            {h}
                          </Text>
                        ))}
                      </View>

                      {sortedSalesData.length === 0 ? (
                        <View style={m.tableEmpty}>
                          <Text style={m.tableEmptyText}>No data for this period</Text>
                        </View>
                      ) : (
                        sortedSalesData.map((d, rowIdx) => {
                          const cells = def.getRow(d);
                          return (
                            <View
                              key={rowIdx}
                              style={[
                                m.tableRow,
                                rowIdx % 2 === 0 ? m.tableRowEven : m.tableRowOdd,
                              ]}
                            >
                              {cells.map((cell, colIdx) => {
                                const header = def.headers[colIdx] ?? '';
                                const isCurrency = header.includes('₦');
                                return (
                                  <Text
                                    key={colIdx}
                                    style={[
                                      m.tableCell,
                                      colIdx === 0 ? m.tableDateCell : m.tableValueCell,
                                      colIdx === 0 && { color: C.ink, fontWeight: '600' },
                                      isCurrency && MONO,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {isCurrency ? `₦${cell}` : cell}
                                  </Text>
                                );
                              })}
                            </View>
                          );
                        })
                      )}

                      {/* Totals footer */}
                      {sortedSalesData.length > 0 && (
                        <View style={[m.tableRow, m.tableTotalRow]}>
                          <Text
                            style={[
                              m.tableCell,
                              m.tableDateCell,
                              { color: C.ink, fontWeight: '800' },
                            ]}
                          >
                            TOTAL
                          </Text>
                          {def.headers.slice(1).map((header, colIdx) => {
                            const colData = sortedSalesData.map(
                              (d) => def.getRow(d)[colIdx + 1]
                            );
                            const isCurrencyCol = header.includes('₦');
                            const nums = colData.map(
                              (v) => parseFloat(v.replace(/,/g, '')) || 0
                            );
                            const sum = nums.reduce((a, b) => a + b, 0);
                            const isAvgCol =
                              reportModal === 'avg_sale' && colIdx === 0;
                            const displayVal = isAvgCol
                              ? formatCurrency(avgSale)
                              : isCurrencyCol
                              ? formatCurrency(sum)
                              : String(sum);
                            return (
                              <Text
                                key={colIdx}
                                style={[
                                  m.tableCell,
                                  m.tableValueCell,
                                  { color: C.ink, fontWeight: '800' },
                                  MONO,
                                ]}
                                numberOfLines={1}
                              >
                                {displayVal}
                              </Text>
                            );
                          })}
                        </View>
                      )}
                    </ScrollView>

                    {/* Footer: share / download */}
                    <View style={m.footer}>
                      <TouchableOpacity
                        style={[m.downloadBtn, { backgroundColor: def.color }]}
                        onPress={handleDownloadCSV}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="download" size={18} color={C.accentFg} />
                        <Text style={m.downloadBtnText}>Share / Download CSV</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: {
    paddingHorizontal: S.xl,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerEyebrow: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: C.ink,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  // ── Period segmented control ─────────────────────────────────
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 4,
    gap: 2,
    marginBottom: 16,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  periodBtnActive: {
    backgroundColor: C.ink,
  },
  periodBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
  },
  periodBtnTextActive: {
    color: C.bg,
  },

  // ── Branch chips ─────────────────────────────────────────────
  branchScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.violetBg,
    borderWidth: 1,
    borderColor: C.border,
  },
  branchChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  branchChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.accent,
  },
  branchChipTextActive: {
    color: C.accentFg,
  },

  // ── Hero card ────────────────────────────────────────────────
  heroCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: C.muted,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
  },
  greenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.greenBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: R.pill,
  },
  greenPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },
  branchSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 130,
    marginTop: 2,
  },
  branchSelectorText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
    flex: 1,
  },

  // ── View toggle chips ────────────────────────────────────────
  tabChipsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  tabChipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  tabChipTextActive: {
    color: C.accentFg,
  },

  // ── KPI grid ─────────────────────────────────────────────────
  kpiGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 0,
  },

  // ── Profit card ──────────────────────────────────────────────
  profitCard: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profitIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.violetBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profitLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
  },
  profitValue: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    marginTop: 2,
  },
  marginBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.pill,
  },
  marginBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Generic card ─────────────────────────────────────────────
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: R.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },

  // ── Payment methods ──────────────────────────────────────────
  paymentBlock: {
    marginBottom: 14,
  },
  paymentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  paymentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  paymentLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  paymentCount: {
    fontSize: 11,
    color: C.muted,
  },
  paymentAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentPct: {
    fontSize: 11,
    color: C.muted,
    width: 42,
    textAlign: 'right',
  },
  payBarBg: {
    height: 6,
    borderRadius: R.pill,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  payBarFill: {
    height: '100%',
    borderRadius: R.pill,
  },

  // ── Products ─────────────────────────────────────────────────
  sortToggle: {
    flexDirection: 'row',
    borderRadius: R.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.bg,
  },
  sortBtnActive: {
    backgroundColor: C.accent,
  },
  sortBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
  },
  sortBtnTextActive: {
    color: C.accentFg,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: R.xs,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: C.muted,
  },
  letterAvatar: {
    width: 36,
    height: 36,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    fontSize: 15,
    fontWeight: '700',
  },
  productBody: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  productMeta: {
    fontSize: 11,
    color: C.muted,
    marginBottom: 6,
    marginTop: 1,
  },
  productBarBg: {
    height: 4,
    borderRadius: R.pill,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  productBarFill: {
    height: '100%',
    borderRadius: R.pill,
  },
  productValues: {
    alignItems: 'flex-end',
    minWidth: 72,
  },
  productRevenue: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  productTxns: {
    fontSize: 10,
    color: C.muted,
    marginTop: 2,
  },
  productProfitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  productProfit: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Staff ────────────────────────────────────────────────────
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: R.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  staffAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: C.accent,
  },
  staffName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  staffMeta: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  roleText: {
    fontWeight: '700',
    fontSize: 12,
  },
  staffRevenue: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
    flexShrink: 0,
  },

  // ── Stock ────────────────────────────────────────────────────
  csvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: R.xs,
  },
  csvBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.accentFg,
  },
  stockHelper: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 12,
    lineHeight: 17,
  },
  stockHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  stockHeaderCell: {
    fontSize: 10,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 6,
  },
  stockProductName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  stockProductSku: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  stockQty: {
    fontSize: 15,
    fontWeight: '800',
  },
  stockSold: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accent,
  },
  stockRevenue: {
    fontSize: 12,
    fontWeight: '600',
    color: C.ink,
  },

  // ── Empty / loading ──────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  centreBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  centreText: {
    color: C.muted,
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: C.accent,
    borderRadius: R.sm,
    marginTop: 4,
  },
  retryBtnText: {
    color: C.accentFg,
    fontWeight: '700',
    fontSize: 14,
  },
});

// ─── Branch dropdown styles ───────────────────────────────────
const bd = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  optionActive: { backgroundColor: C.violetBg },
  optionText: { fontSize: 14, fontWeight: '500', color: C.ink, flex: 1 },
});

// ─── Modal styles ─────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    paddingHorizontal: S.xl,
    paddingBottom: 32,
    maxHeight: '88%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },
  sub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  summaryChip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  summaryLabel: {
    fontSize: 10,
    color: C.muted,
    marginTop: 2,
    textAlign: 'center',
  },
  tableScroll: {
    flex: 1,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  tableHeaderRow: {
    borderBottomWidth: 2,
    borderBottomColor: C.border,
    marginBottom: 2,
  },
  tableRowEven: {
    backgroundColor: C.bg,
  },
  tableRowOdd: {
    backgroundColor: C.card,
  },
  tableTotalRow: {
    borderTopWidth: 2,
    borderTopColor: C.border,
    marginTop: 2,
    backgroundColor: C.bg,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableCell: {
    fontSize: 13,
    color: C.ink,
  },
  tableDateCell: {
    width: 68,
    marginRight: 4,
  },
  tableValueCell: {
    flex: 1,
    textAlign: 'right',
  },
  tableEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  tableEmptyText: {
    color: C.muted,
    fontSize: 13,
  },
  footer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  downloadBtnText: {
    color: C.accentFg,
    fontWeight: '700',
    fontSize: 15,
  },
});
