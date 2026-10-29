'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BranchState {
  selectedBranchId: string | null;
  setBranch: (id: string | null) => void;
  clearBranch: () => void;
}

/**
 * Branch store — persists the currently active branch selection across sessions.
 *
 * For admins and managers, this allows them to set a specific branch context
 * for the POS (affecting product catalogue and transaction target).
 * For cashiers, this is typically redundant as they only have one branch,
 * but it provides a consistent interface for resolving the active branch.
 */
export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setBranch: (id) => set({ selectedBranchId: id }),
      clearBranch: () => set({ selectedBranchId: null }),
    }),
    {
      name: 'jaypos-selected-branch',
    }
  )
);
