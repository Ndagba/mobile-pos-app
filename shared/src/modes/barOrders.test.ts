import { describe, expect, it } from 'vitest';
import { barOrderAmount, newBarOrderClientRef, previewOrderTotals } from './barOrders';

describe('previewOrderTotals (mirrors server priceLines)', () => {
  it('brief example: 2 Goldberg, 1 Hero, 2 water', () => {
    expect(
      previewOrderTotals([
        { unit_price: 500, quantity: 2 },
        { unit_price: 550, quantity: 1 },
        { unit_price: 150, quantity: 2 },
      ])
    ).toEqual({ subtotal: 1850, tax_amount: 0, total_amount: 1850 });
  });

  it('same VAT rounding as the server test vector', () => {
    expect(
      previewOrderTotals([
        { unit_price: 333.33, tax_rate: 7.5, quantity: 3 },
        { unit_price: 0.1, tax_rate: 7.5, quantity: 1 },
      ])
    ).toEqual({ subtotal: 1000.09, tax_amount: 75.01, total_amount: 1075.1 });
  });
});

describe('helpers', () => {
  it('barOrderAmount prefers the released total', () => {
    expect(barOrderAmount({ fulfilled_total: 500, total_amount: 1300 })).toBe(500);
    expect(barOrderAmount({ fulfilled_total: null, total_amount: 1300 })).toBe(1300);
  });

  it('client refs are long enough for the server and unique', () => {
    const a = newBarOrderClientRef('device_123', 1);
    const b = newBarOrderClientRef('device_123', 1);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(100);
    expect(a).not.toBe(b);
  });
});
