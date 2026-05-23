import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C } from '../../theme';
import TagPill from './TagPill';

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  total_spent: number;
  transaction_count: number;
  last_transaction_at?: string | null;
  tag?: 'VIP' | 'New' | null;
  tone?: string;
}

interface CustomerRowProps {
  customer: Customer;
  onPress: (customer: Customer) => void;
  isLast?: boolean;
}

export default function CustomerRow({
  customer,
  onPress,
  isLast,
}: CustomerRowProps) {
  const initials = `${customer.first_name?.[0] || ''}${customer.last_name?.[0] || ''}`.toUpperCase();
  const toneColor = customer.tone || '#6E56F7';
  const lastText = customer.last_transaction_at ? 'Today' : '—';
  const spendStr = `₦${(Number(customer.total_spent) || 0).toLocaleString()}`;

  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: C.border,
        },
      ]}
      onPress={() => onPress(customer)}
      activeOpacity={0.6}
    >
      {/* Avatar */}
      <View
        style={[
          styles.avatar,
          { backgroundColor: toneColor + '20' },
        ]}
      >
        <Text style={[styles.avatarText, { color: toneColor }]}>
          {initials}
        </Text>
      </View>

      {/* Middle: Name + Phone */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Text style={styles.customerName} numberOfLines={1}>
            {`${customer.first_name} ${customer.last_name}`.trim()}
          </Text>
          {customer.tag && <TagPill kind={customer.tag} />}
        </View>
        <Text style={styles.phone}>{customer.phone}</Text>
      </View>

      {/* Right: Spend + Meta */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.spend}>{spendStr}</Text>
        <Text style={styles.meta}>
          {customer.transaction_count} txns · {lastText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  phone: {
    fontSize: 11,
    color: C.muted,
    fontFamily: 'JetBrains Mono',
    fontWeight: '500',
    marginTop: 2,
  },
  spend: {
    fontSize: 13,
    fontWeight: '800',
    color: C.ink,
    fontFamily: 'JetBrains Mono',
  },
  meta: {
    fontSize: 10,
    fontWeight: '500',
    color: C.muted,
    marginTop: 2,
  },
});
