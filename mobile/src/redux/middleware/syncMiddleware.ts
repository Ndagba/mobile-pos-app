import { Middleware } from '@reduxjs/toolkit';
import { addToSyncQueue, setSyncMode, setConnected, setLastSyncAt } from '../slices/syncSlice';
import { TransactionService } from '../../services/TransactionService';
import { SyncManager } from '../../services/SyncManager';

// RootState is intentionally NOT imported here — importing it would create a
// circular reference: store.ts → syncMiddleware.ts → store.ts (RootState).
// Using Middleware without a state type parameter is safe because the
// middleware only reads state.sync, which is loosely typed via store.getState().
export const syncMiddleware: Middleware = (store) => (next) => (action) => {
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
