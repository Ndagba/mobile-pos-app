import { describe, it, expect } from 'vitest';
import {
  tracksInventory,
  getAvailableStock,
  isOutOfStock,
  canAddToCart,
  canIncrementQuantity,
  stockStatus
} from './inventory';

describe('tracksInventory', () => {
  it('treats PRODUCT and legacy (no item_type) items as stock-tracked', () => {
    expect(tracksInventory({ item_type: 'PRODUCT' })).toBe(true);
    expect(tracksInventory({})).toBe(true);
    expect(tracksInventory(null)).toBe(true);
  });

  it('treats SERVICE items as not stock-tracked', () => {
    expect(tracksInventory({ item_type: 'SERVICE' })).toBe(false);
  });
});

describe('getAvailableStock', () => {
  it('reads quantity_on_hand as a number, defaulting to 0', () => {
    expect(getAvailableStock({ inventory: { quantity_on_hand: 5 } })).toBe(5);
    expect(getAvailableStock({ inventory: { quantity_on_hand: '5' } })).toBe(5);
    expect(getAvailableStock({ inventory: null })).toBe(0);
    expect(getAvailableStock({})).toBe(0);
  });
});

describe('isOutOfStock', () => {
  it('is true only for a stock-tracked item with no units', () => {
    expect(isOutOfStock({ item_type: 'PRODUCT', inventory: { quantity_on_hand: 0 } })).toBe(true);
    expect(isOutOfStock({ item_type: 'PRODUCT', inventory: { quantity_on_hand: 3 } })).toBe(false);
  });

  it('is never true for a service (no stock to run out of)', () => {
    expect(isOutOfStock({ item_type: 'SERVICE', inventory: null })).toBe(false);
  });
});

describe('canAddToCart / canIncrementQuantity', () => {
  it('caps products at available stock', () => {
    const p = { item_type: 'PRODUCT' as const, inventory: { quantity_on_hand: 2 } };
    expect(canAddToCart(p, 0)).toBe(true);
    expect(canAddToCart(p, 2)).toBe(false);
    expect(canIncrementQuantity(p, 1)).toBe(true);
    expect(canIncrementQuantity(p, 2)).toBe(false);
  });

  it('never caps services', () => {
    const s = { item_type: 'SERVICE' as const, inventory: null };
    expect(canAddToCart(s, 99)).toBe(true);
    expect(canIncrementQuantity(s, 99)).toBe(true);
  });
});

describe('stockStatus', () => {
  it('mirrors mobile product-card thresholds (out ≤ 0, low ≤ threshold, else in-stock)', () => {
    expect(stockStatus({ inventory: { quantity_on_hand: 0 } }, 10)).toBe('OUT_OF_STOCK');
    expect(stockStatus({ inventory: { quantity_on_hand: -1 } }, 10)).toBe('OUT_OF_STOCK');
    expect(stockStatus({ inventory: { quantity_on_hand: 1 } }, 10)).toBe('LOW');
    expect(stockStatus({ inventory: { quantity_on_hand: 10 } }, 10)).toBe('LOW');
    expect(stockStatus({ inventory: { quantity_on_hand: 11 } }, 10)).toBe('IN_STOCK');
  });

  it('defaults the threshold to 10 when none is given', () => {
    expect(stockStatus({ inventory: { quantity_on_hand: 10 } })).toBe('LOW');
    expect(stockStatus({ inventory: { quantity_on_hand: 11 } })).toBe('IN_STOCK');
  });

  it('coerces Decimal-string quantities', () => {
    expect(stockStatus({ inventory: { quantity_on_hand: '3' } }, 5)).toBe('LOW');
    expect(stockStatus({ inventory: { quantity_on_hand: '8' } }, 5)).toBe('IN_STOCK');
  });

  it('treats a product with no inventory row as out of stock', () => {
    expect(stockStatus({ item_type: 'PRODUCT', inventory: null })).toBe('OUT_OF_STOCK');
  });
});
