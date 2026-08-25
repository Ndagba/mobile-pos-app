'use client';

import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { Button } from '@/components/ui/button';
import { useCartStore, useCartTotals } from '@/store/cartStore';
import { CartLineItem } from './CartLineItem';
import { DiscountField } from './DiscountField';

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/**
 * The cart column: line items (scrollable) over a sticky footer with the
 * discount field, live totals, and — via `children` — the checkout controls
 * that Phase 2D drops in (customer picker, payment method, charge button).
 */
export function CartPanel({ children }: { children?: ReactNode }) {
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);
  const totals = useCartTotals();

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">
          Cart {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={items.length === 0}
          onClick={clear}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Cart is empty. Tap a product to add it.
          </p>
        ) : (
          <div className="divide-y">
            {items.map((line) => (
              <CartLineItem
                key={line.product_id}
                line={line}
                onQuantity={updateQuantity}
                onRemove={removeItem}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t p-4">
        <DiscountField />
        <div className="space-y-1 text-sm">
          <SummaryRow label="Subtotal" value={naira(totals.subtotal)} />
          <SummaryRow label="VAT" value={naira(totals.tax_amount)} />
          {totals.discount_amount > 0 && (
            <SummaryRow label="Discount" value={`− ${naira(totals.discount_amount)}`} />
          )}
          <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{naira(totals.total)}</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
