'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';
import { useSupplierMutations, type SupplierWriteFields } from '@/hooks/useSupplierMutations';
import type { Supplier } from '@/hooks/useSuppliers';

/**
 * Create / edit a supplier. Mirrors the mobile form: name*, category, tag, phone,
 * email, address, notes. `category` is a free-text input (with a `<datalist>` of
 * existing supplier categories as suggestions) rather than a fixed select — a
 * supplier's category is its own vocabulary, distinct from product categories.
 * State resets whenever the modal (re)opens or the target supplier changes.
 */
export function SupplierFormModal({
  open,
  onClose,
  supplier,
  categorySuggestions = [],
}: {
  open: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
  categorySuggestions?: string[];
}) {
  const isEdit = !!supplier;
  const { create, update } = useSupplierMutations();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(supplier?.name ?? '');
    setCategory(supplier?.category ?? '');
    setTag(supplier?.tag === 'Preferred' || supplier?.tag === 'Blocked' ? supplier.tag : '');
    setPhone(supplier?.phone ?? '');
    setEmail(supplier?.email ?? '');
    setAddress(supplier?.address ?? '');
    setNotes(supplier?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier?.id]);

  const pending = create.isPending || update.isPending;
  const canSubmit = name.trim() !== '' && !pending;

  const buildFields = (): SupplierWriteFields => ({
    name: name.trim(),
    phone: phone.trim() || null,
    email: email.trim() || null,
    address: address.trim() || null,
    category: category.trim() || null,
    notes: notes.trim() || null,
    tag: tag || null,
  });

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    const fields = buildFields();
    const onError = (e: unknown) =>
      setError(apiErrorMessage(e, isEdit ? 'Could not save the supplier.' : 'Could not create the supplier.'));
    if (isEdit && supplier) {
      update.mutate({ id: supplier.id, data: fields }, { onSuccess: () => onClose(), onError });
    } else {
      create.mutate(fields, { onSuccess: () => onClose(), onError });
    }
  };

  const textareaClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit supplier' : 'New supplier'}
      className="max-w-lg"
    >
      <div className="max-h-[75vh] space-y-4 overflow-y-auto px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="sf-name">Name *</Label>
          <Input id="sf-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sf-category">Category</Label>
            <Input
              id="sf-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Beverages"
              list="supplier-category-suggestions"
            />
            {categorySuggestions.length > 0 && (
              <datalist id="supplier-category-suggestions">
                {categorySuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-tag">Tag</Label>
            <select
              id="sf-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">None</option>
              <option value="Preferred">Preferred</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sf-phone">Phone</Label>
            <Input id="sf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-email">Email</Label>
            <Input id="sf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sf-address">Address</Label>
          <textarea
            id="sf-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sf-notes">Notes</Label>
          <textarea
            id="sf-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {pending && <Spinner className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
