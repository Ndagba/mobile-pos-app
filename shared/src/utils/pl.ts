/**
 * Pure Profit & Loss math, the insight rule engine and the report date-range
 * helpers, shared by the desktop `/admin/financials/pl` page and the mobile
 * Profit & Loss screen so both apps show the same figures for the same period.
 * No React, no I/O — everything is derived from the `/financials/pl` payload plus
 * (optionally) the previous period. Moved here from `desktop/lib/plMetrics.ts`.
 */

export interface PLData {
  grossIncome: number;
  productRevenue: number;
  serviceRevenue: number;
  productCogs: number;
  serviceDirectCosts: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

export interface PLDerived {
  cogs: number;
  grossMargin: number; // 0..1
  netMargin: number; // 0..1
  cogsPct: number; // of revenue, 0..1
  opexPct: number; // of revenue, 0..1
  netPct: number; // of revenue, 0..1 (can be negative)
  breakEven: number;
  headroom: number; // grossIncome - breakEven
  headroomPct: number; // headroom / grossIncome
  servicesRevShare: number; // serviceRevenue / grossIncome
  servicesGpShare: number; // (serviceRevenue - serviceDirectCosts) / grossProfit
}

/** Division that yields 0 when the denominator is 0 (handoff divide-by-zero rule). */
export function safeDiv(a: number, b: number): number {
  return b ? a / b : 0;
}

/** Percentage change cur vs prev, or null when prev is 0 (no basis to compare). */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function derivePL(d: PLData): PLDerived {
  const cogs = d.productCogs + d.serviceDirectCosts;
  const grossMargin = safeDiv(d.grossProfit, d.grossIncome);
  const breakEven = grossMargin ? d.operatingExpenses / grossMargin : 0;
  return {
    cogs,
    grossMargin,
    netMargin: safeDiv(d.netProfit, d.grossIncome),
    cogsPct: safeDiv(cogs, d.grossIncome),
    opexPct: safeDiv(d.operatingExpenses, d.grossIncome),
    netPct: safeDiv(d.netProfit, d.grossIncome),
    breakEven,
    headroom: d.grossIncome - breakEven,
    headroomPct: safeDiv(d.grossIncome - breakEven, d.grossIncome),
    servicesRevShare: safeDiv(d.serviceRevenue, d.grossIncome),
    servicesGpShare: safeDiv(d.serviceRevenue - d.serviceDirectCosts, d.grossProfit),
  };
}

export type InsightTag = 'Watch' | 'Strength' | 'Review';
export interface Insight {
  tag: InsightTag;
  title: string;
  body: string;
  priority: number;
}

export interface InsightInputs {
  cur: PLData;
  der: PLDerived;
  prev?: PLData | null;
  prevDer?: PLDerived | null;
  /** Top products by revenue (for the margin-of-top-seller rule). */
  topProducts?: Array<{ name: string; revenue: number; profit: number }>;
  /** Per-category expense change vs the previous period, as a fraction (0.2 = +20%). */
  expenseDeltas?: Array<{ name: string; changeFraction: number }>;
  naira: (n: number) => string;
}

/**
 * Build the insight cards from the handoff rules, most important first. Always
 * returns at least one card (a neutral fallback) and at most three.
 */
export function buildInsights(input: InsightInputs): Insight[] {
  const { cur, der, prev, prevDer, topProducts, expenseDeltas, naira } = input;
  const out: Insight[] = [];

  // Running at a loss.
  if (cur.netProfit < 0) {
    const gap = der.breakEven - cur.grossIncome;
    out.push({
      tag: 'Watch',
      title: "You're running at a loss",
      body: `Net profit is ${naira(cur.netProfit)}. You need about ${naira(der.breakEven)} in sales to break even — roughly ${naira(Math.max(0, gap))} more than this period.`,
      priority: 100,
    });
  }

  // Costs growing faster than sales.
  if (prev) {
    const revGrowth = pctChange(cur.grossIncome, prev.grossIncome);
    const cogsGrowth = pctChange(cur.productCogs + cur.serviceDirectCosts, prev.productCogs + prev.serviceDirectCosts);
    if (revGrowth !== null && cogsGrowth !== null && cogsGrowth > revGrowth) {
      out.push({
        tag: 'Watch',
        title: 'Costs are growing faster than sales',
        body: `Revenue is up ${revGrowth.toFixed(1)}% but cost of goods is up ${cogsGrowth.toFixed(1)}%. Gross margin is ${der.grossMargin >= (prevDer?.grossMargin ?? 0) ? 'holding' : 'slipping'}, so net profit is under pressure.`,
        priority: 90,
      });
    }
  }

  // Gross margin down ≥ 1 pt.
  if (prevDer) {
    const ptsDown = (prevDer.grossMargin - der.grossMargin) * 100;
    if (ptsDown >= 1) {
      out.push({
        tag: 'Watch',
        title: 'Gross margin is slipping',
        body: `Gross margin fell ${ptsDown.toFixed(1)} pts to ${(der.grossMargin * 100).toFixed(1)}%. Review pricing or supplier costs before it reaches net profit.`,
        priority: 80,
      });
    }
  }

  // An expense category up > 15%.
  const spiking = (expenseDeltas ?? []).filter((e) => e.changeFraction > 0.15).sort((a, b) => b.changeFraction - a.changeFraction)[0];
  if (spiking) {
    out.push({
      tag: 'Watch',
      title: `${spiking.name} costs jumped`,
      body: `${spiking.name} is up ${(spiking.changeFraction * 100).toFixed(0)}% versus the previous period. Worth checking whether it's a one-off or a new run-rate.`,
      priority: 70,
    });
  }

  // Services punch above their weight.
  if (der.servicesGpShare > der.servicesRevShare * 1.5 && cur.serviceRevenue > 0) {
    out.push({
      tag: 'Strength',
      title: 'Services punch above their weight',
      body: `Services are ${(der.servicesRevShare * 100).toFixed(0)}% of revenue but ${(der.servicesGpShare * 100).toFixed(0)}% of gross profit, because they carry almost no direct cost.`,
      priority: 60,
    });
  }

  // Top-revenue product has the lowest margin in the top 5.
  const top5 = (topProducts ?? []).slice(0, 5);
  if (top5.length >= 2) {
    const byRevenue = [...top5].sort((a, b) => b.revenue - a.revenue);
    const topSeller = byRevenue[0];
    const margins = top5.map((p) => ({ p, m: safeDiv(p.profit, p.revenue) }));
    const lowest = margins.reduce((lo, x) => (x.m < lo.m ? x : lo), margins[0]);
    if (lowest.p.name === topSeller.name) {
      const uplift = topSeller.revenue * 0.02; // ~2% price rise illustration
      out.push({
        tag: 'Review',
        title: `${topSeller.name} sells most but earns least`,
        body: `${topSeller.name} is your top seller at a ${(safeDiv(topSeller.profit, topSeller.revenue) * 100).toFixed(0)}% margin — the thinnest in your top 5. A small price rise could add about ${naira(uplift)} in profit.`,
        priority: 50,
      });
    }
  }

  out.sort((a, b) => b.priority - a.priority);

  if (out.length === 0) {
    out.push({
      tag: 'Strength',
      title: 'Margins are holding steady',
      body: 'Nothing stands out versus the previous period — revenue, costs and margin are broadly in line.',
      priority: 0,
    });
  }

  return out.slice(0, 3);
}

/* ───────────────────────── Report date ranges ───────────────────────── */

/** Local calendar date as `YYYY-MM-DD`. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse `YYYY-MM-DD` as a LOCAL date (not UTC midnight like `new Date(str)`). */
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export type PLPreset = 'today' | '7days' | 'month' | 'lastmonth';

/** Inclusive `YYYY-MM-DD` range for a preset, relative to `now`. */
export function plPresetRange(p: PLPreset, now: Date = new Date()): { start: string; end: string } {
  if (p === 'today') return { start: ymd(now), end: ymd(now) };
  if (p === '7days') {
    return { start: ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), end: ymd(now) };
  }
  if (p === 'lastmonth') {
    return {
      start: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return { start: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), end: ymd(now) };
}

/** Number of calendar days in the inclusive range (at least 1). */
export function plRangeDays(start: string, end: string): number {
  const ms = parseYmd(end).getTime() - parseYmd(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

/** The period of equal length immediately before [start, end]. */
export function plPreviousRange(start: string, end: string): { start: string; end: string } {
  const days = plRangeDays(start, end);
  const s = parseYmd(start);
  return {
    start: ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() - days)),
    end: ymd(new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1)),
  };
}

/**
 * ISO timestamps covering the whole of each local day in an inclusive
 * `YYYY-MM-DD` range: start-of-day of `start` → end-of-day of `end`.
 *
 * Send THESE to `/financials/pl`, not the bare dates: the backend does
 * `new Date(endDate)`, so a bare `2026-11-12` means midnight at the START of
 * that day and every sale made on the last day of the range is left out.
 */
export function dayBoundsIso(start: string, end: string): { startDate: string; endDate: string } {
  const s = parseYmd(start);
  const e = parseYmd(end);
  return {
    startDate: new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0).toISOString(),
    endDate: new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999).toISOString(),
  };
}
