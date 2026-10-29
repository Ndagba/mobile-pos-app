'use client';

import { useEffect, useState } from 'react';
import type { Location } from '@jaypos/shared';
import type { Branch } from '@/hooks/useBranches';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';
import { useLocationMutations } from '@/hooks/useLocationMutations';

/**
 * Create / edit a physical shop storage location (e.g., Shelf A1, Rack 1, Refrigerator).
 */
export function LocationFormModal({
  open,
  onClose,
  location,
  canChooseBranch,
  branches = [],
  defaultBranchId,
}: {
  open: boolean;
  onClose: () => void;
  location?: Location | null;
  canChooseBranch?: boolean;
  branches?: Branch[];
  defaultBranchId?: string;
}) {
  const isEdit = !!location;
  const { create, update } = useLocationMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (location) {
      setName(location.name ?? '');
      setDescription(location.description ?? '');
      setBranchId(location.branch_id ?? undefined);
    } else {
      setName('');
      setDescription('');
      setBranchId(defaultBranchId ?? branches[0]?.id);
    }
  }, [open, location, defaultBranchId, branches]);

  const pending = create.isPending || update.isPending;
  const canSubmit = name.trim() !== '' && !pending;

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    const onError = (e: unknown) => setError(apiErrorMessage(e, 'Could not save the location.'));

    if (isEdit && location) {
      update.mutate(
        { id: location.id, name: name.trim(), description: description.trim() },
        { onSuccess: () => onClose(), onError }
      );
    } else {
      create.mutate(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          branch_id: canChooseBranch ? branchId : undefined,
        },
        { onSuccess: () => onClose(), onError }
      );
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit location' : 'New location'}>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="lf-name">Location Name *</Label>
          <Input
            id="lf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shelf A1, Refrigerator, Counter"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lf-description">Description</Label>
          <Input
            id="lf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes or details"
          />
        </div>
        {!isEdit && canChooseBranch && branches.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="lf-branch">Branch</Label>
            <select
              id="lf-branch"
              value={branchId ?? ''}
              onChange={(e) => setBranchId(e.target.value || undefined)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {pending && <Spinner className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
