import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  date_of_birth?: string;
  notes?: string;
  credit_limit?: number;
  total_spent: number;
  transaction_count: number;
  last_transaction_at?: string | null;
  tag?: 'VIP' | 'New' | null;
  is_active: boolean;
  created_at: string;
}

export interface CustomersState {
  all: Customer[];
  selected: Customer | null;
  search: string;
  pagination: { limit: number; offset: number; total: number };
  loading: boolean;
  error: string | null;
}

const initialState: CustomersState = {
  all: [],
  selected: null,
  search: '',
  pagination: { limit: 50, offset: 0, total: 0 },
  loading: false,
  error: null,
};

const customersSlice = createSlice({
  name: 'customers',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setCustomers: (state, action: PayloadAction<{ items: Customer[]; total: number }>) => {
      state.all = action.payload.items;
      state.pagination.total = action.payload.total;
      state.error = null;
    },
    addCustomer: (state, action: PayloadAction<Customer>) => {
      state.all.unshift(action.payload);
      state.pagination.total += 1;
    },
    updateCustomer: (state, action: PayloadAction<Customer>) => {
      const idx = state.all.findIndex(c => c.id === action.payload.id);
      if (idx >= 0) {
        state.all[idx] = action.payload;
      }
      if (state.selected?.id === action.payload.id) {
        state.selected = action.payload;
      }
    },
    removeCustomer: (state, action: PayloadAction<string>) => {
      state.all = state.all.filter(c => c.id !== action.payload);
      if (state.selected?.id === action.payload) {
        state.selected = null;
      }
      state.pagination.total = Math.max(0, state.pagination.total - 1);
    },
    setSelected: (state, action: PayloadAction<Customer | null>) => {
      state.selected = action.payload;
    },
    setSearch: (state, action: PayloadAction<string>) => {
      state.search = action.payload;
      state.pagination.offset = 0;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setLoading,
  setCustomers,
  addCustomer,
  updateCustomer,
  removeCustomer,
  setSelected,
  setSearch,
  setError,
  clearError,
} = customersSlice.actions;

export default customersSlice.reducer;
