import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  FlatList,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format, differenceInCalendarDays } from 'date-fns';

import ApiClient from '../services/ApiClient';
import { C, R, S, F, alpha, naira } from '../theme';

// ─── Types ────────────────────────────────────────────────────
type Status = 'active' | 'expired' | 'past_due';
type PlanSlug = 'business' | 'pro';
type PlanLabel = 'Business' | 'Pro';

interface BackendSubscription {
  id: string;
  store_id: string;
  status: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  next_renewal_at: string;
  trial_ends_at?: string | null;
  plan: { id: string; name: string; slug: string; monthly_price: number };
  store?: { id: string; name: string } | null;
}

// UI-side shape (matches design handoff)
interface UISubscription {
  id: string;
  store: string;
  storeId: string;
  plan: PlanLabel;
  status: Status;
  expires: string;       // "22 Jun 2026"
  daysLeft: number;      // positive = remaining, negative = overdue
  amt: number;           // monthly price
}

// ─── Status meta (colours from design tokens) ────────────────
const STATUS_META: Record<Status, { label: string; text: string; bg: string; dot: string }> = {
  active:   { label: 'Active',   text: '#0F8A5B', bg: 'rgba(16,185,129,0.14)', dot: '#10B981' },
  expired:  { label: 'Expired',  text: C.muted,   bg: 'rgba(0,0,0,0.06)',      dot: '#9090A0' },
  past_due: { label: 'Past due', text: C.red,     bg: 'rgba(225,29,107,0.12)', dot: C.rose   },
};

// Plan tones (design spec)
const PLAN_TONE = {
  Business: { tone: C.accent, fg: C.accent,  bgSoft: 'rgba(110,86,247,0.10)' },
  Pro:      { tone: C.amber,  fg: '#B45309', bgSoft: 'rgba(245,158,11,0.12)' },
} as const;

// ─── Backend → UI mapping ────────────────────────────────────
function mapBackendStatus(s: string): Status {
  const v = s.toLowerCase();
  if (v === 'active') return 'active';
  if (v === 'past_due' || v === 'pastdue') return 'past_due';
  return 'expired'; // cancelled / expired / unknown all fold to expired in the UI
}

function mapBackendSub(b: BackendSubscription): UISubscription {
  const expiry = new Date(b.billing_cycle_end);
  const today = new Date();
  const days = differenceInCalendarDays(expiry, today);
  const planLabel: PlanLabel = b.plan.name.toLowerCase().startsWith('pro') ? 'Pro' : 'Business';

  return {
    id: b.id,
    store: b.store?.name || b.store_id,
    storeId: b.store_id,
    plan: planLabel,
    status: mapBackendStatus(b.status),
    expires: format(expiry, 'd MMM yyyy'),
    daysLeft: days,
    amt: Number(b.plan.monthly_price) || 0,
  };
}

