import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { PaymentMethod, SplitPaymentAllocations } from '@jaypos/shared';

export interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount?: number;
  discount_amount?: number;
  item_type?: 'PRODUCT' | 'SERVICE';
}

export interface CartState {
  items: CartItem[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  customer_id: string | null;
  // Shared payment model: 'cash' | 'card' | 'transfer' | 'split' (matches desktop + backend).
  payment_method: PaymentMethod | null;
  payment_splits: SplitPaymentAllocations | null;
  offline_session_hash: string | null;
  is_processing: boolean;
}

const initialState: CartState = {
  items: [],
  subtotal: 0,
  tax_amount: 0,
  discount_amount: 0,
  total: 0,
  customer_id: null,
  payment_method: null,
  payment_splits: null,
  offline_session_hash: null,
  is_processing: false
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem: (state, action: PayloadAction<CartItem>) => {
      const existingItem = state.items.find((item) => item.product_id === action.payload.product_id);

      if (existingItem) {
        existingItem.quantity += action.payload.quantity;
      } else {
        state.items.push(action.payload);
      }

      cartSlice.caseReducers.recalculateTotals(state);
    },
    removeItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((item) => item.product_id !== action.payload);
      cartSlice.caseReducers.recalculateTotals(state);
    },
    updateQuantity: (state, action: PayloadAction<{ product_id: string; quantity: number }>) => {
      const item = state.items.find((i) => i.product_id === action.payload.product_id);
      if (item) {
        item.quantity = action.payload.quantity;
      }
      cartSlice.caseReducers.recalculateTotals(state);
    },
    setDiscount: (state, action: PayloadAction<number>) => {
      state.discount_amount = action.payload;
      cartSlice.caseReducers.recalculateTotals(state);
    },
    setCustomer: (state, action: PayloadAction<string>) => {
      state.customer_id = action.payload;
    },
    setPaymentMethod: (state, action: PayloadAction<PaymentMethod>) => {
      state.payment_method = action.payload;
    },
    setPaymentSplits: (state, action: PayloadAction<SplitPaymentAllocations | null>) => {
      state.payment_splits = action.payload;
    },
    setProcessing: (state, action: PayloadAction<boolean>) => {
      state.is_processing = action.payload;
    },
    setOfflineSessionHash: (state, action: PayloadAction<string>) => {
      state.offline_session_hash = action.payload;
    },
    clearCart: (state) => {
      state.items = [];
      state.subtotal = 0;
      state.tax_amount = 0;
      state.discount_amount = 0;
      state.total = 0;
      state.customer_id = null;
      state.payment_method = null;
      state.payment_splits = null;
      state.offline_session_hash = null;
      state.is_processing = false;
    },
    recalculateTotals: (state) => {
      state.subtotal = state.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      state.tax_amount = state.items.reduce((sum, item) => {
        const taxRate = item.tax_rate ?? 0;
        return sum + (item.unit_price * item.quantity * taxRate) / 100;
      }, 0);
      state.total = state.subtotal + state.tax_amount - state.discount_amount;
    }
  }
});

export const {
  addItem,
  removeItem,
  updateQuantity,
  setDiscount,
  setCustomer,
  setPaymentMethod,
  setPaymentSplits,
  setProcessing,
  setOfflineSessionHash,
  clearCart,
  recalculateTotals
} = cartSlice.actions;

export default cartSlice.reducer;
