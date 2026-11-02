'use client';

import { Printer } from 'lucide-react';
import { naira } from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ReceiptLine {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/**
 * Snapshot of a completed sale, captured at charge time (the cart is cleared
 * immediately after, so the modal cannot read live cart state).
 */
export interface ReceiptData {
  status: 'completed' | 'queued_for_sync' | 'offline';
  receiptNumber: string;
  lines: ReceiptLine[];
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  paymentLabel: string;
  paymentSplits?: {
    cash: number;
    card: number;
    transfer: number;
  };
  customerName?: string;
  storeLabel: string;
  branchLabel: string;
  footer: string;
  at: Date;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn('flex justify-between', bold && 'font-semibold')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * On-screen receipt (Phase 6 adds thermal printing). Replicates the mobile
 * plaintext receipt content: store/branch header, receipt no./date, lines as
 * `qty x ₦unit … ₦line_total`, then subtotal/VAT/discount/TOTAL, payment, footer.
 *
 * A synced sale shows its server `receipt_number`; an offline/queued sale shows
 * its client transaction id and a "will sync" note (mobile parity).
 */
export function ReceiptModal({ data, onClose }: { data: ReceiptData | null; onClose: () => void }) {
  if (!data) return null;
  const synced = data.status === 'completed';

  return (
    <Modal open onClose={onClose} title="Receipt">
      {/* Flex column bounded to the modal: the receipt scrolls, the action bar
          stays pinned so "Done"/"Print" are never clipped on a long receipt. */}
      <div className="flex max-h-[calc(90vh-56px)] flex-col print:max-h-none print:overflow-visible">
        <div className="flex-1 space-y-4 overflow-y-auto p-5 print:overflow-visible">
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              synced ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
            )}
          >
            {synced ? 'Sale completed.' : 'Saved offline — it will sync when you’re back online.'}
          </div>

          <div
            id="receipt-print"
            className="rounded-lg border border-divider bg-surface-subtle p-4 font-mono text-xs leading-relaxed text-ink-2"
          >
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">{data.storeLabel}</p>
              <p className="text-text-muted">{data.branchLabel}</p>
            </div>

            <div className="my-2 border-t border-dashed border-border-strong" />
            <p>Receipt: {data.receiptNumber}</p>
            <p>Date: {data.at.toLocaleString()}</p>
            {data.customerName && <p>Customer: {data.customerName}</p>}
            <p>Payment: {data.paymentLabel}</p>
            {data.paymentSplits && (
              <div className="space-y-0.5 pl-2 text-text-muted">
                {data.paymentSplits.cash > 0 && <p>• Cash: {naira(data.paymentSplits.cash)}</p>}
                {data.paymentSplits.card > 0 && <p>• Card: {naira(data.paymentSplits.card)}</p>}
                {data.paymentSplits.transfer > 0 && <p>• Transfer: {naira(data.paymentSplits.transfer)}</p>}
              </div>
            )}

            <div className="my-2 border-t border-dashed border-border-strong" />
            {data.lines.map((l, i) => (
              <div key={i} className="mb-1">
                <p className="truncate">{l.name}</p>
                <div className="flex justify-between text-text-muted">
                  <span>
                    {l.quantity} x {naira(l.unit_price)}
                  </span>
                  <span className="tabular-nums text-ink">{naira(l.line_total)}</span>
                </div>
              </div>
            ))}

            <div className="my-2 border-t border-dashed border-border-strong" />
            <Row label="Subtotal" value={naira(data.subtotal)} />
            <Row label="VAT" value={naira(data.tax_amount)} />
            {data.discount_amount > 0 && (
              <Row label="Discount" value={`- ${naira(data.discount_amount)}`} />
            )}
            <Row label="TOTAL" value={naira(data.total)} bold />

            <div className="my-2 border-t border-dashed border-border-strong" />
            <p className="text-center text-text-muted">{data.footer}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-divider p-4">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