// ─── Screen ──────────────────────────────────────────────────
export default function AdminSubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [subs, setSubs] = useState<UISubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [createOpen, setCreateOpen] = useState(false);

  // ── Data ──
  const loadSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const data =
        (await ApiClient.get<BackendSubscription[]>('/admin/subscriptions?limit=100')) || [];
      setSubs(data.map(mapBackendSub));
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadSubscriptions();
  }, [loadSubscriptions]));

  // ── Derived ──
  const counts = useMemo(() => ({
    all:      subs.length,
    active:   subs.filter(s => s.status === 'active').length,
    expired:  subs.filter(s => s.status === 'expired').length,
    past_due: subs.filter(s => s.status === 'past_due').length,
  }), [subs]);

  const mrr = useMemo(
    () => subs.filter(s => s.status === 'active').reduce((a, s) => a + s.amt, 0),
    [subs]
  );

  const filtered = useMemo(() => subs.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!s.store.toLowerCase().includes(q) && !s.storeId.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [subs, filter, query]);

  // ── Actions ──
  const reload = () => loadSubscriptions();

  const onDeactivate = (sub: UISubscription) => {
    Alert.alert(
      'Deactivate subscription?',
      `${sub.store} will lose write access until reactivated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate', style: 'destructive', onPress: async () => {
            try {
              await ApiClient.post(`/admin/subscriptions/${sub.storeId}/deactivate`, {
                reason: 'Admin action from Manage Subscriptions',
              });
              reload();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'Failed to deactivate');
            }
          },
        },
      ]
    );
  };

  const onReactivate = async (sub: UISubscription) => {
    try {
      await ApiClient.post(`/admin/subscriptions/${sub.storeId}/activate`, {
        reason: 'Admin reactivation from Manage Subscriptions',
      });
      reload();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Failed to reactivate');
    }
  };

  const onRenew = (sub: UISubscription) => {
    Alert.alert(
      'Renew subscription?',
      `Extend ${sub.store} by 1 month?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Renew', onPress: async () => {
            try {
              await ApiClient.patch(`/admin/subscriptions/${sub.storeId}`, {
                extendMonths: 1,
                reason: 'Admin renewal from Manage Subscriptions',
              });
              reload();
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || 'Failed to renew');
            }
          },
        },
      ]
    );
  };

  const onRemind = () => {
    Alert.alert('Coming soon', 'Reminder dispatch is not wired up yet.');
  };

  const onCollect = () => {
    Alert.alert('Coming soon', 'Collection flow is not wired up yet.');
  };

  // ── Render ──
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ─── Header bar ─── */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color={C.ink} />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Subscriptions</Text>
          <Text style={styles.subtitle}>
            <Text style={styles.countMono}>{filtered.length}</Text> records
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setCreateOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Create subscription"
        >
          <LinearGradient
            colors={[C.accent, C.accent2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.createBtn}
          >
            <MaterialCommunityIcons name="plus" size={16} color={C.accentFg} />
            <Text style={styles.createBtnLabel}>Create</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ─── Hero MRR card ─── */}
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={[C.accent, C.accent2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* decorative orb */}
          <View style={styles.heroOrb} />
          <Text style={styles.heroEyebrow}>MONTHLY RECURRING REVENUE</Text>
          <Text style={styles.heroAmount}>
            <Text style={styles.heroNairaSign}>₦</Text>
            {mrr.toLocaleString()}
          </Text>
          <View style={styles.statsRow}>
            <Stat label="Active"   value={counts.active} />
            <Stat label="Past due" value={counts.past_due} />
            <Stat label="Expired"  value={counts.expired} />
          </View>
        </LinearGradient>
      </View>

      {/* ─── Search ─── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchInner}>
          <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
          <TextInput
            placeholder="Search by store name or ID…"
            placeholderTextColor={C.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* ─── Filter chips ─── */}
      <View style={styles.chipsBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {(['all', 'active', 'expired', 'past_due'] as const).map(id => (
            <Chip
              key={id}
              label={id === 'past_due' ? 'Past due' : id[0].toUpperCase() + id.slice(1)}
              count={counts[id]}
              active={filter === id}
              onPress={() => setFilter(id)}
            />
          ))}
        </ScrollView>
      </View>

      {/* ─── List ─── */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={s => s.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: insets.bottom + 40,
            gap: 10,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <SubCard
              sub={item}
              onRenew={() => onRenew(item)}
              onDeactivate={() => onDeactivate(item)}
              onReactivate={() => onReactivate(item)}
              onRemind={onRemind}
              onCollect={onCollect}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconTile}>
                <MaterialCommunityIcons name="receipt" size={26} color={C.muted} />
              </View>
              <Text style={styles.emptyTitle}>No subscriptions</Text>
              <Text style={styles.emptySub}>Try a different filter or search.</Text>
            </View>
          }
        />
      )}

      {/* ─── Create bottom sheet ─── */}
      <CreateSubscriptionSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          reload();
        }}
      />
    </View>
  );
}

