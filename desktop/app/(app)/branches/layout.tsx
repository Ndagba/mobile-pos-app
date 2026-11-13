'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canManageUsers } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Role guard for Branches (admin only — the backend rejects every branch write
 * from anyone else; managers and cashiers are bounced to Sales). Same gate as
 * Users & roles, mirroring mobile where Branch Management is admin-only.
 */
export default function BranchesLayout({ children }: { children: React.ReactNode }) {
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
