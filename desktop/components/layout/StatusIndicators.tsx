'use client';

import { RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/lib/useNetwork';
import { useSyncStore } from '@/store/syncStore';
import { cn } from '@/lib/utils';

/**
 * Compact topbar sync pill (handoff §4.1): a green dot when online and synced,
 * amber with the pending count when offline/queued, a spinner while syncing.
 * Clicking it triggers `syncNow` (no-op when offline or nothing pending). Auto-sync
 * on reconnect is handled by `useAutoSync` (mounted in AppShell).
 */
export function StatusIndicators() {
  const online = useNetworkStatus();
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const syncNow = useSyncStore((s) => s.syncNow);

  const hasPending = pendingCount > 0;
  const canSync = online && hasPending && !isSyncing;

  const tone = !online
    ? 'border-warning/30 bg-warning-soft text-warning'
    : hasPending
      ? 'border-warning/30 bg-warning-soft text-warning'
      : 'border-success/20 bg-success-soft text-success';

  const label = isSyncing
    ? 'Syncing…'
    : !online
      ? hasPending
        ? `Offline · ${pendingCount}`
        : 'Offline'
      : hasPending
        ? `${pendingCount} pending`
        : 'Online';

  return (
    <button
      type="button"
      onClick={() => canSync && void syncNow()}
      disabled={!canSync}
      title={
        !online
          ? 'Working offline'
          : hasPending
            ? 'Sync pending transactions now'
            : 'All transactions synced'
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold transition-colors',
        tone,
        canSync ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
      )}
    >
      {isSyncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <span
          className={cn(
            'h-2 w-2 rounded-pill',
            online && !hasPending ? 'bg-success' : 'bg-warning'
          )}
        />
      )}
      <span className="tabular">{label}</span>
    </button>
  );
}