// ─── Hero stat ───────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ─── Filter chip ─────────────────────────────────────────────
function Chip({
  label, count, active, onPress,
}: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
      <Text style={[styles.chipCount, active && styles.chipCountActive]}> {count}</Text>
    </TouchableOpacity>
  );
}

// ─── Subscription card ───────────────────────────────────────
function SubCard({
  sub, onRenew, onDeactivate, onReactivate, onRemind, onCollect,
}: {
  sub: UISubscription;
  onRenew: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onRemind: () => void;
  onCollect: () => void;
}) {
  const status = STATUS_META[sub.status];
  const plan = PLAN_TONE[sub.plan];
  const isPro = sub.plan === 'Pro';
  const isExpiringSoon = sub.status === 'active' && sub.daysLeft <= 14;

  return (
    <View style={styles.card}>
      {/* Top section */}
      <View style={styles.cardTop}>
        <LinearGradient
          colors={[alpha(plan.tone, 0.13), alpha(plan.tone, 0.04)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planTile}
        >
          <MaterialCommunityIcons name="store" size={20} color={plan.fg} />
        </LinearGradient>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.storeName} numberOfLines={1}>{sub.store}</Text>
          <Text style={styles.storeId}>{sub.storeId}</Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={[styles.statusLabel, { color: status.text }]}>
            {status.label.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Meta panel */}
      <View style={styles.metaPanel}>
        <MetaRow
          label="Plan"
          right={
            <View style={styles.metaRightRow}>
              <View style={[styles.planBadge, { backgroundColor: plan.bgSoft }]}>
                <Text style={[styles.planBadgeLabel, { color: plan.fg }]}>
                  {isPro ? 'PRO' : 'BUSINESS'}
                </Text>
              </View>
              <Text style={styles.metaPriceText}>₦{sub.amt.toLocaleString()}/mo</Text>
            </View>
          }
        />
        <MetaRow
          last
          label="Expires"
          right={
            <View style={styles.metaRightRow}>
              <Text style={styles.metaDateText}>{sub.expires}</Text>
              {sub.status === 'active' && (
                <View style={[
                  styles.daysPill,
                  isExpiringSoon
                    ? { backgroundColor: 'rgba(245,158,11,0.12)' }
                    : { backgroundColor: 'rgba(0,0,0,0.04)' },
                ]}>
                  <Text style={[
                    styles.daysPillText,
                    isExpiringSoon ? { color: '#B45309' } : { color: C.muted },
                  ]}>
                    {sub.daysLeft} days
                  </Text>
                </View>
              )}
              {sub.status === 'past_due' && (
                <View style={[styles.daysPill, { backgroundColor: 'rgba(225,29,107,0.12)' }]}>
                  <Text style={[styles.daysPillText, { color: C.red }]}>
                    {Math.abs(sub.daysLeft)} days overdue
                  </Text>
                </View>
              )}
            </View>
          }
        />
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        {sub.status === 'active' && (
          <>
            <ActionButton variant="ghost" icon="cash-refund" label="Renew" onPress={onRenew} />
            <ActionButton variant="danger" label="Deactivate" onPress={onDeactivate} />
          </>
        )}
        {sub.status === 'past_due' && (
          <>
            <ActionButton variant="primary" label="Collect payment" onPress={onCollect} />
            <ActionButton variant="ghost" icon="bell-outline" label="Remind" onPress={onRemind} />
          </>
        )}
        {sub.status === 'expired' && (
          <>
            <ActionButton variant="primary" icon="cash-refund" label="Reactivate" onPress={onReactivate} />
            <ActionButton variant="ghost" label="View history" onPress={() => {}} />
          </>
        )}
      </View>
    </View>
  );
}

function MetaRow({
  label, right, last,
}: { label: string; right: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowDivider]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View>{right}</View>
    </View>
  );
}

