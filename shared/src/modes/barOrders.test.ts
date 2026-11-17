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

import { reportRangePresets, reportTableToCsv } from './barOrders';

describe('reportTableToCsv (mirrors backend toCsv)', () => {
  it('same output as the backend test vector', () => {
    const csv = reportTableToCsv({
      report: 'remittances', title: 'Money handed over', description: '', from: '2026-11-17', to: '2026-11-17',
      columns: [{ key: 'a', label: 'Attendant', type: 'text' }, { key: 'n', label: 'Note', type: 'text' }, { key: 'v', label: 'Amount', type: 'money' }],
      rows: [{ a: 'Okafor, John', n: '=HYPERLINK("x")', v: -500 }],
      totals: { a: 'Total', n: null, v: -500 },
    });
    expect(csv.trim().split('\r\n').slice(1)).toEqual([
      'Attendant,Note,Amount',
      `"Okafor, John","'=HYPERLINK(""x"")","-500"`,
      `Total,,"-500"`,
    ]);
  });
});

describe('reportRangePresets', () => {
  it('builds business-date ranges', () => {
    const p = Object.fromEntries(reportRangePresets('2026-11-17').map((x) => [x.key, [x.from, x.to]]));
    expect(p).toEqual({
      today: ['2026-11-17', '2026-11-17'],
      yesterday: ['2026-11-16', '2026-11-16'],
      '7d': ['2026-11-11', '2026-11-17'],
      month: ['2026-11-01', '2026-11-17'],
    });
  });
});
