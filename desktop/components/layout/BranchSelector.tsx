'use client';

import { useBranches } from '@/hooks/useBranches';
import { useBranchStore } from '@/store/branchStore';
import { Store, ChevronDown } from 'lucide-react';

/**
 * Topbar branch selector (handoff §4.1). Admins/managers with more than one active
 * branch get a dropdown to switch context; single-branch users see a static label
 * (mobile parity). Defaults the POS/inventory branch context app-wide.
 */
export function BranchSelector() {
  const { data: branches = [] } = useBranches();
  const { selectedBranchId, setBranch } = useBranchStore();

  const activeBranches = branches.filter((b) => b.is_active !== false);

  if (activeBranches.length <= 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-2">
        <Store className="h-3.5 w-3.5 text-text-muted" />
        {activeBranches[0]?.name ?? 'No branch'}
      </span>
    );
  }

  return (
    <div className="relative inline-block">
      <Store className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
      <select
        value={selectedBranchId ?? ''}
        onChange={(e) => setBranch(e.target.value || null)}
        className="cursor-pointer appearance-none rounded-pill border border-border-strong bg-surface py-1.5 pl-8 pr-8 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-subtle"
      >
        <option value="">All branches</option>
        {activeBranches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
    </div>
  );
}
