import type { ITokenStorage } from '@jaypos/shared';

/**
 * Web implementation of the shared `ITokenStorage` port.
 *
 * Replaces mobile's expo-secure-store / AsyncStorage. Uses `localStorage` so the
 * session survives reloads (a desktop POS terminal is trusted hardware). SSR-safe:
 * every access guards on `window` and no-ops on the server.
 *
 * NOTE: localStorage is readable by any script on the origin. That is an accepted
 * trade-off for a same-origin PWA on trusted terminal hardware; revisit if the
 * desktop app is ever embedded in a less-trusted context.
 */
const ACCESS_KEY = 'jaypos_access_token';
const REFRESH_KEY = 'jaypos_refresh_token';

function ls(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

export const webTokenStorage: ITokenStorage = {
  async getAccessToken() {
    return ls()?.getItem(ACCESS_KEY) ?? null;
  },
  async getRefreshToken() {
    return ls()?.getItem(REFRESH_KEY) ?? null;
  },
  async saveTokens(tokens) {
    const store = ls();
    if (!store) return;
    store.setItem(ACCESS_KEY, tokens.access_token);
    store.setItem(REFRESH_KEY, tokens.refresh_token);
  },
  async clearTokens() {
    const store = ls();
    if (!store) return;
    store.removeItem(ACCESS_KEY);
    store.removeItem(REFRESH_KEY);
  }
};
