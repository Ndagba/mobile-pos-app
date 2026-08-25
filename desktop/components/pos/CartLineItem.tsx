'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { canIncrementQuantity, naira } from '@jaypos/shared';
import { Button } from '@/components/ui/button';
import type { CartLine } from '@/store/cartStore';

/** One cart line: name, unit price, quantity stepper, line total, remove. */
export function CartLineItem({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const lineTotal = line.unit_price * line.quantity;
  const canInc = canIncrementQuantity(line, line.quantity);

  return (
    <div className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.product_name}</p>
        <p className="text-xs text-muted-foreground">{naira(line.unit_price)} each</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onQuantity(line.product_id, line.quantity - 1)}
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={!canInc}
          onClick={() => onQuantity(line.product_id, line.quantity + 1)}
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="w-20 text-right text-sm font-medium tabular-nums">{naira(lineTotal)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(line.product_id)}
        aria-label="Remove item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
