/**
 * Business-date helpers (Bar/Lounge planning, Phase 0; decision BD: day ends 06:00 Africa/Lagos).
 *
 * A bar trading 18:00 → 03:00 spans two calendar days. Its "business date" is the
 * calendar date of (local time − cutoff hours), so 02:00 on the 18th belongs to the 17th.
 *
 * Always computed on the server from a real instant — never trusted from the client —
 * and independent of the server's own timezone (prod may run in UTC).
 * Pure functions, built only on Intl (full ICU ships with Node).
 */

export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Lagos';
export const DEFAULT_BUSINESS_DAY_CUTOFF_HOUR = 6;

export interface BusinessDayOptions {
  timeZone?: string;
  /** 0–23. 0 = business day equals the calendar day. */
  cutoffHour?: number;
}

function resolve(opts: BusinessDayOptions = {}) {
  const timeZone = opts.timeZone ?? DEFAULT_BUSINESS_TIMEZONE;
  const cutoffHour = opts.cutoffHour ?? DEFAULT_BUSINESS_DAY_CUTOFF_HOUR;
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new RangeError('cutoffHour must be an integer 0–23');
  }
  // Throws RangeError for an unknown zone — fail loudly rather than silently using UTC.
  new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  return { timeZone, cutoffHour };
}

/** Wall-clock parts of `instant` in `timeZone`. */
function zonedParts(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** Offset (ms) of `timeZone` from UTC at `instant`: local wall-clock − UTC. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const z = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which local wall-clock (y-m-d h:00) occurs in `timeZone`. */
function zonedWallClockToInstant(y: number, m: number, d: number, h: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, h);
  let instant = guess - zoneOffsetMs(new Date(guess), timeZone);
  // Second pass corrects for an offset change between the guess and the answer (DST zones).
  instant = guess - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

const pad = (n: number) => String(n).padStart(2, '0');

function assertDateString(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('business date must be YYYY-MM-DD');
}

/** Business date ("YYYY-MM-DD") that `instant` belongs to. */
export function getBusinessDate(instant: Date, opts?: BusinessDayOptions): string {
  const { timeZone, cutoffHour } = resolve(opts);
  if (Number.isNaN(instant.getTime())) throw new RangeError('invalid instant');
  const z = zonedParts(instant, timeZone);
  // Shift the local calendar day back by one when we are before the cutoff.
  const local = new Date(Date.UTC(z.year, z.month - 1, z.day));
  if (z.hour < cutoffHour) local.setUTCDate(local.getUTCDate() - 1);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/**
 * Half-open UTC instant range [start, end) covered by a business date.
 * Use `gte: start, lt: end` in queries.
 */
export function getBusinessDayRange(date: string, opts?: BusinessDayOptions): { start: Date; end: Date } {
  assertDateString(date);
  const { timeZone, cutoffHour } = resolve(opts);
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    start: zonedWallClockToInstant(y, m, d, cutoffHour, timeZone),
    end: zonedWallClockToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), cutoffHour, timeZone),
  };
}

/** Business date as a UTC-midnight Date, the form Prisma expects for `@db.Date` columns. */
export function businessDateToDbDate(date: string): Date {
  assertDateString(date);
  return new Date(`${date}T00:00:00.000Z`);
}
