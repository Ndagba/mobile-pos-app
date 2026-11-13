/**
 * Profit & Loss math and the insight rule engine now live in `@jaypos/shared`
 * (`utils/pl.ts`) so the mobile P&L screen uses the exact same formulas. This
 * module re-exports them to keep the existing `@/lib/plMetrics` imports working.
 */
export { safeDiv, pctChange, derivePL, buildInsights, dayBoundsIso } from '@jaypos/shared';
export type { PLData, PLDerived, Insight, InsightTag, InsightInputs } from '@jaypos/shared';
