'use client';

import { useSyncExternalStore } from 'react';
import { network } from '@/lib/network';

/**
 * Subscribe to online/offline status via the shared `INetwork` port.
 * Uses useSyncExternalStore so it stays consistent across concurrent renders and
 * is SSR-safe (server snapshot is always `true`).
 */
export function useNetworkStatus(): boolean {
  return useSyncExternalStore(
    (cb) => network.subscribe(() => cb()),
    () => network.isOnline(),
    () => true
  );
}
