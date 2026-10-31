'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { Toaster } from 'sonner';

/**
 * Client-side app providers:
 *  - TanStack Query for server-state.
 *  - One-time session restore from persisted tokens/user (sets `hydrated`).
 *  - Service worker registration for the PWA app shell.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    console.log('[Providers] Calling restore...');
    restore().then(() => {
      console.log('[Providers] restore completed');
    }).catch(e => {
      console.error('[Providers] restore failed:', e);
    });
  }, [restore]);

  useEffect(() => {
    // Only register the SW in production. In dev, its stale-while-revalidate
    // cache can serve outdated chunks for the same (non-content-hashed) dev URLs
    // after a rebuild, which breaks hot reloads; skipping it avoids that entirely.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      // Register after load so it never competes with first paint.
      const onLoad = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          /* SW registration is best-effort; app still works online without it. */
        });
      };
      if (document.readyState === 'complete') onLoad();
      else window.addEventListener('load', onLoad, { once: true });
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      {children}
    </QueryClientProvider>
  );
}
