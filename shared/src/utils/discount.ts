/**
 * Cashier discount rule, shared by desktop and mobile so the two clients can
 * never disagree about what a cashier may give away at checkout.
 *
 * The discount is the flat store-level amount applied after tax (see `cart.ts`).
 * Store settings can switch it off for cashiers (`allow_cashier_discount`) or
 * cap it to a share of the cart SUBTOTAL (`max_discount_percent`).
 * Admins, managers and super admins are never limited.
 *
 * NOTE: the backend does not enforce this cap — it is a client-side rule, which
 * is exactly why both clients must use this one implementation.
 */
export interface DiscountRuleUser {
  role?: string | null;
  is_super_admin?: boolean | null;
}

export interface DiscountRuleSettings {
  allow_cashier_discount?: boolean | null;
  max_discount_percent?: number | string | null;
}

export interface DiscountRule {
  /** False when this user may not discount at all. */
  allowed: boolean;
  /** The percentage cap that applies to this user, or null when uncapped. */
  maxPercent: number | null;
  /** Largest allowed discount in ₦ for the given subtotal (Infinity when uncapped, 0 when not allowed). */
  cap: number;
}

export function cashierDiscountRule(
  user: DiscountRuleUser | null | undefined,
  settings: DiscountRuleSettings | null | undefined,
  subtotal: number
): DiscountRule {
  const isCashier = user?.role === 'cashier' && !user?.is_super_admin;
  if (!isCashier) return { allowed: true, maxPercent: null, cap: Infinity };

  // A missing setting means "allowed" (matches the store-setting default).
  const allowed = settings?.allow_cashier_discount !== false;
  if (!allowed) return { allowed: false, maxPercent: null, cap: 0 };

  const raw = settings?.max_discount_percent;
  const pct = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if (pct === null || !Number.isFinite(pct)) return { allowed: true, maxPercent: null, cap: Infinity };

  const safeSubtotal = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  return { allowed: true, maxPercent: pct, cap: (safeSubtotal * pct) / 100 };
}

/** Clamp a requested discount (₦) to what the rule permits: never negative, never above the cap. */
export function clampDiscount(requested: number, rule: DiscountRule): number {
  if (!rule.allowed) return 0;
  const v = Number.isFinite(requested) ? Math.max(0, requested) : 0;
  return Math.min(v, rule.cap);
}
