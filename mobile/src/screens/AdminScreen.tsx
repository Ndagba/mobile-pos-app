import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { C } from '../theme';

interface AdminMenuItemProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description: string;
  onPress: () => void;
  color?: string;
}

function AdminMenuItem({ icon, title, description, onPress, color = C.accent }: AdminMenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
        <MaterialCommunityIcons name={icon} size={24} color={color} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={C.muted} />
    </TouchableOpacity>
  );
}

export default function AdminScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const isAdmin = user?.role === 'admin';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Management</Text>
        <Text style={styles.title}>Admin & Audit</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Inventory Management</Text>
        <AdminMenuItem
          icon="clipboard-check-outline"
          title="Stock Counts"
          description="Perform physical inventory audits and reconcile variances"
          color="#10B981"
          onPress={() => navigation.navigate('StockCounts')}
        />
        <AdminMenuItem
          icon="calendar-clock"
          title="Batches & Expiry"
          description="See batches expiring soon or expired, and add new batches"
          color="#F59E0B"
          onPress={() => navigation.navigate('Batches')}
        />
        <AdminMenuItem
          icon="rotate-3d-variant"
          title="Inventory Turnover"
          description="Units sold and turnover ratio per product over a period"
          color="#0EA5E9"
          onPress={() => navigation.navigate('InventoryTurnover')}
        />
        
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Shift Management</Text>
        <AdminMenuItem
          icon="cash-register"
          title="Cash Shifts"
          description="Manage register shifts, cash floats, and discrepancies"
          color="#F59E0B"
          onPress={() => navigation.navigate('CashShifts')}
        />
        
        {isAdmin && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Financials</Text>
            <AdminMenuItem
              icon="cash-multiple"
              title="Expenses"
              description="Record running costs, manage categories, and review spending"
              color="#E11D6B"
              onPress={() => navigation.navigate('Expenses')}
            />
          </>
        )}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Reports & Logs</Text>
        <AdminMenuItem
          icon="chart-line"
          title="Profit & Loss"
          description="Revenue, cost of goods, operating expenses and net profit by branch"
          color="#6E56F7"
          onPress={() => navigation.navigate('ProfitLoss')}
        />
        <AdminMenuItem
          icon="file-document-outline"
          title="End of Day (EOD) Reports"
          description="Generate daily sales, tax, and tender summaries"
          color="#3B82F6"
          onPress={() => navigation.navigate('EODReports')}
        />
        <AdminMenuItem
          icon="shield-search"
          title="Audit Logs"
          description="View security events and critical action history"
          color="#8B5CF6"
          onPress={() => navigation.navigate('AuditLogs')}
        />

        <Text style={styles.sectionTitle}>Store</Text>
        <AdminMenuItem
          icon="glass-mug-variant"
          title="Bar / Lounge setup"
          description="Business mode, bar settings, commission and cashier bar profiles"
          color="#F59E0B"
          onPress={() => navigation.navigate('BarSetup')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 16 },
  eyebrow: { fontSize: 13, fontWeight: '500', color: C.muted, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: { flex: 1, marginRight: 16 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 4 },
  itemDescription: { fontSize: 13, color: C.muted, lineHeight: 18 },
});
