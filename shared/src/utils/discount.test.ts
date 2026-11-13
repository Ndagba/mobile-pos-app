import { describe, expect, it } from 'vitest';
import { cashierDiscountRule, clampDiscount } from './discount';

const cashier = { role: 'cashier' };

describe('cashierDiscountRule', () => {
  it('never limits admins, managers or super admins', () => {
    const settings = { allow_cashier_discount: false, max_discount_percent: 5 };
    for (const user of [{ role: 'admin' }, { role: 'manager' }, { role: 'cashier', is_super_admin: true }]) {
      expect(cashierDiscountRule(user, settings, 1000)).toEqual({ allowed: true, maxPercent: null, cap: Infinity });
    }
  });

  it('blocks cashiers when discounts are switched off', () => {
    expect(cashierDiscountRule(cashier, { allow_cashier_discount: false, max_discount_percent: 50 }, 1000)).toEqual({
      allowed: false,
      maxPercent: null,
      cap: 0,
    });
  });

  it('treats missing settings as allowed and uncapped', () => {
    expect(cashierDiscountRule(cashier, null, 1000).cap).toBe(Infinity);
    expect(cashierDiscountRule(cashier, {}, 1000).allowed).toBe(true);
    expect(cashierDiscountRule(cashier, { max_discount_percent: null }, 1000).maxPercent).toBeNull();
  });

  it('caps cashiers to a percentage of the subtotal', () => {
    expect(cashierDiscountRule(cashier, { max_discount_percent: 10 }, 2000)).toEqual({
      allowed: true,
      maxPercent: 10,
      cap: 200,
    });
    // Decimal-as-string from the API, and a 0% cap meaning "no discount".
    expect(cashierDiscountRule(cashier, { max_discount_percent: '5' }, 2000).cap).toBe(100);
    expect(cashierDiscountRule(cashier, { max_discount_percent: 0 }, 2000).cap).toBe(0);
    expect(cashierDiscountRule(cashier, { max_discount_percent: 10 }, 0).cap).toBe(0);
  });
});

describe('clampDiscount', () => {
  it('clamps to the cap and floors at zero', () => {
    const rule = cashierDiscountRule(cashier, { max_discount_percent: 10 }, 2000);
    expect(clampDiscount(150, rule)).toBe(150);
    expect(clampDiscount(500, rule)).toBe(200);
    expect(clampDiscount(-20, rule)).toBe(0);
    expect(clampDiscount(NaN, rule)).toBe(0);
  });

  it('returns 0 when discounts are not allowed and passes through when uncapped', () => {
    expect(clampDiscount(100, cashierDiscountRule(cashier, { allow_cashier_discount: false }, 2000))).toBe(0);
    expect(clampDiscount(100000, cashierDiscountRule({ role: 'admin' }, {}, 2000))).toBe(100000);
  });
});
