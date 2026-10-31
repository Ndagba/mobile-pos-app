/**
 * Shared reporting-period helpers. Presets resolve to an inclusive
 * start-of-day → end-of-day ISO range the backend can filter `created_at` on.
 */
export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export const PERIOD_LABELS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** `YYYY-MM-DD` for date inputs and filenames. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

/** Resolve a preset (or custom inputs) to an inclusive ISO datetime range. */
export function periodToRange(preset: PeriodPreset, customFrom?: string, customTo?: string): DateRange {
  const now = new Date();
  if (preset === 'today') {
    return { dateFrom: startOfDay(now).toISOString(), dateTo: endOfDay(now).toISOString() };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { dateFrom: startOfDay(y).toISOString(), dateTo: endOfDay(y).toISOString() };
  }
  if (preset === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6); // last 7 days inclusive
    return { dateFrom: startOfDay(from).toISOString(), dateTo: endOfDay(now).toISOString() };
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: startOfDay(from).toISOString(), dateTo: endOfDay(now).toISOString() };
  }
  // custom — fall back to today if a bound is missing
  const from = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(now);
  const to = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
  return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
}

/** Human label for a resolved range, e.g. "Oct 1, 2026 – Oct 30, 2026". */
export function rangeLabel(dateFrom: string, dateTo: string): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}
