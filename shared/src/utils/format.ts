/**
 * Presentation helpers, kept identical to mobile (mobile/src/theme/index.ts) so
 * currency and colour rendering match across apps.
 */

/** Format ₦ currency, no decimals. */
export function naira(n: number): string {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

/** Tone alpha — appends two-digit hex opacity to a 6-char hex colour. */
export function alpha(hex: string, pct: number): string {
  return hex + Math.round(pct * 255).toString(16).padStart(2, '0');
}
