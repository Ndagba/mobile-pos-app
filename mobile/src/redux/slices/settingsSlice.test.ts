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
