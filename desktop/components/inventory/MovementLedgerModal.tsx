'use client';

import type { Product } from '@jaypos/shared';
import {
  ArrowDownRight,
  ArrowUpRight,
  SlidersHorizontal,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useMovements, type MovementRow } from '@/hooks/useMovements';

/** Icon + colour per movement type (sale/purchase/adjustment/transfer). */
const TYPE_META: Record<string, { icon: LucideIcon; className: string }> = {
  sale: { icon: ArrowDownRight, className: 'bg-blue-100 text-blue-700' },
  purchase: { icon: ArrowUpRight, className: 'bg-emerald-100 text-emerald-700' },
  adjustment: { icon: SlidersHorizontal, className: 'bg-amber-100 text-amber-700' },
  transfer: { icon: ArrowLeftRight, className: 'bg-purple-100 text-purple-700' },
};

function userName(m: MovementRow): string {
  const full = [m.user?.first_name, m.user?.last_name].filter(Boolean).join(' ').trim();
  return full || 'System';
}

function formatWhen(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

/**
 * The movement ledger for one product. Note that manual stock adjustments are not
 * written to this ledger by the backend — only sales and stock-count
 * reconciliations are — so the empty state says so to avoid confusion.
 */
export function MovementLedgerModal({
  product,
  open,
  onClose,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useMovements({ productId: product?.id, enabled: open });
  const movements = data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Movements — ${product?.name ?? ''}`}
      className="max-w-lg"
    >
      <div className="max-h-[70vh] overflow-auto px-4 py-4">
        {isLoading && movements.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : movements.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No movements yet. Manual stock adjustments aren&apos;t recorded here — only sales and
            stock-count reconciliations are.
          </p>
        ) : (
          <ul className="space-y-2">
            {movements.map((m) => {
              const meta = TYPE_META[m.movement_type] ?? {
                icon: SlidersHorizontal,
                className: 'bg-muted text-muted-foreground',
              };
              const Icon = meta.icon;
              const positive = m.quantity >= 0;
              return (
                <li
                  key={m.id}
                  className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      meta.className
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{m.movement_type}</span>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          positive ? 'text-emerald-700' : 'text-destructive'
                        )}
                      >
                        {positive ? '+' : ''}
                        {m.quantity}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatWhen(m.timestamp)} · {userName(m)}
                    </div>
                    {m.notes && <div className="mt-0.5 text-xs text-muted-foreground">{m.notes}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
