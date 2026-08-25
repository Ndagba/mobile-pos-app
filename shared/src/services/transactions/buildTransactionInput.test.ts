import { describe, it, expect } from 'vitest';
import { buildTransactionInput } from './buildTransactionInput';
import type { CartItem } from '../../types';

const line = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 'p1',
  product_name: 'Rice 5kg',
  quantity: 2,
  unit_price: 100,
  tax_rate: 7.5,
  ...over,
});

const ctx = { store_id: 'store_001', branch_id: 'b1', payment_method: 'cash' as const };

describe('buildTransactionInput', () => {
  it('computes per-line and total money exactly like mobile checkout', () => {
    const draft = buildTransactionInput([line()], ctx);

    // subtotal = 100*2 = 200; tax = round2(200 * 7.5/100) = 15; total = 215
    expect(draft.subtotal).toBe(200);
    expect(draft.tax_amount).toBe(15);
    expect(draft.discount_amount).toBe(0);
    expect(draft.total_amount).toBe(215);

    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      product_id: 'p1',
      quantity: 2,
      unit_price: 100,
      tax_amount: 15,
      line_total: 200,
    });
  });

  it('treats a missing tax_rate as 0 tax', () => {
    const draft = buildTransactionInput(
      [line({ tax_rate: undefined as unknown as number })],
      ctx
    );
    expect(draft.tax_amount).toBe(0);
    expect(draft.items[0].tax_amount).toBe(0);
    expect(draft.total_amount).toBe(200);
  });

  it('applies a flat discount to the total (after tax)', () => {
    const draft = buildTransactionInput([line()], { ...ctx, discount_amount: 20 });
    // 200 + 15 - 20 = 195
    expect(draft.discount_amount).toBe(20);
    expect(draft.total_amount).toBe(195);
  });

  it('rounds each field to 2dp so totals are byte-identical across clients', () => {
    // unit_price 33.33, qty 3, tax_rate 7.5:
    //   subtotal   = 99.99
    //   line tax   = round2(99.99 * 7.5/100) = round2(7.49925) = 7.5
    //   total tax  = round2(7.49925) = 7.5
    //   total      = round2(99.99 + 7.49925) = round2(107.48925) = 107.49
    const draft = buildTransactionInput(
      [line({ unit_price: 33.33, quantity: 3 })],
      ctx
    );
    expect(draft.subtotal).toBe(99.99);
    expect(draft.tax_amount).toBe(7.5);
    expect(draft.items[0].tax_amount).toBe(7.5);
    expect(draft.items[0].line_total).toBe(99.99);
    expect(draft.total_amount).toBe(107.49);
  });

  it('carries context through and normalises customer_id ("" → undefined)', () => {
    const draft = buildTransactionInput([line()], {
      ...ctx,
      customer_id: '',
    });
    expect(draft.store_id).toBe('store_001');
    expect(draft.branch_id).toBe('b1');
    expect(draft.payment_method).toBe('cash');
    expect(draft.customer_id).toBeUndefined();
  });

  it('produces zeroed money for an empty cart', () => {
    const draft = buildTransactionInput([], ctx);
    expect(draft).toMatchObject({
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 0,
      items: [],
    });
  });
});
