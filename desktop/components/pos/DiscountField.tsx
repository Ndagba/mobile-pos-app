'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCartStore, useCartTotals } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useSettings } from '@/hooks/useSettings';

/**
 * Flat store-level discount (₦), applied to the total after tax. For cashiers the
 * discount can be disabled (`allow_cashier_discount`) or capped to a share of the
 * subtotal (`max_discount_percent`); admins/managers are never limited.
 */
export function DiscountField() {
  const discount = useCartStore((s) => s.discount_amount);
  const setDiscount = useCartStore((s) => s.setDiscount);
  const totals = useCartTotals();
  const user = useAuthStore((s) => s.user);
  const { settings } = useSettings();

  const isCashier = user?.role === 'cashier' && !user?.is_super_admin;
  const allowed = !isCashier || settings?.allow_cashier_discount !== false;
  const maxPct = isCashier ? settings?.max_discount_percent ?? null : null;
  const cap = maxPct != null ? (totals.subtotal * maxPct) / 100 : Infinity;

  const onChange = (raw: string) => {
    const v = Math.max(0, parseFloat(raw) || 0);
    setDiscount(Math.min(v, cap));
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="discount" className="text-sm font-medium text-text-muted">
        Discount (₦)
        {maxPct != null && <span className="ml-1 text-2xs text-text-faint">max {maxPct}%</span>}
      </Label>
      <Input
        id="discount"
        type="number"
        min={0}
        inputMode="decimal"
        value={discount || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={!allowed}
        title={allowed ? undefined : 'Discounts are disabled for cashiers'}
        className="h-9 w-28 text-right font-mono tabular-nums"
        placeholder={allowed ? '0' : '—'}
      />
    </div>
  );
}
