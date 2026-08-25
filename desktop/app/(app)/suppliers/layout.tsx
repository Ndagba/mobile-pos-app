'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canManageSuppliers } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Role guard for the Suppliers section (admin + manager; cashiers are bounced to
 * Sales). Mirrors the inventory layout: waits for auth hydration, then redirects
 * anyone the backend would reject before any supplier data is fetched.
 */
export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const allowed = canManageSuppliers(user);

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
