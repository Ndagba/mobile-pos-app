import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface User {
  id: string;
  email: string;
  first_name: string;
  role: 'admin' | 'manager' | 'cashier';
  store_id: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  access_token: string | null;
  refresh_token: string | null;
  biometric_enabled: boolean;
  device_id: string | null;
  last_login_at: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  access_token: null,
  refresh_token: null,
  biometric_enabled: false,
  device_id: null,
  last_login_at: null,
  loading: false,
  error: null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{
        user: User;
        access_token: string;
        refresh_token: string;
        device_id: string;
      }>
    ) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.access_token = action.payload.access_token;
      state.refresh_token = action.payload.refresh_token;
      state.device_id = action.payload.device_id;
      state.last_login_at = new Date().toISOString();
      state.loading = false;
      state.error = null;
    },
    enableBiometric: (state, action: PayloadAction<{ device_id: string }>) => {
      state.biometric_enabled = true;
      state.device_id = action.payload.device_id;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.access_token = null;
      state.refresh_token = null;
      state.loading = false;
    },
    refreshToken: (
      state,
      action: PayloadAction<{ access_token: string; refresh_token: string }>
    ) => {
      state.access_token = action.payload.access_token;
      state.refresh_token = action.payload.refresh_token;
    }
  }
});

export const { setLoading, setError, loginSuccess, enableBiometric, logout, refreshToken } =
  authSlice.actions;
export default authSlice.reducer;
