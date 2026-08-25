'use client';

import { Wifi, WifiOff, RefreshCw, Check } from 'lucide-react';
import { useNetworkStatus } from '@/lib/useNetwork';
import { useSyncStore } from '@/store/syncStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Connectivity + sync status pills for the topbar, plus a manual "Sync Now".
 *
 * Online/offline is live via the shared INetwork port. The pending count and the
 * sync action come from `syncStore`; auto-sync on reconnect is handled by
 * `useAutoSync` (mounted in AppShell), so this component is purely presentational
 * plus the manual trigger. "Sync Now" is disabled when there is nothing to sync,
 * the app is offline, or a sync is already in flight.
 */
export function StatusIndicators() {
  const online = useNetworkStatus();
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const syncNow = useSyncStore((s) => s.syncNow);

  const hasPending = pendingCount > 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          online
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        )}
        title={online ? 'Connected to the network' : 'Working offline'}
      >
        {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {online ? 'Online' : 'Offline'}
      </span>

      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          hasPending
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
            : 'bg-muted text-muted-foreground'
        )}
        title={hasPending ? `${pendingCount} transaction(s) pending sync` : 'All transactions synced'}
      >
        {hasPending ? (
          <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        {hasPending ? `${pendingCount} pending` : 'Synced'}
      </span>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasPending || !online || isSyncing}
        onClick={() => void syncNow()}
        title={
          !online
            ? 'Offline — cannot sync'
            : hasPending
              ? 'Sync pending transactions now'
              : 'Nothing to sync'
        }
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
        {isSyncing ? 'Syncing…' : 'Sync Now'}
      </Button>
    </div>
  );
}
