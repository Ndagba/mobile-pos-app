'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canViewAuditLog } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Role guard for the audit log (admin + manager; cashiers are bounced to the
 * dashboard). Mirrors the purchasing/inventory layouts: waits for auth hydration,
 * then redirects before any log data is fetched.
 */
export default function AuditLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const allowed = canViewAuditLog(user);

  useEffect(() => {
    if (hydrated && user && !allowed) {
      router.replace('/dashboard');
    }
  }, [hydrated, user, allowed, router]);

  if (!hydrated || !user || !allowed) {
    return <FullscreenSpinner />;
  }

  return <>{children}</>;
}
