import { configureStore, combineReducers, ThunkAction, Action } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import cartReducer from './slices/cartSlice';
import inventoryReducer from './slices/inventorySlice';
import syncReducer from './slices/syncSlice';
import uiReducer from './slices/uiSlice';
import customersReducer from './slices/customersSlice';
import subscriptionReducer from './slices/subscriptionSlice';
import { syncMiddleware } from './middleware/syncMiddleware';

// Define rootReducer separately so RootState can be derived without
// a circular reference through store.getState.
const rootReducer = combineReducers({
  auth: authReducer,
  cart: cartReducer,
  inventory: inventoryReducer,
  sync: syncReducer,
  ui: uiReducer,
  customers: customersReducer,
  subscription: subscriptionReducer,
});

// RootState is derived from the reducer, not from store.getState,
// which avoids the circular type alias that appears when syncMiddleware
// (imported above) references RootState from this same file.
export type RootState = ReturnType<typeof rootReducer>;

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(syncMiddleware),
});

export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
