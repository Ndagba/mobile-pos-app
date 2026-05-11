import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, Button, Card, TextInput, FAB } from 'react-native-paper';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { addItem, removeItem, setPaymentMethod, clearCart } from '../redux/slices/cartSlice';
import { TransactionService, TransactionInput } from '../services/TransactionService';
import * as Device from 'expo-device';
import { setSyncMode, addToSyncQueue } from '../redux/slices/syncSlice';
import ApiClient from '../services/ApiClient';
import { v4 as uuidv4 } from 'uuid';

export default function CheckoutScreen() {
  const dispatch = useDispatch();
  const cart = useSelector((state: RootState) => state.cart);
  const auth = useSelector((state: RootState) => state.auth);
  const sync = useSelector((state: RootState) => state.sync);
  const [selectedPayment, setSelectedPayment] = useState<'cash' | 'card' | 'mobile_wallet' | null>(
    null
  );
  const [processing, setProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await ApiClient.get('/products?limit=50');
      setProducts(response.data || response);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const handleAddProduct = (product: any) => {
    dispatch(
      addItem({
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: product.effective_price,
        tax_amount: (product.effective_price * product.tax_rate) / 100,
        line_total: product.effective_price + (product.effective_price * product.tax_rate) / 100
      })
    );
  };

  const handleCompleteTransaction = async () => {
    try {
      if (!selectedPayment) {
        Alert.alert('Error', 'Please select a payment method');
        return;
      }

      if (cart.items.length === 0) {
        Alert.alert('Error', 'Cart is empty');
        return;
      }

      setProcessing(true);

      const transactionInput: TransactionInput = {
        store_id: auth.user?.store_id || 'store_001',
        user_id: auth.user?.id || 'user_123',
        items: cart.items,
        subtotal: cart.subtotal,
        tax_amount: cart.tax_amount,
        discount_amount: cart.discount_amount,
        total_amount: cart.total,
        payment_method: selectedPayment
      };

      const deviceId = Device.deviceId || (await SecureStore.getItemAsync('device_id')) || 'unknown';
      const isOnline = ApiClient.getOnlineStatus();

      const result = await TransactionService.createTransaction(
        transactionInput,
        deviceId,
        isOnline
      );

      if (result.success) {
        // Add to sync queue if offline
        if (!isOnline) {
          dispatch(
            addToSyncQueue({
              id: uuidv4(),
              transaction_id: result.transaction_id,
              offline_session_hash: `${deviceId}-${result.transaction_id}-${Date.now()}`,
              status: 'pending',
              created_at: new Date().toISOString()
            })
          );

          if (cart.items.length === 0) {
            dispatch(setSyncMode('OFFLINE'));
          }
        }

        Alert.alert('Success', `Transaction ${result.receipt_number || result.transaction_id} completed`);

        dispatch(clearCart());
        setSelectedPayment(null);
      }
    } catch (error) {
      console.error('Error completing transaction:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Transaction failed');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Product Search */}
      <TextInput
        placeholder="Search products..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchInput}
        left={<TextInput.Icon icon="magnify" />}
      />

      {/* Products List */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item }) => (
          <Card style={styles.productCard}>
            <Card.Content>
              <Text variant="bodySmall">{item.name}</Text>
              <Text variant="labelLarge">₹{item.effective_price}</Text>
              <Button
                mode="contained"
                size="small"
                onPress={() => handleAddProduct(item)}
                style={styles.addButton}
              >
                Add
              </Button>
            </Card.Content>
          </Card>
        )}
        scrollEnabled={false}
      />

      {/* Cart Summary */}
      <View style={styles.cartSummary}>
        <Text variant="titleMedium">Cart ({cart.items.length} items)</Text>
        <Text>Subtotal: ₹{cart.subtotal.toFixed(2)}</Text>
        <Text>Tax: ₹{cart.tax_amount.toFixed(2)}</Text>
        <Text variant="titleLarge">Total: ₹{cart.total.toFixed(2)}</Text>

        {/* Payment Methods */}
        <View style={styles.paymentMethods}>
          <Button
            mode={selectedPayment === 'cash' ? 'contained' : 'outlined'}
            onPress={() => setSelectedPayment('cash')}
          >
            Cash
          </Button>
          <Button
            mode={selectedPayment === 'card' ? 'contained' : 'outlined'}
            onPress={() => setSelectedPayment('card')}
          >
            Card
          </Button>
          <Button
            mode={selectedPayment === 'mobile_wallet' ? 'contained' : 'outlined'}
            onPress={() => setSelectedPayment('mobile_wallet')}
          >
            Wallet
          </Button>
        </View>

        {/* Offline Status */}
        {sync.mode === 'OFFLINE' && (
          <Text style={styles.offlineWarning}>⚠️ Working offline - transactions queued</Text>
        )}

        {/* Complete Button */}
        <Button
          mode="contained"
          onPress={handleCompleteTransaction}
          loading={processing}
          disabled={processing || cart.items.length === 0}
          style={styles.completeButton}
        >
          Complete Transaction
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12
  },
  searchInput: {
    marginBottom: 12
  },
  productCard: {
    flex: 1,
    margin: 6
  },
  addButton: {
    marginTop: 8
  },
  cartSummary: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    marginTop: 16
  },
  paymentMethods: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16
  },
  completeButton: {
    marginTop: 16
  },
  offlineWarning: {
    color: '#ff6b6b',
    textAlign: 'center',
    marginVertical: 8
  }
});
