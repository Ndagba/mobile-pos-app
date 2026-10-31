'use client';

import { useMemo, useState } from 'react';
import { Banknote, CreditCard, ArrowLeftRight, Split, Check } from 'lucide-react';
import {
  buildTransactionInput,
  createTransaction,
  naira,
  type PaymentMethod,
} from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { getDeviceId } from '@/lib/deviceId';
import { useNetworkStatus } from '@/lib/useNetwork';
import { customerDisplayName } from '@/lib/normalize';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useCartStore, useCartTotals } from '@/store/cartStore';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';

const TILES: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { value: 'split', label: 'Split', icon: Split },
];

const paymentLabel = (pm: PaymentMethod): string =>
  pm === 'transfer' ? 'Transfer' : pm === 'card' ? 'Card' : pm === 'split' ? 'Split' : 'Cash';

/** Suggested cash tender amounts at or above the total (handoff §4.3 quick amounts). */
function quickAmounts(total: number): number[] {
  const rounded = Math.ceil(total);
  const ups = [500, 1000, 2000, 5000].map((step) => Math.ceil(total / step) * step);
  return Array.from(new Set([rounded, ...ups])).filter((v) => v >= total).slice(0, 4);
}

/**
 * Payment modal (handoff §4.3). Method tiles; Cash shows a tendered input, quick
 * amounts and change; Split needs ≥2 methods summing to at least the total (any
 * overpay on cash becomes change). Completing builds the sale with the shared
 * `buildTransactionInput`/`createTransaction` (online POST / offline Dexie queue).
 */
