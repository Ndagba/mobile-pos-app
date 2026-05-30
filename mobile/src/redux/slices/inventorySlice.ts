import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Product {
  id: string;
  name: string;
  sku: string;
  marked_price: number;
  effective_price: number;
  tax_rate: number;
  barcode?: string;
  image_url?: string;
}

export interface InventoryItem {
  product_id: string;
  quantity_on_hand: number;
  low_stock_threshold: number;
  status: 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK';
}

export interface InventoryState {
  products: Product[];
  inventory: Record<string, InventoryItem>;
  categories: any[];
  searchQuery: string;
  filteredProducts: Product[];
  lowStockAlerts: Product[];
  expiringBatches: any[];
  loading: boolean;
  lastSync: string | null;
  error: string | null;
}

const initialState: InventoryState = {
  products: [],
  inventory: {},
  categories: [],
  searchQuery: '',
  filteredProducts: [],
  lowStockAlerts: [],
  expiringBatches: [],
  loading: false,
  lastSync: null,
  error: null
};

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setProducts: (state, action: PayloadAction<Product[]>) => {
      state.products = action.payload;
      state.filteredProducts = action.payload;
    },
    setInventory: (state, action: PayloadAction<InventoryItem[]>) => {
      const map: Record<string, InventoryItem> = {};
      action.payload.forEach(item => { map[item.product_id] = item; });
      state.inventory = map;
    },
    setCategories: (state, action: PayloadAction<any[]>) => {
      state.categories = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
      // Simple local search
      state.filteredProducts = state.products.filter(
        (product) =>
          product.name.toLowerCase().includes(action.payload.toLowerCase()) ||
          product.sku.toLowerCase().includes(action.payload.toLowerCase())
      );
    },
    setLowStockAlerts: (state, action: PayloadAction<Product[]>) => {
      state.lowStockAlerts = action.payload;
    },
    setExpiringBatches: (state, action: PayloadAction<any[]>) => {
      state.expiringBatches = action.payload;
    },
    setLastSync: (state, action: PayloadAction<string>) => {
      state.lastSync = action.payload;
    },
    updateProductStock: (state, action: PayloadAction<{ product_id: string; quantity: number }>) => {
      const item = state.inventory[action.payload.product_id];
      if (item) {
        item.quantity_on_hand = action.payload.quantity;
        item.status =
          action.payload.quantity === 0
            ? 'OUT_OF_STOCK'
            : action.payload.quantity <= item.low_stock_threshold
              ? 'LOW'
              : 'IN_STOCK';
      }
    }
  }
});

export const {
  setLoading,
  setError,
  setProducts,
  setInventory,
  setCategories,
  setSearchQuery,
  setLowStockAlerts,
  setExpiringBatches,
  setLastSync,
  updateProductStock
} = inventorySlice.actions;

export default inventorySlice.reducer;
