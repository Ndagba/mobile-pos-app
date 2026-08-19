import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Supplier {
  id: string;
  store_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  notes?: string;
  tag?: 'Preferred' | 'Blocked' | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SuppliersState {
  all: Supplier[];
  selected: Supplier | null;
  search: string;
  pagination: { limit: number; offset: number; total: number };
  loading: boolean;
  error: string | null;
}

const initialState: SuppliersState = {
  all: [],
  selected: null,
  search: '',
  pagination: { limit: 100, offset: 0, total: 0 },
  loading: false,
  error: null,
};

const suppliersSlice = createSlice({
  name: 'suppliers',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setSuppliers: (state, action: PayloadAction<{ items: Supplier[]; total: number }>) => {
      state.all = action.payload.items;
      state.pagination.total = action.payload.total;
      state.error = null;
    },
    addSupplier: (state, action: PayloadAction<Supplier>) => {
      state.all.unshift(action.payload);
      state.pagination.total += 1;
    },
    updateSupplier: (state, action: PayloadAction<Supplier>) => {
      const idx = state.all.findIndex(s => s.id === action.payload.id);
      if (idx >= 0) {
        state.all[idx] = action.payload;
      }
      if (state.selected?.id === action.payload.id) {
        state.selected = action.payload;
      }
    },
    removeSupplier: (state, action: PayloadAction<string>) => {
      state.all = state.all.filter(s => s.id !== action.payload);
      if (state.selected?.id === action.payload) {
        state.selected = null;
      }
      state.pagination.total = Math.max(0, state.pagination.total - 1);
    },
    setSelected: (state, action: PayloadAction<Supplier | null>) => {
      state.selected = action.payload;
    },
    setSearch: (state, action: PayloadAction<string>) => {
      state.search = action.payload;
      state.pagination.offset = 0;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setLoading,
  setSuppliers,
  addSupplier,
  updateSupplier,
  removeSupplier,
  setSelected,
  setSearch,
  setError,
} = suppliersSlice.actions;

export default suppliersSlice.reducer;
