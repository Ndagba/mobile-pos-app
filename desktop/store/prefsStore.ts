'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrefsState {
  /** Mask all money as `₦ ••••••` across the app (handoff §6). UI-only preference. */
  hideAmounts: boolean;
  /** Sidebar collapsed to the 72px rail (handoff §4.1). */
  sidebarCollapsed: boolean;
  toggleHideAmounts: () => void;
  setHideAmounts: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
}

/**
 * Per-device UI preferences, persisted to localStorage. These never leave the
 * browser and carry no business state — purely how the shell looks for this user.
 */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      hideAmounts: false,
      sidebarCollapsed: false,
      toggleHideAmounts: () => set((s) => ({ hideAmounts: !s.hideAmounts })),
      setHideAmounts: (v) => set({ hideAmounts: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v })
    }),
    { name: 'jaypos-prefs' }
  )
);
