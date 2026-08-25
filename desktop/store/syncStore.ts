'use client';

import { create } from 'zustand';
import { syncPendingTransactions, type SyncResult } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { offlineStore } from '@/lib/db';

/**
 * Pending-sync UI state for the desktop app.
 *
 * The durable source of truth is Dexie (`offlineStore`), exactly as mobile's is
 * AsyncStorage — this store only mirrors the pending count for the UI and owns
 * the "Sync Now" action. `syncNow` delegates to the shared
 * `syncPendingTransactions`, which itself reads the unsynced rows straight from
 * the store and short-circuits when there is nothing to send (so calling it on
 * every reconnect is cheap and race-free).
 */
interface SyncStore {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastResult: SyncResult | null;
  /** Recount unsynced rows from Dexie into `pendingCount`. */
  refreshPendingCount: () => Promise<void>;
  /** Drain the pending queue once; no-ops (returns null) if already syncing. */
  syncNow: () => Promise<SyncResult | null>;
}

export const useSyncStore = create<SyncStore>((set, get) => ({
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,
  lastResult: null,

  refreshPendingCount: async () => {
    try {
      const unsynced = await offlineStore.getUnsyncedTransactions();
      set({ pendingCount: unsynced.length });
    } catch {
      /* store not ready (e.g. SSR / no auth yet) — leave the count untouched */
    }
  },

  syncNow: async () => {
    if (get().isSyncing) return null;
    set({ isSyncing: true });
    try {
      const result = await syncPendingTransactions({ api: apiClient, store: offlineStore });
      set({ lastSyncAt: new Date(), lastResult: result });
      await get().refreshPendingCount();
      return result;
    } finally {
      set({ isSyncing: false });
    }
  },
}));
