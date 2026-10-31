import { create } from 'zustand';
import type { AuthUser } from '@jaypos/shared';
import { apiClient } from '@/lib/apiClient';
import { webTokenStorage } from '@/lib/tokenStorage';

/**
 * Auth store — username + password login against the existing JWT backend.
 *
 * Tokens live in the web token-storage adapter (localStorage); the user object
 * is persisted alongside them so the session survives a reload. `restore()`
 * rehydrates optimistically from that persisted user + token presence; if the
 * access token is later rejected, the ApiClient's refresh flow clears the tokens
 * and route guards send the user back to login.
 */
const USER_KEY = 'jaypos_user';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /** True once restore() has run — guards wait for this before redirecting. */
  hydrated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

/**
 * Self-serve store sign-up (login handoff §Sign up). The backend endpoint does
 * not exist yet, so this is only reachable when NEXT_PUBLIC_ENABLE_SIGNUP is on;
 * it posts the business + admin details and expects the same `{access_token,
 * refresh_token, user}` payload as login.
 */
export interface SignupPayload {
  businessName: string;
  fullName: string;
  phone: string;
  email: string;
  password: string;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  error: null,
  hydrated: false,

  async login(username, password) {
    set({ status: 'loading', error: null });
    try {
      const data = await apiClient.post<LoginResponse>('/auth/login', {
        username,
        password
      });
      await webTokenStorage.saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }
      set({ user: data.user, status: 'authenticated', error: null, hydrated: true });
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const message =
        err?.response?.data?.message || err?.message || 'Login failed';
      set({ status: 'error', error: message, user: null });
      throw e;
    }
  },

  async signup(payload) {
    set({ status: 'loading', error: null });
    try {
      const data = await apiClient.post<LoginResponse>('/auth/register', payload);
      await webTokenStorage.saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      }
      set({ user: data.user, status: 'authenticated', error: null, hydrated: true });
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      const message = err?.response?.data?.message || err?.message || 'Sign-up failed';
      set({ status: 'error', error: message, user: null });
      throw e;
    }
  },

  async logout() {
    await webTokenStorage.clearTokens();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(USER_KEY);
    }
    set({ user: null, status: 'idle', error: null, hydrated: true });
  },

  async restore() {
    console.log('[AuthStore] restore starting...');
    if (typeof window === 'undefined') return;
    try {
      const token = await webTokenStorage.getAccessToken();
      const raw = window.localStorage.getItem(USER_KEY);
      console.log('[AuthStore] restore tokens found:', { hasToken: !!token, hasRaw: !!raw });
      if (!token || !raw) {
        console.log('[AuthStore] restore: no session found, marking hydrated=true, user=null');
        set({ status: 'idle', user: null, hydrated: true });
        return;
      }
      const user = JSON.parse(raw) as AuthUser;
      console.log('[AuthStore] restore: session found, user:', user?.first_name);
      set({ user, status: 'authenticated', hydrated: true });
    } catch (e) {
      console.error('[AuthStore] restore error:', e);
      set({ status: 'idle', user: null, hydrated: true });
    }
  }
}));
