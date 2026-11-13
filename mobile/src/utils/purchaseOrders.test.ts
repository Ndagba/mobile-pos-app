import {
  buildReceiveLines,
  isIsoDate,
  normalizePurchaseOrder,
  receivedFraction,
  POItem,
} from './purchaseOrders';

const line = (over: Partial<POItem> = {}): POItem => ({
  id: 'l1',
  product_id: 'p1',
  quantity_ordered: 10,
  quantity_received: 4,
  quantity_outstanding: 6,
  unit_cost: 250,
  line_total: 2500,
  product: { id: 'p1', name: 'Rice 50kg' },
  ...over,
});

describe('normalizePurchaseOrder', () => {
  it('coerces Decimal strings and derives outstanding when absent', () => {
    const po = normalizePurchaseOrder({
      id: 'po1',
      status: 'ordered',
      subtotal: '2500.00',
      tax_amount: '187.50',
      total_amount: '2687.50',
      items: [{ id: 'l1', product_id: 'p1', quantity_ordered: '10.0000', quantity_received: '4.0000', unit_cost: '250.00', line_total: '2500.00' }],
    });
    expect(po.total_amount).toBe(2687.5);
    expect(po.items[0].quantity_outstanding).toBe(6);
    expect(po.receipts).toEqual([]);
  });

  it('never reports negative outstanding on over-receipt', () => {
    const po = normalizePurchaseOrder({
      items: [{ id: 'l1', quantity_ordered: '5', quantity_received: '8', unit_cost: '1', line_total: '5' }],
    });
    expect(po.items[0].quantity_outstanding).toBe(0);
  });
});

describe('receivedFraction', () => {
  it('caps over-received lines at their ordered quantity', () => {
    expect(
      receivedFraction([
        { quantity_ordered: 10, quantity_received: 20 },
        { quantity_ordered: 10, quantity_received: 0 },
      ])
    ).toBe(0.5);
    expect(receivedFraction([])).toBe(0);
  });
});

describe('isIsoDate', () => {
  it('accepts real dates and rejects malformed / impossible ones', () => {
    expect(isIsoDate('2027-01-31')).toBe(true);
    expect(isIsoDate('2027-02-31')).toBe(false);
    expect(isIsoDate('31/01/2027')).toBe(false);
  });
});

describe('buildReceiveLines', () => {
  it('skips blank and zero lines (partial receipt)', () => {
    const res = buildReceiveLines(
      [line(), line({ id: 'l2' }), line({ id: 'l3' })],
      {
        l1: { qty: '3', batch: '', expiry: '' },
        l2: { qty: '', batch: '', expiry: '' },
        l3: { qty: '0', batch: '', expiry: '' },
      }
    );
    expect(res).toEqual({
      ok: true,
      items: [{ purchase_order_item_id: 'l1', quantity_received: 3, batch_number: null, expiry_date: null }],
      total: 750,
      overReceipt: false,
    });
  });

  it('allows and flags over-receipt', () => {
    const res = buildReceiveLines([line()], { l1: { qty: '9', batch: '', expiry: '' } });
    expect(res.ok && res.overReceipt).toBe(true);
  });

  it('rejects invalid quantities, batch without expiry, bad expiry, and an empty receipt', () => {
    expect(buildReceiveLines([line()], { l1: { qty: 'abc', batch: '', expiry: '' } }).ok).toBe(false);
    expect(buildReceiveLines([line()], { l1: { qty: '-1', batch: '', expiry: '' } }).ok).toBe(false);
    expect(buildReceiveLines([line()], { l1: { qty: '1', batch: 'B1', expiry: '' } }).ok).toBe(false);
    expect(buildReceiveLines([line()], { l1: { qty: '1', batch: 'B1', expiry: '2027-13-01' } }).ok).toBe(false);
    expect(buildReceiveLines([line()], { l1: { qty: '', batch: '', expiry: '' } }).ok).toBe(false);
  });
});

describe('suggested reorders', () => {
  const { reorderBase, suggestedQty, normalizeLowStock } = require('./purchaseOrders');
  it('uses the reorder point when set, else the low-stock threshold', () => {
    expect(reorderBase({ reorder_point: 20, low_stock_threshold: 10, current_quantity: 3 })).toBe(20);
    expect(reorderBase({ reorder_point: 0, low_stock_threshold: 10, current_quantity: 3 })).toBe(10);
    expect(reorderBase({ reorder_point: null, low_stock_threshold: 10, current_quantity: 3 })).toBe(10);
  });
  it('suggests enough to reach twice the baseline, never less than 1', () => {
    expect(suggestedQty({ reorder_point: null, low_stock_threshold: 10, current_quantity: 3 })).toBe(17);
    expect(suggestedQty({ reorder_point: null, low_stock_threshold: 0, current_quantity: 0 })).toBe(1);
    expect(suggestedQty({ reorder_point: 5, low_stock_threshold: 10, current_quantity: -2 })).toBe(12);
  });
  it('coerces Decimal strings', () => {
    const it2 = normalizeLowStock({ product_id: 'p', product_name: 'Rice', current_quantity: '2.0000', low_stock_threshold: '10', reorder_point: null });
    expect(it2.current_quantity).toBe(2);
    expect(it2.reorder_point).toBeNull();
  });
});

describe('purchaseOrderShareText', () => {
  const { purchaseOrderShareText } = require('./purchaseOrders');
  it('lists header, lines and the server totals', () => {
    const text = purchaseOrderShareText(
      {
        id: 'po1', branch_id: 'b', supplier_id: 's', po_number: 'PO-1', status: 'ordered',
        order_date: '2026-11-12T08:00:00.000Z', expected_date: null,
        subtotal: 2500, tax_amount: 187.5, total_amount: 2687.5, notes: 'Deliver early',
        supplier: { id: 's', name: 'Dangote', phone: '0800' },
        items: [line()], receipts: [],
      },
      ['Mama Jay']
    );
    expect(text.split('\n')[0]).toBe('Mama Jay');
    expect(text).toContain('PO number: PO-1');
    expect(text).toContain('Status:    Ordered');
    expect(text).toContain('Rice 50kg');
    expect(text).toContain('Ordered:   2026-11-12');
    expect(text).toContain('Expected:  —');
    expect(text).toContain('TOTAL:     ₦2,688');
    expect(text).toContain('Notes: Deliver early');
  });
});
