import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SyncQueueItem {
  id: string;
  transaction_id: string;
  offline_session_hash: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  created_at: string;
}

export interface SyncState {
  mode: 'ONLINE' | 'OFFLINE' | 'TRANSITIONING';
  isConnected: boolean;
  pendingSyncCount: number;
  syncQueue: SyncQueueItem[];
  lastSyncAt: string | null;
  autoSyncEnabled: boolean;
  syncErrors: any[];
}

const initialState: SyncState = {
  mode: 'ONLINE',
  isConnected: true,
  pendingSyncCount: 0,
  syncQueue: [],
  lastSyncAt: null,
  autoSyncEnabled: true,
  syncErrors: []
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setSyncMode: (state, action: PayloadAction<'ONLINE' | 'OFFLINE' | 'TRANSITIONING'>) => {
      state.mode = action.payload;
    },
    setConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
      if (action.payload && state.mode === 'OFFLINE') {
        state.mode = 'TRANSITIONING';
      }
    },
    addToSyncQueue: (state, action: PayloadAction<SyncQueueItem>) => {
      state.syncQueue.push(action.payload);
      state.pendingSyncCount = state.syncQueue.filter((item) => item.status === 'pending').length;
    },
    updateSyncQueueItem: (
      state,
      action: PayloadAction<{ id: string; status: 'pending' | 'syncing' | 'synced' | 'failed' }>
    ) => {
      const item = state.syncQueue.find((i) => i.id === action.payload.id);
      if (item) {
        item.status = action.payload.status;
      }
      state.pendingSyncCount = state.syncQueue.filter((item) => item.status === 'pending').length;
    },
    setSyncQueue: (state, action: PayloadAction<SyncQueueItem[]>) => {
      state.syncQueue = action.payload;
      state.pendingSyncCount = action.payload.filter((item) => item.status === 'pending').length;
    },
    setLastSyncAt: (state, action: PayloadAction<string>) => {
      state.lastSyncAt = action.payload;
      state.mode = 'ONLINE';
    },
    addSyncError: (state, action: PayloadAction<any>) => {
      state.syncErrors.push(action.payload);
      // Keep only last 10 errors
      if (state.syncErrors.length > 10) {
        state.syncErrors.shift();
      }
    },
    clearSyncQueue: (state) => {
      state.syncQueue = [];
      state.pendingSyncCount = 0;
    }
  }
});

export const {
  setSyncMode,
  setConnected,
  addToSyncQueue,
  updateSyncQueueItem,
  setSyncQueue,
  setLastSyncAt,
  addSyncError,
  clearSyncQueue
} = syncSlice.actions;

export default syncSlice.reducer;
