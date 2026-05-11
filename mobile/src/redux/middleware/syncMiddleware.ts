import { Middleware } from '@reduxjs/toolkit';
import { RootState } from '../store';
import { addToSyncQueue, setSyncMode, setConnected, setLastSyncAt } from '../slices/syncSlice';
import { TransactionService } from '../../services/TransactionService';
import { SyncManager } from '../../services/SyncManager';

export const syncMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const result = next(action);
  const state = store.getState();

  // Auto-sync when connected and in offline mode
  if (state.sync.isConnected && state.sync.mode === 'OFFLINE' && state.sync.pendingSyncCount > 0) {
    triggerAutoSync(store);
  }

  return result;
};

async function triggerAutoSync(store: any) {
  const state = store.getState();

  store.dispatch(setSyncMode('TRANSITIONING'));

  try {
    const results = await SyncManager.syncPendingTransactions(state.sync.syncQueue);

    if (results.synced > 0) {
      store.dispatch(setLastSyncAt(new Date().toISOString()));
      store.dispatch(setSyncMode('ONLINE'));
    }
  } catch (error) {
    console.error('Sync failed:', error);
    store.dispatch(setSyncMode('OFFLINE'));
  }
}
