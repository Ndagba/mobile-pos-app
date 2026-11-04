import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, Alert, Modal,
  TouchableOpacity, KeyboardAvoidingView, Platform, TextInput as RNTextInput,
} from 'react-native';
import {
  Button, TextInput, Portal, Dialog, Divider, ActivityIndicator,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import ApiClient from '../services/ApiClient';
import { C, naira } from '../theme';

// ─── Types ────────────────────────────────────────────────────
type Segment = 'record' | 'categories' | 'reports';
type Period = 'today' | 'week' | 'month';

interface Branch { id: string; name: string; is_active: boolean; }
interface ExpenseCategory { id: string; name: string; description?: string | null; branch_id?: string; }
interface Expense {
  id: string;
  amount: number | string;
  description?: string | null;
  // NOTE: the Expense model is camelCase (unlike most of this codebase).
  expenseDate: string;
  paymentMethod: string;
  status?: string;
  category_id?: string | null;
  category?: { name: string } | null;
  createdBy?: string | null;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
] as const;

const EMPTY_CATEGORY = { name: '', description: '' };

// Fixed palette assigned to categories in load order (for the summary bar/legend).
const CAT_COLORS = ['#6E56F7', '#F59E0B', '#2563EB', '#10B981', '#EC4899', '#8B5CF6', '#14B8A6', '#E11D6B'];

// ── Date windows ──────────────────────────────────────────────
// Reports period → ISO [from, to]. Mirrors AnalyticsScreen.getPeriodDates.
const getPeriodDates = (period: Period) => {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  if (period === 'today') from.setHours(0, 0, 0, 0);
  else if (period === 'week') { from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); }
  else { from.setDate(1); from.setHours(0, 0, 0, 0); } // month → 1st of this month
  return { from: from.toISOString(), to: to.toISOString() };
};

// Current calendar month window.
const monthWindow = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
};

const fmtDay = (s: string): string => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const payLabel = (m?: string) => (m ? m.charAt(0).toUpperCase() + m.slice(1) : '—');

