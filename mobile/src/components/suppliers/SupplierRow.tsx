import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '../../theme';

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  category?: string;
  tag?: 'Preferred' | 'Blocked' | null;
  tone?: string;
  // runtime-computed outstanding balance
  outstanding?: number;
}

interface SupplierRowProps {
  supplier: Supplier;
  onPress: (supplier: Supplier) => void;
  isLast?: boolean;
}

export default function SupplierRow({ supplier, onPress, isLast }: SupplierRowProps) {
  const initials = supplier.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

  const toneColor = supplier.tone || '#7C3AED';
  const outstanding = supplier.outstanding ?? 0;
  const outstandingStr = `₦${Math.max(0, outstanding).toLocaleString()}`;

  const tagColor =
    supplier.tag === 'Preferred' ? '#10B981' :
    supplier.tag === 'Blocked' ? '#EF4444' : null;

  return (
    <TouchableOpacity
      style={[
        styles.row,
        { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: C.border },
      ]}
      onPress={() => onPress(supplier)}
      activeOpacity={0.6}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: toneColor + '20' }]}>
        <MaterialCommunityIcons name="truck-outline" size={18} color={toneColor} />
      </View>

      {/* Middle: Name + Category */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Text style={styles.supplierName} numberOfLines={1}>
            {supplier.name}
          </Text>
          {tagColor && (
            <View style={[styles.tagPill, { backgroundColor: tagColor + '20', borderColor: tagColor + '40' }]}>
              <Text style={[styles.tagPillText, { color: tagColor }]}>{supplier.tag}</Text>
            </View>
          )}
        </View>
        <Text style={styles.category} numberOfLines={1}>
          {supplier.category || supplier.phone || supplier.email || '—'}
        </Text>
      </View>

      {/* Right: Outstanding */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.outstanding, outstanding > 0 && styles.outstandingPositive]}>
          {outstandingStr}
        </Text>
        <Text style={styles.meta}>outstanding</Text>
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
  supplierName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  category: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '500',
    marginTop: 2,
  },
  outstanding: {
    fontSize: 13,
    fontWeight: '800',
    color: C.muted,
    fontFamily: 'JetBrains Mono',
  },
  outstandingPositive: {
    color: '#EF4444',
  },
  meta: {
    fontSize: 10,
    fontWeight: '500',
    color: C.muted,
    marginTop: 2,
  },
  tagPill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagPillText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.05,
  },
});
