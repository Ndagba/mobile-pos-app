'use client';

import { cn } from '@/lib/utils';
import type { Branch } from '@/hooks/useBranches';

/**
 * Branch selector chips. Only rendered when the user has more than one active
 * branch (mobile parity — a single-branch user has nothing to choose). The
 * `undefined` selection means "All branches" (server returns all authorized).
 */
export function BranchFilter({
  branches,
  selected,
  onSelect,
}: {
  branches: Branch[];
  selected?: string;
  onSelect: (branchId?: string) => void;
}) {
  const active = branches.filter((b) => b.is_active !== false);
  if (active.length <= 1) return null;

  const chipClass = (isSelected: boolean) =>
    cn(
      'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
      isSelected
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={chipClass(!selected)} onClick={() => onSelect(undefined)}>
        All branches
      </button>
      {active.map((b) => (
        <button
          key={b.id}
          type="button"
          className={chipClass(selected === b.id)}
          onClick={() => onSelect(b.id)}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}