function ActionButton({
  variant, label, icon, onPress,
}: {
  variant: 'primary' | 'ghost' | 'danger';
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
}) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.actionBtn,
        isPrimary && styles.actionBtnPrimary,
        isDanger && styles.actionBtnDanger,
        !isPrimary && !isDanger && styles.actionBtnGhost,
      ]}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color={isPrimary ? C.accentFg : isDanger ? C.red : C.ink}
        />
      )}
      <Text style={[
        styles.actionBtnLabel,
        isPrimary && { color: C.accentFg },
        isDanger && { color: C.red },
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Create Subscription bottom sheet ────────────────────────
function CreateSubscriptionSheet({
  visible, onClose, onCreated,
}: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const insets = useSafeAreaInsets();

  const [storeId, setStoreId] = useState('');
  const [plan, setPlan] = useState<PlanLabel>('Business');
  const [duration, setDuration] = useState<'1' | '3' | '6' | '12'>('1');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const planMeta = useMemo(() => {
    if (plan === 'Pro') {
      return {
        tone: C.amber,
        toneFg: '#B45309',
        label: 'Pro',
        price: 24000,
        features: ['Unlimited branches', 'Priority support'],
      };
    }
    return {
      tone: C.accent,
      toneFg: C.accent,
      label: 'Business',
      price: 12500,
      features: ['1 branch', 'Standard support'],
    };
  }, [plan]);

  const total = planMeta.price * (parseInt(duration, 10) || 1);
  const valid = storeId.trim().length > 0;
  const dirty = storeId.length > 0 || reason.length > 0 || plan !== 'Business' || duration !== '1';

  const handleClose = useCallback(() => {
    if (dirty) {
      Alert.alert('Discard changes?', 'Your input will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { reset(); onClose(); } },
      ]);
    } else {
      reset();
      onClose();
    }
  }, [dirty, onClose]);

  const reset = () => {
    setStoreId('');
    setPlan('Business');
    setDuration('1');
    setReason('');
  };

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await ApiClient.post('/admin/subscriptions', {
        storeId: storeId.trim(),
        planSlug: (plan.toLowerCase() as PlanSlug),
        durationMonths: parseInt(duration, 10),
        reason: reason.trim() || undefined,
      });
      reset();
      onCreated();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Failed to create subscription');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleClose}
        style={styles.backdrop}
      />

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          {/* Grabber */}
          <View style={styles.grabberRow}>
            <View style={styles.grabber} />
          </View>

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Create Subscription</Text>
              <Text style={styles.sheetSubtitle}>
                Manually provision a paid plan for a store
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.sheetClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <MaterialCommunityIcons name="close" size={16} color={C.ink} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.sheetBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Store ID */}
            <FieldLabel label="Store ID" required />
            <TextInput
              value={storeId}
              onChangeText={setStoreId}
              placeholder="e.g. store_014"
              placeholderTextColor={C.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            {/* Plan */}
            <SectionEyebrow>Plan</SectionEyebrow>
            <View style={styles.planGrid}>
              <PlanOption
                active={plan === 'Business'}
                onPress={() => setPlan('Business')}
                name="Business"
                price="₦12,500"
                features={['1 branch', 'Standard support']}
                tone={C.accent}
              />
              <PlanOption
                active={plan === 'Pro'}
                onPress={() => setPlan('Pro')}
                name="Pro"
                price="₦24,000"
                features={['Unlimited branches', 'Priority support']}
                tone={C.amber}
              />
            </View>

            {/* Duration */}
            <SectionEyebrow>Duration</SectionEyebrow>
            <View style={styles.durationRow}>
              {(['1', '3', '6', '12'] as const).map(d => {
                const active = duration === d;
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setDuration(d)}
                    activeOpacity={0.75}
                    style={[styles.durationBtn, active && styles.durationBtnActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[
                      styles.durationNumber,
                      active && { color: C.accentFg },
                    ]}>
                      {d}
                    </Text>
                    <Text style={[
                      styles.durationWord,
                      active && { color: C.accentFg },
                    ]}>
                      {d === '1' ? 'month' : 'months'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Reason */}
            <FieldLabel label="Reason (optional)" />
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. offline payment, special deal"
              placeholderTextColor={C.muted}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.textArea]}
            />

            {/* Summary */}
            <View style={[
              styles.summary,
              {
                backgroundColor: alpha(planMeta.tone, 0.06),
                borderColor: alpha(planMeta.tone, 0.3),
              },
            ]}>
              <Text style={[styles.summaryEyebrow, { color: planMeta.toneFg }]}>
                TOTAL TO PROVISION
              </Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotal}>
                  <Text style={styles.summaryNairaSign}>₦</Text>
                  {total.toLocaleString()}
                </Text>
                <Text style={styles.summaryCaption}>
                  {planMeta.label} × {duration} {parseInt(duration, 10) === 1 ? 'mo' : 'mos'}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.sheetFooter, { paddingBottom: insets.bottom + 14 }]}>
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.75}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!valid || submitting}
              activeOpacity={0.85}
              style={[styles.submitBtnWrap, !valid && styles.submitBtnWrapDisabled]}
            >
              {valid ? (
                <LinearGradient
                  colors={[C.accent, C.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitBtn}
                >
                  <MaterialCommunityIcons name="check" size={16} color={C.accentFg} />
                  <Text style={styles.submitBtnLabel}>
                    {submitting ? 'Creating…' : 'Create subscription'}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.submitBtn, styles.submitBtnDisabled]}>
                  <MaterialCommunityIcons name="check" size={16} color={C.muted} />
                  <Text style={[styles.submitBtnLabel, { color: C.muted }]}>
                    Create subscription
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required && <Text style={{ color: C.red }}> *</Text>}
    </Text>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionEyebrow}>{String(children).toUpperCase()}</Text>;
}

