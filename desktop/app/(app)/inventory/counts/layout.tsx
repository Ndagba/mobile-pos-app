'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Stock counts are admin-only in the UI (mobile parity). The parent inventory
 * layout already admits admins + managers; this narrows the `counts/*` subtree to
 * admins and bounces a manager who lands on the URL directly back to the catalog.
 * The backend puts no role check on stock counts, so this is purely a UI decision.
 */
export default function StockCountsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const allowed = isAdmin(user);

  useEffect(() => {
    if (hydrated && user && !allowed) {
      router.replace('/inventory');
    }
  }, [hydrated, user, allowed, router]);

  if (!hydrated || !user || !allowed) {
    return <FullscreenSpinner />;
  }

  return <>{children}</>;
}
