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
  // Business mode (Bar/Lounge Phase 1) — the store's mode and whether it is
  // locked (the store has recorded sales).
  business_mode?: 'retail' | 'bar';
  business_mode_locked?: boolean;
  // Bar / Lounge settings
  bar_business_day_cutoff_hour?: number;
  bar_timezone?: string;
  bar_attendant_discount?: boolean;
  bar_allow_backdated_remittance?: boolean;
  bar_require_payment_declaration?: boolean;
  // Commission (D27: rate × attendant's total sales)
  commission_enabled?: boolean;
  commission_rate?: number | null;
  commission_basis?: string;
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
    // Unknown / missing mode is treated as retail — the safe default for existing stores.
    business_mode: data?.business_mode === 'bar' ? 'bar' : 'retail',
    business_mode_locked: data?.business_mode_locked ?? false,
    bar_business_day_cutoff_hour: numOrNull(data?.bar_business_day_cutoff_hour) ?? 6,
    bar_timezone: data?.bar_timezone ?? 'Africa/Lagos',
    bar_attendant_discount: data?.bar_attendant_discount ?? false,
    bar_allow_backdated_remittance: data?.bar_allow_backdated_remittance ?? false,
    bar_require_payment_declaration: data?.bar_require_payment_declaration ?? false,
    commission_enabled: data?.commission_enabled ?? false,
    commission_rate: numOrNull(data?.commission_rate),
    commission_basis: data?.commission_basis ?? 'total_sales',
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