// ─── Screen ───────────────────────────────────────────────────
export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const isAdmin = user?.role === 'admin';

  const [segment, setSegment] = useState<Segment>('record');
  const [loading, setLoading] = useState(false);

  // Branch scoping (every expenses call requires a branchId).
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const selectedBranchRef = useRef<string | null>(null);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Record form
  const [recordForm, setRecordForm] = useState({
    category_id: '', amount: '', description: '', paymentMethod: 'cash' as string,
  });
  const [recordCatFilter, setRecordCatFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  // Category form dialog
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);

  // Reports filters (client-side over the loaded period set)
  const [reportsPeriod, setReportsPeriod] = useState<Period>('month');
  const [reportsCatId, setReportsCatId] = useState<string>('all');
  const [reportsPayMethod, setReportsPayMethod] = useState<string>('all');
  const [reportsSearch, setReportsSearch] = useState('');

  const apiError = (e: any, fallback = 'Operation failed') =>
    e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;

  // ── Loaders ─────────────────────────────────────────────────
  const loadBranches = async () => {
    try {
      const res: any = await ApiClient.get('/branches');
      const list: Branch[] = (Array.isArray(res) ? res : res?.data ?? []).filter((b: Branch) => b.is_active);
      setBranches(list);
      // Default to the user's home branch, else the only branch.
      let def = selectedBranchRef.current;
      if (!def) def = user?.branch_id ?? (list.length === 1 ? list[0].id : null);
      selectedBranchRef.current = def;
      setSelectedBranchId(def);
    } catch {}
  };

  const loadCategories = async (branchId?: string | null) => {
    if (!branchId) { setCategories([]); return; }
    try {
      const res: any = await ApiClient.get(`/expenses/categories?branchId=${encodeURIComponent(branchId)}`);
      setCategories(Array.isArray(res) ? res : res?.data ?? []);
    } catch {}
  };

  const loadExpenses = async (branchId?: string | null, seg: Segment = segment, period: Period = reportsPeriod) => {
    if (!branchId) { setExpenses([]); return; }
    const win = seg === 'reports' ? getPeriodDates(period) : monthWindow();
    try {
      const params = `branchId=${encodeURIComponent(branchId)}&startDate=${encodeURIComponent(win.from)}&endDate=${encodeURIComponent(win.to)}`;
      const res: any = await ApiClient.get(`/expenses?${params}`);
      setExpenses(Array.isArray(res) ? res : res?.data ?? []);
    } catch {}
  };

  const reloadAll = async (branchId: string | null = selectedBranchRef.current) => {
    setLoading(true);
    await Promise.all([loadCategories(branchId), loadExpenses(branchId)]);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      await loadBranches();
      await Promise.all([loadCategories(selectedBranchRef.current), loadExpenses(selectedBranchRef.current)]);
      setLoading(false);
    })();
  }, [isAdmin]));

  // Reload the expense window whenever the segment or reports period changes.
  const refetchExpenses = (seg: Segment, period: Period) => {
    loadExpenses(selectedBranchRef.current, seg, period);
  };

  const handleBranchSelect = (branchId: string) => {
    selectedBranchRef.current = branchId;
    setSelectedBranchId(branchId);
    reloadAll(branchId);
  };

  const handleSegment = (seg: Segment) => {
    setSegment(seg);
    refetchExpenses(seg, reportsPeriod);
  };

  const handleReportsPeriod = (p: Period) => {
    setReportsPeriod(p);
    refetchExpenses('reports', p);
  };

  // ── Record ──────────────────────────────────────────────────
  const monthTotalAndLegend = useMemo(() => {
    const byCat = new Map<string, number>();
    let total = 0;
    for (const e of expenses) {
      const amt = Number(e.amount) || 0;
      total += amt;
      const name = e.category?.name ?? 'Uncategorised';
      byCat.set(name, (byCat.get(name) ?? 0) + amt);
    }
    const legend = [...byCat.entries()]
      .map(([name, amount]) => ({ name, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
    return { total, legend };
  }, [expenses]);

  const colorFor = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c, i) => map.set(c.name, CAT_COLORS[i % CAT_COLORS.length]));
    return (name: string) => map.get(name) ?? '#94A3B8';
  }, [categories]);

  const recordVisible = useMemo(
    () => (recordCatFilter === 'all' ? expenses : expenses.filter(e => e.category_id === recordCatFilter)),
    [expenses, recordCatFilter]
  );

  const handleSaveExpense = async () => {
    const amountNum = Number(recordForm.amount);
    if (!recordForm.category_id) { Alert.alert('Validation', 'Pick a category'); return; }
    if (!amountNum || amountNum <= 0 || isNaN(amountNum)) { Alert.alert('Validation', 'Enter a valid amount'); return; }
    if (!selectedBranchRef.current) { Alert.alert('Branch Required', 'Select a branch first'); return; }
    setSaving(true);
    try {
      await ApiClient.post('/expenses', {
        category_id: recordForm.category_id,
        amount: amountNum,
        description: recordForm.description.trim() || undefined,
        expenseDate: new Date().toISOString().split('T')[0],
        paymentMethod: recordForm.paymentMethod,
        branch_id: selectedBranchRef.current,
        createdBy: user?.id,
      });
      setRecordForm({ category_id: '', amount: '', description: '', paymentMethod: 'cash' });
      Alert.alert('Recorded', 'Expense saved');
      loadExpenses(selectedBranchRef.current, 'record');
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Could not record the expense.'));
    } finally { setSaving(false); }
  };

  // ── Categories ──────────────────────────────────────────────
  const openNewCategory = () => {
    if (!selectedBranchRef.current) { Alert.alert('Branch Required', 'Select a branch first'); return; }
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY);
    setShowCategoryForm(true);
  };
  const openEditCategory = (cat: ExpenseCategory) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, description: cat.description ?? '' });
    setShowCategoryForm(true);
  };
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { Alert.alert('Validation', 'Name is required'); return; }
    setSaving(true);
    try {
      if (editingCategory) {
        await ApiClient.patch(`/expenses/categories/${editingCategory.id}`, {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || undefined,
        });
      } else {
        await ApiClient.post('/expenses/categories', {
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || undefined,
          branch_id: selectedBranchRef.current,
        });
      }
      setShowCategoryForm(false);
      loadCategories(selectedBranchRef.current);
    } catch (e: any) {
      Alert.alert('Error', apiError(e, 'Could not save the category.'));
    } finally { setSaving(false); }
  };
  const handleDeleteCategory = (cat: ExpenseCategory) => {
    Alert.alert('Delete Category', `Delete "${cat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await (ApiClient as any).delete(`/expenses/categories/${cat.id}`);
            loadCategories(selectedBranchRef.current);
          } catch (e: any) {
            // Backend returns 400 when expense records still reference the category.
            Alert.alert('Cannot delete', apiError(e, 'Could not delete the category.'));
          }
        },
      },
    ]);
  };

  // ── Reports ─────────────────────────────────────────────────
  const reportsVisible = useMemo(() => {
    const q = reportsSearch.trim().toLowerCase();
    return expenses.filter(e => {
      if (reportsCatId !== 'all' && e.category_id !== reportsCatId) return false;
      if (reportsPayMethod !== 'all' && e.paymentMethod !== reportsPayMethod) return false;
      if (q && !(e.description ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, reportsCatId, reportsPayMethod, reportsSearch]);

  const reportsTotal = useMemo(
    () => reportsVisible.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [reportsVisible]
  );

  // ── Admin-only guard ────────────────────────────────────────
  if (!isAdmin) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons name="lock-outline" size={48} color={C.border} />
        <Text style={styles.gatedText}>Expenses are available to admins only.</Text>
      </View>
    );
  }

  const multiBranch = branches.length > 1;

  // ── Render ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>Financials</Text>
        <Text style={styles.headerTitle}>Expenses</Text>
      </View>

      {/* Segment bar */}
      <View style={styles.segmentBar}>
        {(['record', 'categories', 'reports'] as Segment[]).map(seg => {
          const labels: Record<Segment, string> = { record: 'Record', categories: 'Categories', reports: 'Reports' };
          const active = segment === seg;
          return (
            <TouchableOpacity
              key={seg}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => handleSegment(seg)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{labels[seg]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Branch chips (multi-branch admins) */}
      {multiBranch && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.branchBar} contentContainerStyle={styles.branchBarContent}>
          {branches.map(b => (
            <TouchableOpacity
              key={b.id}
              style={[styles.branchChip, selectedBranchId === b.id && styles.branchChipActive]}
              onPress={() => handleBranchSelect(b.id)}
            >
              <Text style={[styles.branchChipText, selectedBranchId === b.id && styles.branchChipTextActive]}>
                {b.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading && expenses.length === 0 && categories.length === 0 ? (
        <View style={styles.center}><ActivityIndicator size={28} color={C.accent} /></View>
      ) : segment === 'record' ? (
        renderRecord()
      ) : segment === 'categories' ? (
        renderCategories()
      ) : (
        renderReports()
      )}

      {/* Category form dialog */}
      <Portal>
        <Dialog visible={showCategoryForm} onDismiss={() => setShowCategoryForm(false)}>
          <Dialog.Title>{editingCategory ? 'Edit Category' : 'New Category'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Name *" value={categoryForm.name}
              onChangeText={v => setCategoryForm(f => ({ ...f, name: v }))}
              mode="outlined" style={styles.input} autoFocus />
            <TextInput label="Description (optional)" value={categoryForm.description}
              onChangeText={v => setCategoryForm(f => ({ ...f, description: v }))}
              mode="outlined" style={styles.input} multiline numberOfLines={2} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCategoryForm(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveCategory} loading={saving} disabled={saving}>
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );

  // ── Segment renderers (closures over state) ─────────────────
  function renderRecord() {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {/* Month summary */}
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <View>
                <Text style={styles.cardEyebrow}>This month</Text>
                <Text style={styles.cardBig}>{naira(monthTotalAndLegend.total)}</Text>
              </View>
              <Text style={styles.muted}>{expenses.length} expense(s)</Text>
            </View>
            {monthTotalAndLegend.total > 0 && (
              <>
                <View style={styles.breakdownBar}>
                  {monthTotalAndLegend.legend.map(c => (
                    <View key={c.name} style={{ width: `${c.pct}%` as any, backgroundColor: colorFor(c.name) }} />
                  ))}
                </View>
                <View style={styles.legendWrap}>
                  {monthTotalAndLegend.legend.map(c => (
                    <View key={c.name} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colorFor(c.name) }]} />
                      <Text style={styles.legendName}>{c.name}</Text>
                      <Text style={styles.legendAmt}>{naira(c.amount)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          {/* Record form */}
          <View style={[styles.card, { marginTop: 14 }]}>
            <Text style={styles.cardTitle}>Record expense</Text>
            <TextInput label="Description" value={recordForm.description}
              onChangeText={v => setRecordForm(f => ({ ...f, description: v }))}
              mode="outlined" style={styles.input} placeholder="What was this for?" />
            <TextInput label="Amount (₦) *" value={recordForm.amount}
              onChangeText={v => setRecordForm(f => ({ ...f, amount: v }))}
              mode="outlined" keyboardType="decimal-pad" style={styles.input}
              left={<TextInput.Affix text="₦" />} />

            <Text style={styles.fieldLabel}>Category *</Text>
            {categories.length === 0 ? (
              <Text style={styles.muted}>No categories yet — add one under the Categories tab.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {categories.map(c => {
                  const active = recordForm.category_id === c.id;
                  return (
                    <TouchableOpacity key={c.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setRecordForm(f => ({ ...f, category_id: c.id }))}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={styles.fieldLabel}>Paid by</Text>
            <View style={styles.chipWrap}>
              {PAYMENT_METHODS.map(m => {
                const active = recordForm.paymentMethod === m.value;
                return (
                  <TouchableOpacity key={m.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setRecordForm(f => ({ ...f, paymentMethod: m.value }))}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Button mode="contained" onPress={handleSaveExpense} loading={saving} disabled={saving}
              style={{ marginTop: 14 }}>
              Save expense
            </Button>
          </View>

          {/* Month list */}
          <View style={[styles.card, { marginTop: 14, padding: 0 }]}>
            <View style={styles.chipBarRow}>
              <TouchableOpacity style={[styles.chip, recordCatFilter === 'all' && styles.chipActive]}
                onPress={() => setRecordCatFilter('all')}>
                <Text style={[styles.chipText, recordCatFilter === 'all' && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {categories.map(c => (
                <TouchableOpacity key={c.id} style={[styles.chip, recordCatFilter === c.id && styles.chipActive]}
                  onPress={() => setRecordCatFilter(c.id)}>
                  <Text style={[styles.chipText, recordCatFilter === c.id && styles.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {recordVisible.length === 0 ? (
              <Text style={[styles.muted, { padding: 20, textAlign: 'center' }]}>No expenses this month.</Text>
            ) : (
              recordVisible.map(e => <ExpenseRow key={e.id} e={e} colorFor={colorFor} />)
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  function renderCategories() {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.actionRow}>
          <Button mode="contained" icon="plus" onPress={openNewCategory}>New category</Button>
        </View>
        <FlatList
          data={categories}
          keyExtractor={c => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={<Text style={[styles.muted, { padding: 24, textAlign: 'center' }]}>No categories yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                {!!item.description && <Text style={styles.muted} numberOfLines={1}>{item.description}</Text>}
              </View>
              <TouchableOpacity style={styles.iconBtn} onPress={() => openEditCategory(item)} hitSlop={hit}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={C.muted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteCategory(item)} hitSlop={hit}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={C.red} />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    );
  }

  function renderReports() {
    return (
      <View style={{ flex: 1 }}>
        {/* Period chips */}
        <View style={styles.chipBarRow}>
          {(['today', 'week', 'month'] as Period[]).map(p => {
            const labels: Record<Period, string> = { today: 'Today', week: 'This week', month: 'This month' };
            const active = reportsPeriod === p;
            return (
              <TouchableOpacity key={p} style={[styles.chip, active && styles.chipActive]}
                onPress={() => handleReportsPeriod(p)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{labels[p]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color={C.muted} />
          <RNTextInput
            value={reportsSearch}
            onChangeText={setReportsSearch}
            placeholder="Search description…"
            placeholderTextColor={C.muted}
            style={styles.searchInput}
          />
          {reportsSearch.length > 0 && (
            <TouchableOpacity onPress={() => setReportsSearch('')} hitSlop={hit}>
              <MaterialCommunityIcons name="close-circle" size={17} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.filterScroll} contentContainerStyle={styles.chipBarRowInline}>
          <TouchableOpacity style={[styles.chip, reportsCatId === 'all' && styles.chipActive]}
            onPress={() => setReportsCatId('all')}>
            <Text style={[styles.chipText, reportsCatId === 'all' && styles.chipTextActive]}>All categories</Text>
          </TouchableOpacity>
          {categories.map(c => (
            <TouchableOpacity key={c.id} style={[styles.chip, reportsCatId === c.id && styles.chipActive]}
              onPress={() => setReportsCatId(c.id)}>
              <Text style={[styles.chipText, reportsCatId === c.id && styles.chipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Payment filter */}
        <View style={styles.chipBarRow}>
          <TouchableOpacity style={[styles.chip, reportsPayMethod === 'all' && styles.chipActive]}
            onPress={() => setReportsPayMethod('all')}>
            <Text style={[styles.chipText, reportsPayMethod === 'all' && styles.chipTextActive]}>All methods</Text>
          </TouchableOpacity>
          {PAYMENT_METHODS.map(m => (
            <TouchableOpacity key={m.value} style={[styles.chip, reportsPayMethod === m.value && styles.chipActive]}
              onPress={() => setReportsPayMethod(m.value)}>
              <Text style={[styles.chipText, reportsPayMethod === m.value && styles.chipTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Total */}
        <View style={[styles.card, { marginHorizontal: 16 }]}>
          <Text style={styles.cardEyebrow}>Total expenditure</Text>
          <Text style={styles.cardBig}>{naira(reportsTotal)}</Text>
        </View>

        <FlatList
          data={reportsVisible}
          keyExtractor={e => e.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}
          ListEmptyComponent={<Text style={[styles.muted, { padding: 24, textAlign: 'center' }]}>No expense records found.</Text>}
          renderItem={({ item }) => <ExpenseRow e={item} colorFor={colorFor} />}
        />
      </View>
    );
  }
}

const hit = { top: 6, bottom: 6, left: 6, right: 6 };

// A single expense line: date · description · category dot · payment · amount.
function ExpenseRow({ e, colorFor }: { e: Expense; colorFor: (name: string) => string }) {
  const catName = e.category?.name ?? '—';
  return (
    <View style={styles.expRow}>
      <Text style={styles.expDate}>{fmtDay(e.expenseDate)}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{e.description || '—'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <View style={[styles.legendDot, { backgroundColor: colorFor(catName) }]} />
          <Text style={styles.muted} numberOfLines={1}>{catName}</Text>
          <Text style={styles.muted}>· {payLabel(e.paymentMethod)}</Text>
        </View>
      </View>
      <Text style={styles.expAmt}>{naira(Number(e.amount) || 0)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  gatedText: { color: C.muted, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerSub: { fontSize: 13, color: C.muted, fontWeight: '500' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },

  segmentBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  segmentActive: { backgroundColor: C.accent, borderColor: C.accent },
  segmentText: { fontSize: 13, fontWeight: '600', color: C.muted },
  segmentTextActive: { color: C.accentFg },

  branchBar: { maxHeight: 44, flexGrow: 0 },
  branchBarContent: { paddingHorizontal: 16, paddingVertical: 4, gap: 8 },
  branchChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  branchChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  branchChipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  branchChipTextActive: { color: C.accentFg },

  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  cardEyebrow: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardBig: { fontSize: 24, fontWeight: '800', color: C.ink, marginTop: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 8 },

  breakdownBar: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', backgroundColor: C.border, marginTop: 14 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendName: { fontSize: 12, color: C.ink },
  legendAmt: { fontSize: 12, fontWeight: '700', color: C.ink },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { marginBottom: 10, backgroundColor: C.card },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.violetBg, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.muted },
  chipTextActive: { color: C.accent },

  chipBarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chipBarRowInline: { gap: 8, paddingHorizontal: 16, paddingVertical: 2 },
  filterScroll: { maxHeight: 48, flexGrow: 0 },

  actionRow: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-start' },

  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  iconBtn: { padding: 6 },
  muted: { fontSize: 12, color: C.muted },

  expRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  expDate: { width: 48, fontSize: 12, color: C.muted },
  expAmt: { fontSize: 15, fontWeight: '700', color: C.ink },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, height: 42, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontSize: 14, color: C.ink, padding: 0 },
});
