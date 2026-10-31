'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canManageUsers } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Role guard for Users & roles (admin only; managers and cashiers are bounced to
 * Sales). Mirrors the other section layouts: waits for auth hydration, then
 * redirects anyone the backend would reject before any user data is fetched.
 */
export default function UsersLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const allowed = canManageUsers(user);

  useEffect(() => {
    if (hydrated && user && !allowed) {
      router.replace('/sales');
    }
  }, [hydrated, user, allowed, router]);

  if (!hydrated || !user || !allowed) {
    return <FullscreenSpinner />;
  }

  return <>{children}</>;
}
