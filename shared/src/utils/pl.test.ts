import { describe, expect, it } from 'vitest';
import {
  buildInsights,
  dayBoundsIso,
  derivePL,
  pctChange,
  plPresetRange,
  plPreviousRange,
  plRangeDays,
  safeDiv,
  type PLData,
} from './pl';

const pl = (over: Partial<PLData> = {}): PLData => ({
  grossIncome: 1000,
  productRevenue: 800,
  serviceRevenue: 200,
  productCogs: 500,
  serviceDirectCosts: 0,
  grossProfit: 500,
  operatingExpenses: 200,
  netProfit: 300,
  ...over,
});

const naira = (n: number) => `N${Math.round(n)}`;

describe('derivePL', () => {
  it('derives margins, cost shares and break-even', () => {
    const d = derivePL(pl());
    expect(d.cogs).toBe(500);
    expect(d.grossMargin).toBe(0.5);
    expect(d.netMargin).toBe(0.3);
    expect(d.opexPct).toBe(0.2);
    expect(d.breakEven).toBe(400); // opex / gross margin
    expect(d.headroom).toBe(600);
    expect(d.servicesRevShare).toBe(0.2);
    expect(d.servicesGpShare).toBe(0.4);
  });

  it('never divides by zero on an empty period', () => {
    const d = derivePL(pl({ grossIncome: 0, productRevenue: 0, serviceRevenue: 0, productCogs: 0, grossProfit: 0, operatingExpenses: 0, netProfit: 0 }));
    expect(Object.values(d).every((v) => Number.isFinite(v))).toBe(true);
    expect(d.breakEven).toBe(0);
  });
});

describe('safeDiv / pctChange', () => {
  it('handles a zero base', () => {
    expect(safeDiv(5, 0)).toBe(0);
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(-50, -100)).toBe(50);
  });
});

describe('buildInsights', () => {
  it('flags a loss first and caps the list at three', () => {
    const cur = pl({ operatingExpenses: 700, netProfit: -200 });
    const prev = pl({ grossIncome: 1000, productCogs: 300, grossProfit: 700 });
    const out = buildInsights({
      cur,
      der: derivePL(cur),
      prev,
      prevDer: derivePL(prev),
      expenseDeltas: [{ name: 'Rent', changeFraction: 0.5 }],
      naira,
    });
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("You're running at a loss");
    expect(out.every((i, k) => k === 0 || out[k - 1].priority >= i.priority)).toBe(true);
  });

  it('always returns a neutral card when nothing stands out', () => {
    const cur = pl({ serviceRevenue: 0, productRevenue: 1000 });
    const out = buildInsights({ cur, der: derivePL(cur), naira });
    expect(out).toHaveLength(1);
    expect(out[0].tag).toBe('Strength');
  });
});

describe('report date ranges', () => {
  const now = new Date(2026, 10, 12, 15, 30); // 12 Nov 2026, local

  it('builds preset ranges relative to now', () => {
    expect(plPresetRange('today', now)).toEqual({ start: '2026-11-12', end: '2026-11-12' });
    expect(plPresetRange('7days', now)).toEqual({ start: '2026-11-06', end: '2026-11-12' });
    expect(plPresetRange('month', now)).toEqual({ start: '2026-11-01', end: '2026-11-12' });
    expect(plPresetRange('lastmonth', now)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('counts inclusive days and finds the equal-length previous period', () => {
    expect(plRangeDays('2026-11-12', '2026-11-12')).toBe(1);
    expect(plRangeDays('2026-11-01', '2026-11-12')).toBe(12);
    expect(plPreviousRange('2026-11-01', '2026-11-12')).toEqual({ start: '2026-10-20', end: '2026-10-31' });
    expect(plPreviousRange('2026-11-12', '2026-11-12')).toEqual({ start: '2026-11-11', end: '2026-11-11' });
  });

  it('covers the whole of the first and last local day', () => {
    const { startDate, endDate } = dayBoundsIso('2026-11-01', '2026-11-12');
    const s = new Date(startDate);
    const e = new Date(endDate);
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()]).toEqual([2026, 10, 1, 0, 0]);
    expect([e.getDate(), e.getHours(), e.getMinutes(), e.getSeconds(), e.getMilliseconds()]).toEqual([12, 23, 59, 59, 999]);
    // "Today" is a full day wide, not a zero-width instant.
    const today = dayBoundsIso('2026-11-12', '2026-11-12');
    expect(new Date(today.endDate).getTime() - new Date(today.startDate).getTime()).toBe(86400000 - 1);
  });
});
