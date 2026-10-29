'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Product, Location } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';

export function AddBatchModal({
  open,
  onClose,
  products = [],
  locations = [],
}: {
  open: boolean;
  onClose: () => void;
  products?: Product[];
  locations?: Location[];
}) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [manufacturedDate, setManufacturedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [locationName, setLocationName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const physicalProducts = products.filter((p) => p.item_type !== 'SERVICE');

  const addBatchMutation = useMutation({
    mutationFn: (data: {
      product_id: string;
      batch_number: string;
      manufactured_date: string;
      expiry_date: string;
      quantity: number;
      warehouse_location?: string;
    }) => apiClient.post('/inventory/batches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expiring'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
      // Reset form
      setProductId('');
      setBatchNumber('');
      setExpiryDate('');
      setQuantity('');
      setLocationName('');
    },
  });

  const canSubmit =
    productId !== '' &&
    batchNumber.trim() !== '' &&
    manufacturedDate !== '' &&
    expiryDate !== '' &&
    Number(quantity) > 0 &&
    !addBatchMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;

    addBatchMutation.mutate(
      {
        product_id: productId,
        batch_number: batchNumber.trim(),
        manufactured_date: manufacturedDate,
        expiry_date: expiryDate,
        quantity: Number(quantity),
        warehouse_location: locationName.trim() || undefined,
      },
      {
        onError: (err) => setError(apiErrorMessage(err, 'Failed to create batch.')),
      }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Product Batch">
      <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="batch-product">Product *</Label>
          <select
            id="batch-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            required
          >
            <option value="">Select a product…</option>
            {physicalProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.sku ? `(${p.sku})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="batch-number">Batch Number *</Label>
            <Input
              id="batch-number"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. BATCH001"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="batch-qty">Quantity *</Label>
            <Input
              id="batch-qty"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 50"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="batch-mfg">Manufactured Date *</Label>
            <Input
              id="batch-mfg"
              type="date"
              value={manufacturedDate}
              onChange={(e) => setManufacturedDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="batch-exp">Expiry Date *</Label>
            <Input
              id="batch-exp"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="batch-loc">Storage Location / Shelf</Label>
          {locations.length > 0 ? (
            <select
              id="batch-loc"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select or leave blank…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="batch-loc"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Shelf A1, Rack 2"
            />
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={addBatchMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {addBatchMutation.isPending && <Spinner className="mr-1.5 h-4 w-4" />}
            Save Batch
          </Button>
        </div>
      </form>
    </Modal>
  );
}
