'use client';

import { useEffect } from 'react';
import { network } from '@/lib/network';
import { apiClient } from '@/lib/apiClient';
import { useSyncStore } from '@/store/syncStore';

/**
 * Auto-sync on reconnect — the desktop analogue of mobile's NetInfo listener in
 * `App.tsx` (`runPendingSync()` on regained connectivity). Mount once, in the
 * authenticated shell.
 *
 * On mount it seeds `apiClient`'s connectivity flag from the current navigator
 * state and refreshes the pending count. Thereafter, every online transition
 * updates that flag and triggers a drain; `syncNow` → `syncPendingTransactions`
 * short-circuits when nothing is pending, so an unconditional call is safe.
 */
export function useAutoSync(): void {
  const refreshPendingCount = useSyncStore((s) => s.refreshPendingCount);
  const syncNow = useSyncStore((s) => s.syncNow);

  useEffect(() => {
    apiClient.setOnlineStatus(network.isOnline());
    void refreshPendingCount();

    const unsubscribe = network.subscribe((online) => {
      apiClient.setOnlineStatus(online);
      if (online) void syncNow();
    });
    return unsubscribe;
  }, [refreshPendingCount, syncNow]);
}
