'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { AppShell } from '@/components/layout/AppShell';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Route guard for the authenticated app. Waits for session hydration before
 * deciding — otherwise a valid persisted session would be bounced to /login on
 * first paint. Once hydrated, an unauthenticated user is redirected to /login.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (hydrated && !user) {
      router.replace('/login');
    }
  }, [hydrated, user, router]);

  // 1. While we don't know if we are hydrated yet, show the loading spinner.
  if (!hydrated) {
    return <FullscreenSpinner />;
  }

  // 2. If we are hydrated but have no user, we are about to be redirected.
  // Return null to avoid showing the "Loading session..." spinner for a user
  // who is clearly not logged in.
  if (!user) {
    return null;
  }

  // 3. Hydrated and authenticated.
  return <AppShell>{children}</AppShell>;
}