export function PaymentModal({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const online = useNetworkStatus();

  const items = useCartStore((s) => s.items);
  const discount = useCartStore((s) => s.discount_amount);
  const customer = useCartStore((s) => s.customer);
  const clear = useCartStore((s) => s.clear);
  const totals = useCartTotals();

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitTransfer, setSplitTransfer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const quick = useMemo(() => quickAmounts(totals.total), [totals.total]);

  const numTendered = Math.max(0, Number(tendered) || 0);
  const cashChange = method === 'cash' ? Math.max(0, +(numTendered - totals.total).toFixed(2)) : 0;
  const cashValid = method !== 'cash' || numTendered === 0 || numTendered >= totals.total;

  const numCash = Math.max(0, Number(splitCash) || 0);
  const numCard = Math.max(0, Number(splitCard) || 0);
  const numTransfer = Math.max(0, Number(splitTransfer) || 0);
  const splitSum = +(numCash + numCard + numTransfer).toFixed(2);
  const splitMethods = [numCash, numCard, numTransfer].filter((n) => n > 0).length;
  const splitRemaining = +(totals.total - splitSum).toFixed(2);
  const splitChange = Math.max(0, +(splitSum - totals.total).toFixed(2));
  const splitValid = method === 'split' ? splitMethods >= 2 && splitSum >= totals.total - 0.01 : true;

  const canComplete =
    items.length > 0 && !busy && (method === 'split' ? splitValid : cashValid);

  const reset = () => {
    setTendered('');
    setSplitCash('');
    setSplitCard('');
    setSplitTransfer('');
    setError(null);
    setMethod('cash');
  };

  const handleComplete = async () => {
    if (!canComplete || !user) {
      if (!user) setError('You are not signed in.');
      return;
    }
    const selectedBranchId = useBranchStore.getState().selectedBranchId;
    const effectiveBranchId = selectedBranchId ?? user.branch_id;
    if (!effectiveBranchId) {
      setError('Please select a branch before charging.');
      return;
    }

    const paymentSplits =
      method === 'split' ? { cash: numCash, card: numCard, transfer: numTransfer } : undefined;

    setError(null);
    setBusy(true);
    try {
      const draft = buildTransactionInput(items, {
        store_id: user.store_id,
        branch_id: effectiveBranchId,
        customer_id: customer?.id,
        discount_amount: discount,
        payment_method: method,
        payment_splits: paymentSplits,
      });

      const result = await createTransaction(draft, {
        api: apiClient,
        store: offlineStore,
        deviceId: getDeviceId(),
        isOnline: online,
      });

      setReceipt({
        status: result.status,
        receiptNumber: result.receipt_number || result.transaction_id,
        lines: draft.items.map((it) => ({
          name: it.product_name ?? '',
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total ?? it.unit_price * it.quantity,
        })),
        subtotal: draft.subtotal,
        tax_amount: draft.tax_amount,
        discount_amount: draft.discount_amount,
        total: draft.total_amount,
        paymentLabel: paymentLabel(method),
        paymentSplits,
        customerName: customer ? customerDisplayName(customer) : undefined,
        storeLabel: 'JayPOS',
        branchLabel: user.branch_name ?? `Store ${user.store_id}`,
        footer: 'Thank you for your purchase!',
        at: new Date(),
      });

      clear();
      reset();
      onClose();
      onCompleted?.();
    } catch (e) {
      const err = e as { response?: { data?: { message?: string; error?: string } } };
      setError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Could not complete the sale. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Payment" className="max-w-[460px]">
        <div className="space-y-4 p-5">
          {/* Amount due */}
          <div className="rounded-card bg-surface-subtle p-4 text-center">
            <p className="text-2xs font-semibold uppercase tracking-wide text-text-muted">Amount due</p>
            <p className="mt-1 font-mono text-total font-semibold text-ink">{naira(totals.total)}</p>
          </div>

          {/* Method tiles */}
          <div className="grid grid-cols-4 gap-2">
            {TILES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setMethod(t.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border py-3 text-xs font-semibold transition-colors',
                  method === t.value
                    ? 'border-primary bg-primary-soft text-primary-ink'
                    : 'border-border-strong text-ink-2 hover:bg-surface-subtle'
                )}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Cash */}
          {method === 'cash' && (
            <div className="space-y-2.5">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">₦</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                  placeholder="Amount tendered"
                  className="pl-7 font-mono tabular-nums"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {quick.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTendered(String(amt))}
                    className="rounded-md border border-border-strong py-1.5 font-mono text-xs text-ink-2 hover:bg-surface-subtle"
                  >
                    {naira(amt)}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-md bg-surface-subtle px-3 py-2 text-sm">
                <span className="text-text-muted">Change</span>
                <span className="font-mono font-semibold text-success">{naira(cashChange)}</span>
              </div>
            </div>
          )}

          {/* Split */}
          {method === 'split' && (
            <div className="space-y-2.5">
              {[
                { label: 'Cash', value: splitCash, set: setSplitCash },
                { label: 'Card', value: splitCard, set: setSplitCard },
                { label: 'Transfer', value: splitTransfer, set: setSplitTransfer },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="w-16 text-xs font-semibold text-ink-2">{row.label}</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">₦</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={row.value}
                      onChange={(e) => row.set(e.target.value)}
                      placeholder="0"
                      className="h-9 pl-7 font-mono tabular-nums"
                    />
                  </div>
                </div>
              ))}
              <div className="space-y-1 rounded-md bg-surface-subtle px-3 py-2 text-sm">
                <div className="flex justify-between text-text-muted">
                  <span>Entered</span>
                  <span className="font-mono text-ink-2">{naira(splitSum)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className={splitRemaining > 0.01 ? 'text-warning' : 'text-success'}>
                    {splitRemaining > 0.01 ? 'Remaining' : 'Change'}
                  </span>
                  <span
                    className={cn(
                      'font-mono',
                      splitRemaining > 0.01 ? 'text-warning' : 'text-success'
                    )}
                  >
                    {naira(splitRemaining > 0.01 ? splitRemaining : splitChange)}
                  </span>
                </div>
              </div>
              {splitMethods < 2 && (
                <p className="text-xs text-text-muted">Enter amounts for at least two methods.</p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{error}</div>
          )}

          <button
            type="button"
            disabled={!canComplete}
            onClick={handleComplete}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {busy ? 'Processing…' : `Complete · ${naira(totals.total)}`}
          </button>
        </div>
      </Modal>

      <ReceiptModal
        data={receipt}
        onClose={() => {
          setReceipt(null);
          onCompleted?.();
        }}
      />
    </>
  );
}
