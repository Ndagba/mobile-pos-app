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
import { Supplier } from './SupplierRow';

interface SupplierSheetProps {
  visible: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onLedger?: (supplier: Supplier) => void;
  onEdit?: (supplier: Supplier) => void;
  onNewInvoice?: (supplier: Supplier) => void;
  onDelete?: (supplier: Supplier) => void;
  canEdit?: boolean;
}

export default function SupplierSheet({
  visible,
  supplier,
  onClose,
  onLedger,
  onEdit,
  onNewInvoice,
  onDelete,
  canEdit = true,
}: SupplierSheetProps) {

  const [invoicedTotal, setInvoicedTotal] = useState(0);
  const [paidTotal, setPaidTotal] = useState(0);

  useEffect(() => {
    if (!visible || !supplier?.id) {
      setInvoicedTotal(0);
      setPaidTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [invRes, payRes]: [any, any] = await Promise.all([
          ApiClient.get(`/suppliers/${supplier.id}/invoices`),
          ApiClient.get(`/suppliers/${supplier.id}/payments`),
        ]);
        const invoices = Array.isArray(invRes) ? invRes : invRes?.data ?? [];
        const payments = Array.isArray(payRes) ? payRes : payRes?.data ?? [];

        const inv = invoices.reduce((s: number, i: any) => s + (parseFloat(i.amount) || 0), 0);
        const pay = payments.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);
        if (!cancelled) {
          setInvoicedTotal(inv);
          setPaidTotal(pay);
        }
      } catch {
        if (!cancelled) {
          setInvoicedTotal(0);
          setPaidTotal(0);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, supplier?.id]);

  if (!supplier) return null;

  const toneColor = supplier.tone || '#7C3AED';
  const initials = supplier.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

  const outstanding = Math.max(0, invoicedTotal - paidTotal);

  const quickActions = [
    {
      key: 'ledger',
      icon: 'book-open-outline',
      label: 'Ledger',
      onPress: () => { onLedger?.(supplier); onClose(); },
    },
    {
      key: 'invoice',
      icon: 'receipt',
      label: 'Invoice',
      onPress: () => { onNewInvoice?.(supplier); onClose(); },
    },
    ...(canEdit ? [
      {
        key: 'edit',
        icon: 'pencil',
        label: 'Edit',
        onPress: () => { onEdit?.(supplier); onClose(); },
      },
      {
        key: 'delete',
        icon: 'trash-can-outline',
        label: 'Delete',
        onPress: () => { onDelete?.(supplier); onClose(); },
      }
    ] : []),
  ];


  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

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
            {/* Icon + Name + Category */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <View style={styles.heroAvatar}>
                <MaterialCommunityIcons name="truck-outline" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={styles.heroName} numberOfLines={1}>{supplier.name}</Text>
                <Text style={styles.heroSub}>
                  {supplier.category || supplier.phone || supplier.email || '—'}
                </Text>
              </View>
            </View>

            {/* Stats */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroStatLabel}>INVOICED</Text>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  ₦{invoicedTotal.toLocaleString()}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.heroStatLabel}>PAID</Text>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  ₦{paidTotal.toLocaleString()}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.heroStatLabel}>OWING</Text>
                <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
                  ₦{outstanding.toLocaleString()}
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
                <MaterialCommunityIcons name={action.icon as any} size={18} color={toneColor} />
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
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
    height: Dimensions.get('window').height * 0.75,
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
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.01,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
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
