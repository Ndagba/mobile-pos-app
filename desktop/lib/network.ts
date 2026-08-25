import type { INetwork } from '@jaypos/shared';

/**
 * Browser implementation of the shared `INetwork` port.
 *
 * Replaces mobile's NetInfo with `navigator.onLine` plus the window
 * `online`/`offline` events. SSR-safe: reports online on the server (where there
 * is no navigator) and only wires listeners in the browser.
 */
class BrowserNetwork implements INetwork {
  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  subscribe(listener: (online: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const onOnline = () => listener(true);
    const onOffline = () => listener(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }
}

export const network = new BrowserNetwork();
