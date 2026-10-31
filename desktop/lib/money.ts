'use client';

import { naira } from '@jaypos/shared';
import { usePrefsStore } from '@/store/prefsStore';

/** Mask shown in place of a figure when "hide amounts" is on (handoff §6). */
export const MONEY_MASK = '₦ ••••••';

/** Format a naira figure, or the mask when amounts are hidden. */
export function money(n: number, hidden = false): string {
  return hidden ? MONEY_MASK : naira(n);
}

/**
 * Hook form: returns a formatter bound to the current "hide amounts" preference.
 * Reuses shared `naira()` so rounding/locale stay identical to mobile.
 *
 *   const fmt = useMoney();
 *   fmt(1250) // "₦1,250"  or  "₦ ••••••" when hidden
 */
export function useMoney(): (n: number) => string {
  const hidden = usePrefsStore((s) => s.hideAmounts);
  return (n: number) => money(n, hidden);
}
