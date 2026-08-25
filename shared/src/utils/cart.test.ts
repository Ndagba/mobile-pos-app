import { describe, it, expect } from 'vitest';
import { calculateCartTotals } from './cart';
import type { CartItem } from '../types';

describe('calculateCartTotals', () => {
  it('matches mobile recalculateTotals arithmetic', () => {
    const items: CartItem[] = [
      { product_id: 'a', product_name: 'A', quantity: 2, unit_price: 100, tax_rate: 7.5 },
      { product_id: 'b', product_name: 'B', quantity: 1, unit_price: 50, tax_rate: 0 }
    ];
    // subtotal = 2*100 + 1*50 = 250
    // tax      = (200 * 7.5 / 100) + 0 = 15
    // total    = 250 + 15 - 10 = 255
    expect(calculateCartTotals(items, 10)).toEqual({
      subtotal: 250,
      tax_amount: 15,
      discount_amount: 10,
      total: 255
    });
  });

  it('treats a missing tax_rate as 0', () => {
    const items: CartItem[] = [
      { product_id: 'a', product_name: 'A', quantity: 3, unit_price: 10, tax_rate: undefined as unknown as number }
    ];
    expect(calculateCartTotals(items)).toEqual({
      subtotal: 30,
      tax_amount: 0,
      discount_amount: 0,
      total: 30
    });
  });

  it('returns zeroed totals for an empty cart', () => {
    expect(calculateCartTotals([])).toEqual({
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      total: 0
    });
  });
});
