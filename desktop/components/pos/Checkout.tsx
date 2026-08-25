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
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';
import { getDeviceId } from '@/lib/deviceId';
import { useNetworkStatus } from '@/lib/useNetwork';
import { customerDisplayName } from '@/lib/normalize';
import { useAuthStore } from '@/store/authStore';
import { useCartStore, useCartTotals } from '@/store/cartStore';
import { CustomerPicker } from './CustomerPicker';
import { PaymentMethodSelect } from './PaymentMethodSelect';
import { ReceiptModal, type ReceiptData } from './ReceiptModal';

const paymentLabel = (pm: PaymentMethod): string =>
  pm === 'mobile_wallet' ? 'Transfer' : pm === 'card' ? 'Card' : 'Cash';

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // Soft credit warning (mobile parity): only when the customer has a finite
  // available credit that this sale would exceed. Never blocks the sale.
  const creditWarn =
    customer?.available_credit != null && customer.available_credit < totals.total;

  const canCharge = items.length > 0 && !!paymentMethod && !busy;

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

    setError(null);
    setBusy(true);
    try {
      const draft = buildTransactionInput(items, {
        store_id: user.store_id,
        branch_id: user.branch_id ?? '',
        customer_id: customer?.id,
        discount_amount: discount,
        payment_method: paymentMethod,
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
        customerName: customer ? customerDisplayName(customer) : undefined,
        storeLabel: 'JayPOS',
        branchLabel: user.branch_name ?? `Store ${user.store_id}`,
        footer: 'Thank you for your purchase!',
        at: new Date(),
      });

      clear();
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

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <Button className="w-full" size="lg" disabled={!canCharge} onClick={handleCharge}>
        {busy ? 'Processing…' : `Charge ${naira(totals.total)}`}
      </Button>

      <ReceiptModal data={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
