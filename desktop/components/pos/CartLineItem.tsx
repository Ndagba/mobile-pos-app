'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { canIncrementQuantity, naira } from '@jaypos/shared';
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
    <div className="flex items-center gap-2 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-2">{line.product_name}</p>
        <p className="font-mono text-2xs text-text-muted">{naira(line.unit_price)} each</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onQuantity(line.product_id, line.quantity - 1)}
          aria-label="Decrease quantity"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border-strong text-ink-2 hover:bg-surface-subtle"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-8 text-center font-mono text-sm tabular-nums text-ink">{line.quantity}</span>
        <button
          type="button"
          disabled={!canInc}
          onClick={() => onQuantity(line.product_id, line.quantity + 1)}
          aria-label="Increase quantity"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border-strong text-ink-2 hover:bg-surface-subtle disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="w-20 text-right font-mono text-sm font-semibold tabular-nums text-ink">{naira(lineTotal)}</span>
      <button
        type="button"
        onClick={() => onRemove(line.product_id)}
        aria-label="Remove item"
        className="rounded-md p-1 text-text-muted hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
