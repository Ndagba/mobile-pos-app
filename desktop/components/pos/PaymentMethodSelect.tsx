'use client';

import type { PaymentMethod } from '@jaypos/shared';
import { cn } from '@/lib/utils';

/** Backend payment methods. */
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'split', label: 'Split' },
];

export function PaymentMethodSelect({
  value,
  onChange,
}: {
  value: PaymentMethod | null;
  onChange: (m: PaymentMethod) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted-foreground">Payment method</p>
      <div className="grid grid-cols-4 gap-2">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className={cn(
              'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              value === m.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-input hover:bg-accent'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
