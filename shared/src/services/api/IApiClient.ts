import type { AuthTokens } from '../../types';

/**
 * Platform-neutral token storage.
 *
 * Mobile backs this with expo-secure-store / AsyncStorage; desktop backs it with
 * a web adapter (localStorage or in-memory + cookie). The API client depends on
 * this interface so its 401-refresh flow is identical across platforms.
 */
export interface ITokenStorage {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  saveTokens(tokens: AuthTokens): Promise<void>;
  clearTokens(): Promise<void>;
}

/**
 * Platform-neutral HTTP client surface.
 *
 * Mirrors the public methods of mobile's `ApiClient` so shared services can make
 * requests without knowing whether they run on axios+SecureStore (mobile) or a
 * web fetch/axios+localStorage adapter (desktop). Concrete clients own the base
 * URL (`/v1` via env), Bearer injection, the `{ data: {...} }` unwrap, and the
 * single `/auth/refresh-token` retry-on-401.
 */
export interface IApiClient {
  get<T>(url: string, config?: unknown): Promise<T>;
  post<T>(url: string, data?: unknown, config?: unknown): Promise<T>;
  patch<T>(url: string, data?: unknown, config?: unknown): Promise<T>;
  delete<T>(url: string, config?: unknown): Promise<T>;
  getOnlineStatus(): boolean;
  setOnlineStatus(isOnline: boolean): void;
}
