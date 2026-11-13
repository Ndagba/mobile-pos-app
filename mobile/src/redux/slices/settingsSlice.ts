import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * Store-level settings from `GET /v1/settings` — the same row the desktop
 * Settings page edits. The four cashier menu/customer flags are always present;
 * the rest (business profile, receipt, cashier sales permissions) are optional so
 * older call sites that only know the four flags keep working.
 */
export interface StoreSettings {
  allow_cashier_add_customers: boolean;
  allow_cashier_edit_customers: boolean;
  customer_menu_enabled: boolean;
  supplier_menu_enabled: boolean;
  // Business profile (top of every receipt)
  business_name?: string | null;
  rc_number?: string | null;
  store_address?: string | null;
  // Tax + receipt
  tax_rate?: number | null;
  receipt_footer?: string | null;
  receipt_show_logo?: boolean;
  // Cashier sales permissions
  allow_cashier_refund?: boolean;
  allow_cashier_discount?: boolean;
  max_discount_percent?: number | null;
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalise a raw `/settings` row (Decimal strings, missing keys) with the server defaults. */
export function normalizeStoreSettings(data: any): StoreSettings {
  return {
    allow_cashier_add_customers: data?.allow_cashier_add_customers ?? true,
    allow_cashier_edit_customers: data?.allow_cashier_edit_customers ?? true,
    customer_menu_enabled: data?.customer_menu_enabled ?? true,
    supplier_menu_enabled: data?.supplier_menu_enabled ?? true,
    business_name: data?.business_name ?? null,
    rc_number: data?.rc_number ?? null,
    store_address: data?.store_address ?? null,
    tax_rate: numOrNull(data?.tax_rate),
    receipt_footer: data?.receipt_footer ?? null,
    receipt_show_logo: data?.receipt_show_logo ?? true,
    allow_cashier_refund: data?.allow_cashier_refund ?? false,
    allow_cashier_discount: data?.allow_cashier_discount ?? true,
    max_discount_percent: numOrNull(data?.max_discount_percent),
  };
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
    // Merges, so a caller that only knows some fields (e.g. the four customer
    // toggles) can't wipe the profile / permission fields loaded elsewhere.
    setStoreSettings: (state, action: PayloadAction<StoreSettings>) => {
      state.settings = { ...(state.settings ?? {}), ...action.payload };
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
