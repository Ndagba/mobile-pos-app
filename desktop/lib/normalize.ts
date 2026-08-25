import type { Customer, Product } from '@jaypos/shared';

/**
 * Backend serialises money and quantities as Decimal **strings** (Prisma
 * `Decimal(15,2)` / `Decimal(15,4)`). The cart math and inventory helpers expect
 * real numbers, so every value that flows into them is coerced here at the edge —
 * once, on the way in — rather than sprinkling `Number()` through the UI.
 */

/** Coerce a Decimal-string / number / null to a finite number, or `undefined`. */
export function numify(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/** Like `numify` but defaults to 0 — for quantities/totals where absent means zero. */
export function numOr0(v: unknown): number {
  return numify(v) ?? 0;
}

type Raw = Record<string, any>;

/**
 * Normalise a raw product row: money → numbers, `tax_rate` → number (percent,
 * default 0), and the `inventory` block's quantities/thresholds → numbers.
 * SERVICE items carry a null `inventory`, which is preserved so `tracksInventory`
 * still sees them. `quantity_on_hand` defaults to 0; the rest stay `undefined`
 * when absent so callers can apply their own defaults (e.g. threshold ?? 10).
 */
export function normalizeProduct(raw: Raw): Product {
  return {
    ...(raw as Product),
    effective_price: numify(raw.effective_price),
    marked_price: numify(raw.marked_price),
    unit_price: numify(raw.unit_price),
    cost_price: numify(raw.cost_price),
    tax_rate: numify(raw.tax_rate) ?? 0,
    inventory: raw.inventory
      ? {
          ...raw.inventory,
          quantity_on_hand: numOr0(raw.inventory.quantity_on_hand),
          quantity_reserved: numify(raw.inventory.quantity_reserved),
          low_stock_threshold: numify(raw.inventory.low_stock_threshold),
          reorder_point: numify(raw.inventory.reorder_point),
        }
      : (raw.inventory ?? null),
  };
}

/**
 * A customer with derived credit fields.
 *
 * `available_credit` mirrors mobile's live credit check exactly
 * (CheckoutScreen.handleSelectCustomer): `credit_limit − total_spent`. A null
 * `credit_limit` means unlimited credit → `available_credit` is null and no
 * warning is ever shown. This is intentionally NOT payments-adjusted — matching
 * mobile so the soft warning fires on the same threshold on both clients.
 */
export interface NormalizedCustomer extends Customer {
  credit_limit: number | null;
  total_spent: number;
  available_credit: number | null;
}

/** Full display name from first/last (falls back to `name`, then a placeholder). */
export function customerDisplayName(c: Pick<Customer, 'name' | 'first_name' | 'last_name'>): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return full || c.name || 'Walk-in customer';
}

export function normalizeCustomer(raw: Raw): NormalizedCustomer {
  const total_spent = numOr0(raw.total_spent);
  const credit_limit =
    raw.credit_limit === null || raw.credit_limit === undefined
      ? null
      : (numify(raw.credit_limit) ?? null);

  return {
    ...(raw as Customer),
    total_spent,
    credit_limit,
    transaction_count: numOr0(raw.transaction_count),
    available_credit: credit_limit === null ? null : credit_limit - total_spent,
  };
}
