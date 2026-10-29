'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canManagePurchasing } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Role guard for the Purchasing section (admin + manager; cashiers are bounced to
 * Sales). Mirrors the suppliers/inventory layouts: waits for auth hydration, then
 * redirects anyone the backend would reject before any PO data is fetched.
 */
export default function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const allowed = canManagePurchasing(user);

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
