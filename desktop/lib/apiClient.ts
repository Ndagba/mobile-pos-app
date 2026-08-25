import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { IApiClient, AuthTokens } from '@jaypos/shared';
import { webTokenStorage } from './tokenStorage';

/**
 * Base URL of the existing JayPOS backend. MUST include the `/v1` suffix.
 * Mirrors mobile's `API_BASE_URL` (which reads EXPO_PUBLIC_API_URL); here it is
 * `NEXT_PUBLIC_API_URL` so it is inlined into the client bundle at build time.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/**
 * Web port of mobile's `ApiClient`, implementing the shared `IApiClient` port.
 *
 * Faithfully preserves the mobile behaviour the backend contract depends on:
 *  - Bearer token injected from the (web) token storage adapter.
 *  - `{ status, data }` envelope unwrapped to `response.data.data`.
 *  - A single silent `/auth/refresh-token` retry on 401 for non-auth endpoints;
 *    auth endpoints never trigger a refresh (so real credential errors surface),
 *    and a failed refresh clears tokens so the user is sent back to login.
 *
 * The AsyncStorage-backed offline queue/caching from mobile is intentionally
 * omitted here — desktop offline persistence is handled by the Dexie store
 * (lib/db.ts) and wired into the sync flow in Phase 2.
 */
class WebApiClient implements IApiClient {
  private axiosInstance: AxiosInstance;
  private isOnline = true;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' }
    });

    // Attach the access token to every request.
    this.axiosInstance.interceptors.request.use(async (config) => {
      const token = await webTokenStorage.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Refresh-on-401 (once), and online/offline tracking.
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.isOnline = true;
        return response;
      },
      async (error: AxiosError) => {
        const original = error.config as RetriableConfig | undefined;
        const requestUrl = original?.url ?? '';

        // Never attempt a silent refresh for auth endpoints — it would mask the
        // real error (e.g. wrong credentials) behind a refresh failure.
        const isAuthEndpoint = requestUrl.includes('/auth/');

        if (
          error.response?.status === 401 &&
          !isAuthEndpoint &&
          original &&
          !original._retry
        ) {
          const refreshToken = await webTokenStorage.getRefreshToken();
          if (refreshToken) {
            try {
              // Use a bare axios call (not the instance) to avoid re-entering
              // these interceptors during the refresh itself.
              const resp = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
                refresh_token: refreshToken
              });
              const tokens = resp.data.data as AuthTokens;
              await webTokenStorage.saveTokens(tokens);

              original._retry = true;
              original.headers.Authorization = `Bearer ${tokens.access_token}`;
              return this.axiosInstance(original);
            } catch (refreshError) {
              // Refresh failed — clear tokens so route guards send the user to login.
              await webTokenStorage.clearTokens();
              throw refreshError;
            }
          }
        }

        // No HTTP response at all → treat as offline.
        if (!error.response) {
          this.isOnline = false;
        }

        throw error;
      }
    );
  }

  async get<T>(url: string, config?: unknown): Promise<T> {
    const response = await this.axiosInstance.get(url, config as object);
    return response.data.data as T;
  }

  async post<T>(url: string, data?: unknown, config?: unknown): Promise<T> {
    const response = await this.axiosInstance.post(url, data, config as object);
    return response.data.data as T;
  }

  async patch<T>(url: string, data?: unknown, config?: unknown): Promise<T> {
    const response = await this.axiosInstance.patch(url, data, config as object);
    return response.data.data as T;
  }

  async delete<T>(url: string, config?: unknown): Promise<T> {
    const response = await this.axiosInstance.delete(url, config as object);
    return response.data.data as T;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  setOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
  }
}

export const apiClient = new WebApiClient();
export { WebApiClient };
