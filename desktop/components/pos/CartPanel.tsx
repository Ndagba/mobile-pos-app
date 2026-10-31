'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2, Pause, CreditCard, Clock, RotateCcw } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { toast } from 'sonner';
import { useCartStore, useCartTotals } from '@/store/cartStore';
import { useShortcut } from '@/hooks/useShortcuts';
import { holdSale, listHeldSales, deleteHeldSale, type HeldSale } from '@/lib/heldSales';
import { CartLineItem } from './CartLineItem';
import { DiscountField } from './DiscountField';
import { CustomerPicker } from './CustomerPicker';
import { PaymentModal } from './PaymentModal';
import { cn } from '@/lib/utils';

function SummaryRow({ label, value, muted = true }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? 'text-text-muted' : 'text-ink-2'}>{label}</span>
      <span className={cn('font-mono tabular-nums', muted ? 'text-ink-2' : 'text-ink')}>{value}</span>
    </div>
  );
}

/**
 * The cart column (handoff §4.3): customer attach row, scrollable line items, then
 * the totals footer (VAT on its own line, total rounded to whole ₦) with Hold (F4)
 * and Pay (F9). Hold parks the sale to Dexie; the Held list resumes or discards one.
 */
export function CartPanel({ onCompleted }: { onCompleted?: () => void }) {
  const items = useCartStore((s) => s.items);
  const discount = useCartStore((s) => s.discount_amount);
  const customer = useCartStore((s) => s.customer);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const loadFrom = useCartStore((s) => s.loadFrom);
  const clear = useCartStore((s) => s.clear);
  const totals = useCartTotals();

  const [payOpen, setPayOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [held, setHeld] = useState<HeldSale[]>([]);

  const refreshHeld = useCallback(() => {
    listHeldSales().then(setHeld).catch(() => {});
  }, []);
  useEffect(() => refreshHeld(), [refreshHeld]);

  const handleHold = useCallback(() => {
    if (useCartStore.getState().items.length === 0) return;
    const s = useCartStore.getState();
    holdSale({ items: s.items, discount_amount: s.discount_amount, customer: s.customer })
      .then(() => {
        clear();
        refreshHeld();
        toast.success('Sale held');
      })
      .catch(() => toast.error('Could not hold the sale'));
  }, [clear, refreshHeld]);

  const handlePay = useCallback(() => {
    if (useCartStore.getState().items.length > 0) setPayOpen(true);
  }, []);

  useShortcut('hold', handleHold);
  useShortcut('pay', handlePay);

  const resume = async (sale: HeldSale) => {
    loadFrom({ items: sale.items, discount_amount: sale.discount_amount, customer: sale.customer });
    await deleteHeldSale(sale.id);
    refreshHeld();
    setHeldOpen(false);
  };

  return (
    <div className="relative flex h-full w-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-divider px-4 py-3">
        <div>
          <h2 className="text-md font-bold text-ink">Current sale</h2>
          <p className="text-2xs text-text-muted">{items.length} item{items.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHeldOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-text-muted hover:bg-surface-subtle"
          >
            <Clock className="h-3.5 w-3.5" /> Held
            {held.length > 0 && (
              <span className="rounded-pill bg-muted px-1.5 font-mono text-2xs">{held.length}</span>
            )}
          </button>
          <button
            type="button"
            disabled={items.length === 0}
            onClick={clear}
            className="rounded-md p-1.5 text-text-muted hover:text-danger disabled:opacity-40"
            aria-label="Clear cart"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Customer */}
      <div className="border-b border-divider px-4 py-3">
        <CustomerPicker customer={customer} onSelect={setCustomer} />
      </div>

      {/* Items */}
      <div className="min-h-0 flex-1 overflow-auto px-4">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-12 text-center">
            <CreditCard className="h-8 w-8 text-text-faint" />
            <p className="text-sm font-medium text-ink-2">No items yet</p>
            <p className="text-xs text-text-muted">Scan, type to search, or click a product tile.</p>
          </div>
        ) : (
          <div className="divide-y divide-divider">
            {items.map((line) => (
              <CartLineItem key={line.product_id} line={line} onQuantity={updateQuantity} onRemove={removeItem} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="space-y-3 border-t border-divider p-4">
        <DiscountField />
        <div className="space-y-1.5">
          <SummaryRow label="Subtotal" value={naira(totals.subtotal)} />
          {totals.discount_amount > 0 && (
            <SummaryRow label="Discount" value={`− ${naira(totals.discount_amount)}`} />
          )}
          <SummaryRow label="VAT 7.5%" value={naira(totals.tax_amount)} />
          <div className="flex items-center justify-between border-t border-divider pt-2">
            <span className="text-sm font-bold text-ink">Total</span>
            <span className="font-mono text-xl font-bold tabular-nums text-ink">{naira(totals.total)}</span>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2">
          <button
            type="button"
            disabled={items.length === 0}
            onClick={handleHold}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border-strong text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-subtle disabled:opacity-40"
          >
            <Pause className="h-4 w-4" /> Hold
            <kbd className="rounded-chip border border-border-strong px-1 font-mono text-[10px]">F4</kbd>
          </button>
          <button
            type="button"
            disabled={items.length === 0}
            onClick={handlePay}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Charge {naira(totals.total)}
            <kbd className="rounded-chip bg-white/20 px-1 font-mono text-[10px]">F9</kbd>
          </button>
        </div>
      </div>

      {/* Held sales panel */}
      {heldOpen && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setHeldOpen(false)} aria-hidden />
          <div className="absolute right-3 top-14 z-30 w-[300px] overflow-hidden rounded-modal border border-border bg-popover shadow-modal">
            <div className="border-b border-divider px-3 py-2 text-sm font-bold text-ink">Held sales</div>
            <div className="max-h-[320px] overflow-y-auto">
              {held.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">No held sales</p>
              ) : (
                held.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 border-b border-divider px-3 py-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-2">{s.label}</p>
                      <p className="text-2xs text-text-muted">
                        {s.items.length} item{s.items.length === 1 ? '' : 's'} ·{' '}
                        {new Date(s.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => resume(s)}
                      className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-subtle"
                    >
                      <RotateCcw className="h-3 w-3" /> Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteHeldSale(s.id).then(refreshHeld)}
                      className="rounded-md p-1 text-text-muted hover:text-danger"
                      aria-label="Discard held sale"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} onCompleted={onCompleted} />
    </div>
  );
}
