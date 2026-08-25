'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { canManageInventory } from '@/lib/roles';
import { FullscreenSpinner } from '@/components/ui/spinner';

/**
 * Role guard for the inventory section. The parent `(app)` layout already ensures
 * an authenticated, hydrated session, so here we only gate by role: inventory is
 * admin + manager (mobile parity — cashiers never see it). A cashier who reaches a
 * `/inventory*` URL directly is redirected to the POS. The backend enforces the
 * same rules; this only prevents a dead-end screen.
 */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const allowed = canManageInventory(user);

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