function PlanOption({
  active, onPress, name, price, features, tone,
}: {
  active: boolean;
  onPress: () => void;
  name: string;
  price: string;
  features: string[];
  tone: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.planOption,
        active
          ? {
              borderColor: tone,
              backgroundColor: alpha(tone, 0.08),
            }
          : { borderColor: C.border, backgroundColor: C.card },
      ]}
    >
      {active && (
        <View style={[styles.planCheckBadge, { backgroundColor: tone }]}>
          <MaterialCommunityIcons name="check" size={11} color="#fff" />
        </View>
      )}
      <Text style={styles.planName}>{name}</Text>
      <Text style={[styles.planPrice, { color: tone }]}>{price}</Text>
      <Text style={styles.planPriceSub}>per month</Text>
      <View style={styles.planFeaturesDivider} />
      <View style={{ gap: 4 }}>
        {features.map(f => (
          <View key={f} style={styles.planFeatureRow}>
            <MaterialCommunityIcons name="check" size={11} color={tone} />
            <Text style={styles.planFeatureText}>{f}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: C.card,
  },
  iconBtn: {
    width: 40, height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: C.ink,
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  countMono: {
    fontFamily: F.mono,
    fontWeight: '700',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 22,
      },
      android: { elevation: 6 },
    }),
  },
  createBtnLabel: {
    color: C.accentFg,
    fontWeight: '700',
    fontSize: 13,
  },

  // Hero
  heroWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: C.card,
  },
  hero: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    top: -30, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.accentFg,
    opacity: 0.85,
  },
  heroAmount: {
    marginTop: 4,
    fontFamily: F.mono,
    fontWeight: '700',
    fontSize: 30,
    letterSpacing: -0.6,
    color: C.accentFg,
  },
  heroNairaSign: {
    opacity: 0.7,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: C.accentFg,
    opacity: 0.8,
  },
  statValue: {
    marginTop: 2,
    fontFamily: F.mono,
    fontWeight: '800',
    fontSize: 18,
    color: C.accentFg,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: C.card,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.ink,
    padding: 0,
  },

  // Chips bar
  chipsBar: {
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 12,
  },
  chipsRow: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  chipLabelActive: {
    color: C.accentFg,
  },
  chipCount: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: F.mono,
    color: C.muted,
  },
  chipCountActive: {
    color: C.accentFg,
    opacity: 0.8,
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  planTile: {
    width: 44, height: 44,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  storeName: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.15,
    lineHeight: 18,
    color: C.ink,
  },
  storeId: {
    fontSize: 11,
    fontFamily: F.mono,
    fontWeight: '600',
    color: C.muted,
    marginTop: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  statusDot: {
    width: 5, height: 5, borderRadius: 3,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  // Meta panel
  metaPanel: {
    backgroundColor: 'rgba(0,0,0,0.025)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  metaRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.muted,
  },
  metaRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: R.pill,
  },
  planBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  metaPriceText: {
    fontFamily: F.mono,
    fontWeight: '700',
    fontSize: 12,
    color: C.muted,
  },
  metaDateText: {
    fontFamily: F.mono,
    fontWeight: '700',
    fontSize: 13,
    color: C.ink,
  },
  daysPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  daysPillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: F.mono,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionBtnPrimary: {
    backgroundColor: C.accent,
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(225,29,107,0.30)',
  },
  actionBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },

  // Empty + loading
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconTile: {
    width: 56, height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  emptySub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 4,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sheet
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,14,16,0.55)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingTop: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -20 },
        shadowOpacity: 0.25,
        shadowRadius: 60,
      },
      android: { elevation: 24 },
    }),
  },
  grabberRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  grabber: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: C.ink,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: C.muted,
    marginTop: 3,
  },
  sheetClose: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetBody: {
    padding: 20,
    paddingBottom: 24,
    gap: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
    marginBottom: 6,
  },
  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: C.muted,
    marginTop: 18,
    marginBottom: 10,
  },
  input: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: C.ink,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Plan grid
  planGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  planOption: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    position: 'relative',
  },
  planCheckBadge: {
    position: 'absolute',
    top: 10, right: 10,
    width: 18, height: 18,
    borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  planName: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
  },
  planPrice: {
    marginTop: 4,
    fontFamily: F.mono,
    fontWeight: '800',
    fontSize: 16,
  },
  planPriceSub: {
    fontSize: 10,
    color: C.muted,
    marginTop: 1,
  },
  planFeaturesDivider: {
    marginTop: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderStyle: 'dashed',
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  planFeatureText: {
    fontSize: 11,
    color: C.muted,
  },

  // Duration
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    alignItems: 'center',
    gap: 2,
  },
  durationBtnActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  durationNumber: {
    fontFamily: F.mono,
    fontWeight: '800',
    fontSize: 15,
    color: C.ink,
  },
  durationWord: {
    fontSize: 10,
    color: C.ink,
    opacity: 0.75,
  },

  // Summary
  summary: {
    marginTop: 18,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  summaryEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  summaryTotal: {
    fontFamily: F.mono,
    fontWeight: '800',
    fontSize: 26,
    letterSpacing: -0.4,
    color: C.ink,
  },
  summaryNairaSign: {
    opacity: 0.55,
  },
  summaryCaption: {
    fontSize: 11,
    color: C.muted,
    fontFamily: F.mono,
  },

  // Sheet footer
  sheetFooter: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnLabel: {
    color: C.ink,
    fontWeight: '700',
    fontSize: 14,
  },
  submitBtnWrap: {
    flex: 1.8,
    borderRadius: 14,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
      },
      android: { elevation: 6 },
    }),
  },
  submitBtnWrapDisabled: {
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  submitBtnDisabled: {
    backgroundColor: C.border,
  },
  submitBtnLabel: {
    color: C.accentFg,
    fontWeight: '700',
    fontSize: 14,
  },
});
