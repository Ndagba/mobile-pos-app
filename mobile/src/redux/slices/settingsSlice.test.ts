import reducer, { normalizeStoreSettings, setStoreSettings } from './settingsSlice';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

// eslint-disable-next-line import/first
import { resolveReceiptBranding } from '../../utils/receiptBranding';

describe('normalizeStoreSettings', () => {
  it('applies the server defaults when keys are missing', () => {
    const s = normalizeStoreSettings({});
    expect(s.allow_cashier_discount).toBe(true);
    expect(s.allow_cashier_refund).toBe(false);
    expect(s.receipt_show_logo).toBe(true);
    expect(s.max_discount_percent).toBeNull();
    expect(s.customer_menu_enabled).toBe(true);
  });

  it('coerces Decimal strings and keeps explicit false / 0', () => {
    const s = normalizeStoreSettings({ tax_rate: '7.50', max_discount_percent: 0, allow_cashier_discount: false });
    expect(s.tax_rate).toBe(7.5);
    expect(s.max_discount_percent).toBe(0);
    expect(s.allow_cashier_discount).toBe(false);
  });
});

describe('normalizeStoreSettings — business mode (Bar/Lounge Phase 1)', () => {
  it('defaults existing stores to retail, unlocked, with bar defaults', () => {
    const s = normalizeStoreSettings({});
    expect(s.business_mode).toBe('retail');
    expect(s.business_mode_locked).toBe(false);
    expect(s.bar_business_day_cutoff_hour).toBe(6);
    expect(s.bar_timezone).toBe('Africa/Lagos');
    expect(s.commission_enabled).toBe(false);
    expect(s.commission_rate).toBeNull();
    expect(s.commission_basis).toBe('total_sales');
  });

  it('reads bar mode and coerces the Decimal commission rate', () => {
    const s = normalizeStoreSettings({ business_mode: 'bar', business_mode_locked: true, commission_rate: '5.00', bar_business_day_cutoff_hour: 0 });
    expect(s.business_mode).toBe('bar');
    expect(s.business_mode_locked).toBe(true);
    expect(s.commission_rate).toBe(5);
    expect(s.bar_business_day_cutoff_hour).toBe(0);
  });

  it('treats an unknown mode as retail', () => {
    expect(normalizeStoreSettings({ business_mode: 'nightclub' }).business_mode).toBe('retail');
  });
});

describe('setStoreSettings', () => {
  it('merges, so a four-flag update does not wipe the cashier sales rules', () => {
    let state = reducer(undefined, setStoreSettings(normalizeStoreSettings({ max_discount_percent: 10, allow_cashier_refund: true })));
    state = reducer(state, setStoreSettings({
      allow_cashier_add_customers: false,
      allow_cashier_edit_customers: true,
      customer_menu_enabled: true,
      supplier_menu_enabled: true,
    }));
    expect(state.settings?.allow_cashier_add_customers).toBe(false);
    expect(state.settings?.max_discount_percent).toBe(10);
    expect(state.settings?.allow_cashier_refund).toBe(true);
  });
});

describe('resolveReceiptBranding', () => {
  it('prints store profile lines in order and prefers store settings over legacy text', () => {
    expect(
      resolveReceiptBranding(
        { business_name: ' Mama Jay ', rc_number: 'RC 123', store_address: '1 Market Rd', receipt_footer: 'Come again' },
        { name: 'Old name', footer: 'Old footer' }
      )
    ).toEqual({ headerLines: ['Mama Jay', 'RC 123', '1 Market Rd'], footer: 'Come again' });
  });

  it('falls back to legacy device text, then the default footer', () => {
    expect(resolveReceiptBranding(null, { name: 'Old name' }, 'Thanks!')).toEqual({
      headerLines: ['Old name'],
      footer: 'Thanks!',
    });
  });
});
