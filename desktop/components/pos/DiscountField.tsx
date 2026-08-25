'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCartStore } from '@/store/cartStore';

/** Flat store-level discount (₦), applied to the total after tax. */
export function DiscountField() {
  const discount = useCartStore((s) => s.discount_amount);
  const setDiscount = useCartStore((s) => s.setDiscount);

  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="discount" className="text-sm text-muted-foreground">
        Discount (₦)
      </Label>
      <Input
        id="discount"
        type="number"
        min={0}
        inputMode="decimal"
        value={discount || ''}
        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
        className="h-8 w-28 text-right"
        placeholder="0"
      />
    </div>
  );
}
