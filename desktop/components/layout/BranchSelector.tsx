'use client';

import { useBranches } from '@/hooks/useBranches';
import { useBranchStore } from '@/store/branchStore';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

/**
 * Branch selector for the Topbar.
 *
 * If the user has access to multiple active branches, this renders a dropdown
 * to switch the active branch context. If only one active branch exists, it's
 * hidden to reduce noise (mirroring mobile parity).
 */
export function BranchSelector() {
  const { data: branches = [], isLoading } = useBranches();
  const { selectedBranchId, setBranch } = useBranchStore();

  const activeBranches = branches.filter((b) => b.is_active !== false);

  // Only show the selector if there is more than one active branch to choose from.
  if (activeBranches.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {activeBranches[0]?.name ?? 'No branches'}
        </span>
      </div>
    );
  }

  const currentBranch = activeBranches.find((b) => b.id === selectedBranchId);

  return (
    <div className="relative inline-block">
      <select
        value={selectedBranchId ?? ''}
        onChange={(e) => setBranch(e.target.value || null)}
        className={cn(
          'appearance-none rounded-md border border-input bg-background px-3 py-1 text-sm font-medium transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
          'pr-8 cursor-pointer'
        )}
      >
        <option value="">All branches</option>
        {activeBranches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>
  );
}
