import { configureStore, ThunkAction, Action } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import cartReducer from './slices/cartSlice';
import inventoryReducer from './slices/inventorySlice';
import syncReducer from './slices/syncSlice';
import uiReducer from './slices/uiSlice';
import { syncMiddleware } from './middleware/syncMiddleware';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    inventory: inventoryReducer,
    sync: syncReducer,
    ui: uiReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(syncMiddleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
