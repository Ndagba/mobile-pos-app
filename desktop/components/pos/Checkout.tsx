'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  buildTransactionInput,
  createTransaction,
  naira,
  type PaymentMethod,
} from '@jaypos/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { getDeviceId } from '@/lib/deviceId';
import { useNetworkStatus } from '@/lib/useNetwork';
import { customerDisplayName } from '@/lib/normalize';
import { useAuthStore } from '@/store/authStore';
import { useBranchStore } from '@/store/branchStore';
import { useCartStore, useCartTotals } from '@/store/cartStore';
import { CustomerPicker } from './CustomerPicker';
import { PaymentMethodSelect } from './PaymentMethodSelect';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';

const paymentLabel = (pm: PaymentMethod): string =>
  pm === 'transfer' ? 'Transfer' : pm === 'card' ? 'Card' : pm === 'split' ? 'Split' : 'Cash';

/**
 * Checkout controls, rendered inside `CartPanel` (its `children` seam): customer
 * picker, soft credit warning, payment method, and the charge button — plus the
 * receipt modal shown on success.
 *
 * The sale is built with the shared `buildTransactionInput` (identical math to
 * mobile, which the backend trusts) and finalized with the shared
 * `createTransaction`, which posts online / persists to Dexie offline. Online
 * connectivity comes from the live `useNetworkStatus()` (navigator) so an offline
 * charge skips a doomed POST and queues immediately.
 */
export function Checkout({ onCompleted }: { onCompleted?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const online = useNetworkStatus();

  const items = useCartStore((s) => s.items);
  const discount = useCartStore((s) => s.discount_amount);
  const customer = useCartStore((s) => s.customer);
  const paymentMethod = useCartStore((s) => s.payment_method);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const setPaymentMethod = useCartStore((s) => s.setPaymentMethod);
  const clear = useCartStore((s) => s.clear);
  const totals = useCartTotals();

  const [splitCash, setSplitCash] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitTransfer, setSplitTransfer] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const numCash = Math.max(0, Number(splitCash) || 0);
  const numCard = Math.max(0, Number(splitCard) || 0);
  const numTransfer = Math.max(0, Number(splitTransfer) || 0);
  const totalEntered = +(numCash + numCard + numTransfer).toFixed(2);
  const remaining = +(totals.total - totalEntered).toFixed(2);
  const isSplit = paymentMethod === 'split';
  const isSplitValid = isSplit ? Math.abs(remaining) < 0.01 && totalEntered > 0 : true;

  // Soft credit warning (mobile parity): only when the customer has a finite
  // available credit that this sale would exceed. Never blocks the sale.
  const creditWarn =
    customer?.available_credit != null && customer.available_credit < totals.total;

  const canCharge = items.length > 0 && !!paymentMethod && !busy && (!isSplit || isSplitValid);

  const handleCharge = async () => {
    if (items.length === 0 || busy) return;
    if (!paymentMethod) {
      setError('Select a payment method.');
      return;
    }
    if (!user) {
      setError('You are not signed in.');
      return;
    }

    const selectedBranchId = useBranchStore.getState().selectedBranchId;
    const effectiveBranchId = selectedBranchId ?? user.branch_id;

    if (!effectiveBranchId) {
      setError('Please select a branch before charging.');
      return;
    }

    if (isSplit && !isSplitValid) {
      if (remaining > 0.009) {
        setError(`Underpayment: ${naira(remaining)} remaining. Please enter full payment amount.`);
      } else {
        setError(`Overpayment: Entered amount exceeds sale total by ${naira(Math.abs(remaining))}. Split payment must match total exactly.`);
      }
      return;
    }

    const paymentSplits = isSplit
      ? { cash: numCash, card: numCard, transfer: numTransfer }
      : undefined;

    setError(null);
    setBusy(true);
    try {
      const draft = buildTransactionInput(items, {
        store_id: user.store_id,
        branch_id: effectiveBranchId,
        customer_id: customer?.id,
        discount_amount: discount,
        payment_method: paymentMethod,
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
        paymentLabel: paymentLabel(paymentMethod),
        paymentSplits: paymentSplits,
        customerName: customer ? customerDisplayName(customer) : undefined,
        storeLabel: 'JayPOS',
        branchLabel: user.branch_name ?? `Store ${user.store_id}`,
        footer: 'Thank you for your purchase!',
        at: new Date(),
      });

      clear();
      setSplitCash('');
      setSplitCard('');
      setSplitTransfer('');
      onCompleted?.();
    } catch (e) {
      // createTransaction rethrows only errors that carried an HTTP response —
      // i.e. the server rejected the sale (403 no subscription, 400 stock, …).
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
    <div className="space-y-3">
      <CustomerPicker customer={customer} onSelect={setCustomer} />

      {creditWarn && (
        <div className="flex items-start gap-2 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This sale exceeds the customer’s available credit (
            {naira(customer!.available_credit!)}). You can still proceed.
          </span>
        </div>
      )}

      <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />

      {paymentMethod === 'split' && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3 text-sm">
          <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
            Split Payment Amounts
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="split-cash" className="w-16 text-xs font-medium">Cash</Label>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₦</span>
                <Input
                  id="split-cash"
                  type="number"
                  step="any"
                  min="0"
                  value={splitCash}
                  onChange={(e) => setSplitCash(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-9 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="split-card" className="w-16 text-xs font-medium">Card</Label>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₦</span>
                <Input
                  id="split-card"
                  type="number"
                  step="any"
                  min="0"
                  value={splitCard}
                  onChange={(e) => setSplitCard(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-9 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="split-transfer" className="w-16 text-xs font-medium">Transfer</Label>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₦</span>
                <Input
                  id="split-transfer"
                  type="number"
                  step="any"
                  min="0"
                  value={splitTransfer}
                  onChange={(e) => setSplitTransfer(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 h-9 text-sm tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-2 space-y-1 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Sale Total:</span>
              <span className="tabular-nums font-medium text-foreground">{naira(totals.total)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Amount Entered:</span>
              <span className="tabular-nums font-medium text-foreground">{naira(totalEntered)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{remaining < 0 ? 'Overpaid:' : 'Remaining:'}</span>
              <span
                className={cn(
                  'tabular-nums',
                  Math.abs(remaining) < 0.01
                    ? 'text-emerald-600'
                    : remaining > 0
                    ? 'text-amber-600'
                    : 'text-destructive'
                )}
              >
                {naira(Math.abs(remaining))}
              </span>
            </div>
          </div>

          {isSplit && (splitCash || splitCard || splitTransfer) && !isSplitValid && (
            <p className={cn(
              "text-xs font-medium rounded p-1.5",
              remaining > 0 ? "bg-amber-100 text-amber-800" : "bg-destructive/10 text-destructive"
            )}>
              {remaining > 0
                ? `Underpayment: ${naira(remaining)} remaining to complete total.`
                : `Overpayment: Entered amount exceeds sale total by ${naira(Math.abs(remaining))}. Split payment must match total exactly.`}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <Button className="w-full" size="lg" disabled={!canCharge} onClick={handleCharge}>
        {busy ? 'Processing…' : `Charge ${naira(totals.total)}`}
      </Button>

      <ReceiptModal
        data={receipt}
        onClose={() => {
          setReceipt(null);
          onCompleted?.();
        }}
      />
    </div>
  );
}
