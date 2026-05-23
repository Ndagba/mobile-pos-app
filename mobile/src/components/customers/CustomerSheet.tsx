import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '../../theme';
import ApiClient from '../../services/ApiClient';
import { Customer } from './CustomerRow';

interface CustomerSheetProps {
  visible: boolean;
  customer: Customer | null;
  onClose: () => void;
  onNewSale?: (customer: Customer) => void;
  onHistory?: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
  canEdit?: boolean;
}

export default function CustomerSheet({
  visible,
  customer,
  onClose,
  onNewSale,
  onHistory,
  onEdit,
  canEdit = true,
}: CustomerSheetProps) {
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    if (!visible || !customer?.id) {
      setTotalPaid(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: any = await ApiClient.get(`/customers/${customer.id}/payments`);
        const pays = Array.isArray(res) ? res : res?.data ?? [];
        const sum = pays.reduce((s: number, p: any) => {
          const amt = typeof p.amount === 'string' ? parseFloat(p.amount) : (p.amount || 0);
          return s + (amt || 0);
        }, 0);
        if (!cancelled) setTotalPaid(sum);
      } catch {
        if (!cancelled) setTotalPaid(0);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, customer?.id]);

  if (!customer) return null;

  const initials = `${customer.first_name?.[0] || ''}${customer.last_name?.[0] || ''}`.toUpperCase();
  const toneColor = customer.tone || '#6E56F7';
  const name = `${customer.first_name} ${customer.last_name}`.trim();
  const totalSpent = Number(customer.total_spent) || 0;
  const spendStr = `₦${totalSpent.toLocaleString()}`;
  const outstanding = Math.max(0, totalSpent - totalPaid);
  const outstandingStr = `₦${outstanding.toLocaleString()}`;

  const quickActions = [
    {
      key: 'sale',
      icon: 'cart-outline',
      label: 'New sale',
      onPress: () => {
        onNewSale?.(customer);
        onClose();
      },
    },
    {
      key: 'history',
      icon: 'cash',
      label: 'Pay',
      onPress: () => {
        onHistory?.(customer);
        onClose();
      },
    },
    ...(canEdit
      ? [{
          key: 'edit',
          icon: 'pencil',
          label: 'Edit',
          onPress: () => {
            onEdit?.(customer);
            onClose();
          },
        }]
      : []),
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet */}
      <View style={styles.sheetContainer}>
        <View style={styles.sheet}>
          {/* Grabber */}
          <View style={styles.grabber} />

          {/* Hero Card */}
          <LinearGradient
            colors={[toneColor, toneColor + '88']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Avatar + Name + Phone */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View
                style={[
                  styles.heroAvatar,
                  { borderColor: 'rgba(255,255,255,0.22)' },
                ]}
              >
                <Text style={styles.heroAvatarText}>{initials}</Text>
              </View>

              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={styles.heroName}>{name}</Text>
                <Text style={styles.heroPhone}>{customer.phone}</Text>
              </View>
            </View>

            {/* Stats */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroStatLabel}>LIFETIME</Text>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  {spendStr}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.heroStatLabel}>OUTSTANDING</Text>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  {outstandingStr}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.heroStatLabel}>VISITS</Text>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  {customer.transaction_count}
                </Text>
              </View>
            </View>
          </LinearGradient>

          {/* Quick Actions */}
          <View style={styles.actionsGrid}>
            {quickActions.map(action => (
              <TouchableOpacity
                key={action.key}
                style={styles.actionTile}
                onPress={action.onPress}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={action.icon as any}
                  size={18}
                  color={C.accent}
                />
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,14,16,0.55)',
  },
  sheetContainer: {
    height: Dimensions.get('window').height * 0.8,
  },
  sheet: {
    flex: 1,
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  heroCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.01,
  },
  heroPhone: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: 'JetBrains Mono',
    marginTop: 2,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.08,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'JetBrains Mono',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionTile: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
    textAlign: 'center',
  },
  closeButton: {
    borderWidth: 1,
    borderColor: C.muted,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
});
