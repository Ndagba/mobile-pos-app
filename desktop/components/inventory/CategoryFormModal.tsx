'use client';

import { useEffect, useState } from 'react';
import type { Category } from '@jaypos/shared';
import type { Branch } from '@/hooks/useBranches';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/errors';
import { useCategoryMutations } from '@/hooks/useCategoryMutations';

/**
 * Create / edit a category. On create an admin may target a branch (the backend
 * lets an admin's branch_id win); managers are pinned to their JWT branch, so the
 * selector only appears when `canChooseBranch`. Update covers name + description.
 */
export function CategoryFormModal({
  open,
  onClose,
  category,
  canChooseBranch,
  branches = [],
  defaultBranchId,
}: {
  open: boolean;
  onClose: () => void;
  /** null / undefined → create mode. */
  category?: Category | null;
  canChooseBranch?: boolean;
  branches?: Branch[];
  defaultBranchId?: string;
}) {
  const isEdit = !!category;
  const { create, update } = useCategoryMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (category) {
      setName(category.name ?? '');
      setDescription(category.description ?? '');
      setBranchId(category.branch_id ?? undefined);
    } else {
      setName('');
      setDescription('');
      setBranchId(defaultBranchId ?? branches[0]?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  const pending = create.isPending || update.isPending;
  const canSubmit = name.trim() !== '' && !pending;

  const handleSubmit = () => {
    setError(null);
    if (!canSubmit) return;
    const onError = (e: unknown) => setError(apiErrorMessage(e, 'Could not save the category.'));

    if (isEdit && category) {
      update.mutate(
        { id: category.id, name: name.trim(), description: description.trim() },
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
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit category' : 'New category'}>
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="cf-name">Name *</Label>
          <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-description">Description</Label>
          <Input
            id="cf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
        {!isEdit && canChooseBranch && branches.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="cf-branch">Branch</Label>
            <select
              id="cf-branch"
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
            {pending && <Spinner className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
