'use client';

import { create } from 'zustand';

/**
 * Transient shell UI state (not persisted): the command palette's open state.
 * Kept in a store so the Topbar trigger, the global Ctrl/⌘K shortcut and the
 * CommandMenu itself all share one source of truth.
 */
interface UiState {
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  toggleCommand: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen }))
}));
