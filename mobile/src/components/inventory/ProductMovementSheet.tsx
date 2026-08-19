import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Portal } from 'react-native-paper';
import ApiClient from '../../services/ApiClient';
import { C } from '../../theme';
import dayjs from 'dayjs';

interface InventoryMovement {
  id: string;
  movement_type: 'sale' | 'return' | 'purchase' | 'adjustment' | 'transfer';
  quantity: number;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  user?: { first_name: string; last_name: string };
}

interface ProductMovementSheetProps {
  visible: boolean;
  onClose: () => void;
  productId: string | null;
  productName: string | null;
}

export default function ProductMovementSheet({ visible, onClose, productId, productName }: ProductMovementSheetProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMovements = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const res: any = await ApiClient.get('/inventory/movements', {
        params: { product_id: productId, limit: 50 }
      });
      setMovements(Array.isArray(res) ? res : (res?.data ?? []));
    } catch (e) {
      console.error('Failed to load movements:', e);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (visible && productId) {
      loadMovements();
    } else {
      setMovements([]);
    }
  }, [visible, productId, loadMovements]);

  const renderMovement = ({ item }: { item: InventoryMovement }) => {
    let icon = 'package';
    let color: string = C.ink;
    const qty = Number(item.quantity);
    let qtyColor = qty > 0 ? C.green : C.rose;
    let qtyPrefix = qty > 0 ? '+' : '';

    switch (item.movement_type) {
      case 'sale': icon = 'cart-outline'; color = C.rose; break;
      case 'return': icon = 'keyboard-return'; color = C.green; break;
      case 'purchase': icon = 'truck-outline'; color = C.green; break;
      case 'adjustment': icon = 'scale-balance'; color = C.amber; break;
      case 'transfer': icon = 'swap-horizontal'; color = C.amber; break;
    }

    return (
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
          <MaterialCommunityIcons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.body}>
          <Text style={styles.typeText}>{item.movement_type.toUpperCase()}</Text>
          <Text style={styles.timeText}>{dayjs(item.created_at).format('MMM D, YYYY hh:mm A')}</Text>
          {item.notes && <Text style={styles.notesText}>{item.notes}</Text>}
          {item.reference_id && <Text style={styles.refText}>Ref: {item.reference_id.substring(0, 8)}</Text>}
        </View>
        <View style={styles.qtyBox}>
          <Text style={[styles.qtyText, { color: qtyColor }]}>{qtyPrefix}{qty}</Text>
          <Text style={styles.userText}>{item.user?.first_name || 'System'}</Text>
        </View>
      </View>
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.modalContent}
        style={styles.modal}
      >
        <View style={styles.handleBar} />
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Inventory Ledger</Text>
            <Text style={styles.subtitle}>{productName}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close" size={24} color={C.ink} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
        ) : (
          <FlatList
            data={movements}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.listContent}
            renderItem={renderMovement}
            ListEmptyComponent={<Text style={styles.emptyText}>No inventory movements found.</Text>}
          />
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'flex-end', margin: 0 },
  modalContent: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    maxHeight: '90%',
    paddingBottom: 24
  },
  handleBar: {
    width: 40, height: 4, backgroundColor: C.border,
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border
  },
  title: { fontSize: 20, fontWeight: '800', color: C.ink },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 2 },
  listContent: { padding: 20 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border
  },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  body: { flex: 1 },
  typeText: { fontSize: 14, fontWeight: '700', color: C.ink },
  timeText: { fontSize: 12, color: C.muted, marginTop: 2 },
  notesText: { fontSize: 13, color: C.ink, marginTop: 4, fontStyle: 'italic' },
  refText: { fontSize: 11, color: C.muted, marginTop: 4 },
  qtyBox: { alignItems: 'flex-end', marginLeft: 12 },
  qtyText: { fontSize: 18, fontWeight: '800' },
  userText: { fontSize: 11, color: C.muted, marginTop: 4 },
  emptyText: { textAlign: 'center', color: C.muted, marginTop: 40 }
});
