import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface StoreSettings {
  allow_cashier_add_customers: boolean;
  allow_cashier_edit_customers: boolean;
  customer_menu_enabled: boolean;
  supplier_menu_enabled: boolean;
}

interface SettingsState {
  settings: StoreSettings | null;
  loading: boolean;
  error: string | null;
}

const initialState: SettingsState = {
  settings: null,
  loading: false,
  error: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setStoreSettings: (state, action: PayloadAction<StoreSettings>) => {
      state.settings = action.payload;
    },
    setSettingsLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    clearStoreSettings: (state) => {
      state.settings = null;
    }
  },
});

export const { setStoreSettings, setSettingsLoading, clearStoreSettings } = settingsSlice.actions;
export default settingsSlice.reducer;
