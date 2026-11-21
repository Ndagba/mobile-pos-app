/**
 * The bar "business day" on the phone: the calendar date in the store's time
 * zone, shifted back by the cutoff hour (default 06:00 Africa/Lagos), so a sale
 * at 02:00 still belongs to the previous night. Mirrors the backend's
 * getBusinessDate; the server stays the authority for every figure, this is
 * only used to label and default the date filters.
 */
export function barBusinessToday(
  opts: { cutoffHour?: number | null; timeZone?: string | null } = {},
  now: Date = new Date()
): string {
  const cutoff = Number.isInteger(opts.cutoffHour) ? (opts.cutoffHour as number) : 6;
  const shifted = new Date(now.getTime() - cutoff * 3600_000);
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: opts.timeZone || 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(shifted);
  } catch {
    // No Intl time-zone data on this device: fall back to Lagos (UTC+1, no DST).
    return new Date(shifted.getTime() + 3600_000).toISOString().slice(0, 10);
  }
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
