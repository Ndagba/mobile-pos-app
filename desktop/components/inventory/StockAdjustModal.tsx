'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@jaypos/shared';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { numOr0 } from '@/lib/normalize';
import { lowStockThreshold } from '@/lib/inventory';
import { apiErrorMessage } from '@/lib/errors';
import { useAdjustStock } from '@/hooks/useAdjustStock';

/**
 * Adjust a product's stock by a signed delta (with a reason) and/or change its
 * low-stock threshold. Mirrors mobile: the delta may be negative, a reason is
 * required whenever the quantity changes, and the client blocks a reduction that
 * would take on-hand below zero (the backend also rejects it, 400). SERVICE items
 * have no stock, so the modal is only opened for products.
 */
export function StockAdjustModal({
  product,
  open,
  onClose,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const adjust = useAdjustStock();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('restock');
  const [threshold, setThreshold] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onHand = numOr0(product?.inventory?.quantity_on_hand);
  const currentThreshold = product ? lowStockThreshold(product) : 0;

  useEffect(() => {
    if (open) {
      setDelta('');
      setReason('restock');
      setThreshold(String(currentThreshold));
      setError(null);
    }
    // Reset when the modal opens for a (possibly different) product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  if (!product) return null;

  const deltaNum = delta.trim() === '' ? 0 : Number(delta);
  const thresholdNum = threshold.trim() === '' ? undefined : Number(threshold);
  const resulting = onHand + (Number.isFinite(deltaNum) ? deltaNum : 0);

  const deltaInvalid = delta.trim() !== '' && !Number.isFinite(deltaNum);
  const belowZero = deltaNum !== 0 && resulting < 0;
  const thresholdInvalid =
    thresholdNum !== undefined && (!Number.isFinite(thresholdNum) || thresholdNum < 0);
  const thresholdChanged = thresholdNum !== undefined && thresholdNum !== currentThreshold;
  const reasonMissing = deltaNum !== 0 && reason.trim() === '';

  const canSubmit =
    !deltaInvalid &&
    !belowZero &&
    !thresholdInvalid &&
    !reasonMissing &&
    (deltaNum !== 0 || thresholdChanged) &&
    !adjust.isPending;

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    const input: Parameters<typeof adjust.mutate>[0] = { productId: product.id };
    if (deltaNum !== 0) {
      input.quantity = deltaNum;
      input.reason = reason.trim();
    }
    if (thresholdChanged) input.low_stock_threshold = thresholdNum;

    adjust.mutate(input, {
      onSuccess: () => onClose(),
      onError: (e) => setError(apiErrorMessage(e, 'Could not adjust stock. Please try again.')),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Adjust stock — ${product.name}`}>
      <div className="space-y-4 px-4 py-4">
        <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">On hand</span>
          <span className="font-medium tabular-nums">{onHand}</span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adj-delta">Adjustment (+ add / − remove)</Label>
          <Input
            id="adj-delta"
            type="number"
            step="any"
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="e.g. 10 or -3"
          />
          {delta.trim() !== '' && !deltaInvalid && (
            <p className={belowZero ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              New on hand: {resulting}
            </p>
          )}
          {belowZero && (
            <p className="text-xs text-destructive">Cannot reduce below zero (on hand: {onHand}).</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adj-reason">Reason{deltaNum !== 0 && ' *'}</Label>
          <Input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="restock / damage / correction / sale"
          />
          {reasonMissing && <p className="text-xs text-destructive">A reason is required.</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adj-threshold">Low-stock threshold</Label>
          <Input
            id="adj-threshold"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
          {thresholdInvalid && (
            <p className="text-xs text-destructive">Threshold must be a non-negative number.</p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {adjust.isPending && <Spinner className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
