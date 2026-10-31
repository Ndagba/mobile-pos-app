'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, PackageX, PackageMinus, CalendarClock, CloudOff } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import { useLowStock } from '@/hooks/useLowStock';
import { useExpiringBatches } from '@/hooks/useExpiringBatches';
import { canManageInventory } from '@/lib/roles';
import { cn } from '@/lib/utils';

/**
 * Topbar notifications bell (handoff §4.1 / §5): low stock, out of stock, expiring
 * batches and pending syncs. Inventory alerts are only fetched for admins/managers
 * (cashiers can't see the catalog); everyone sees pending-sync alerts.
 */
export function NotificationsBell() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const canInv = canManageInventory(user);

  const { data: lowStock } = useLowStock();
  const { data: expiring } = useExpiringBatches({ days: 30, status: 'expiring' });

  const [open, setOpen] = useState(false);

  const outOfStock = canInv ? (lowStock ?? []).filter((i) => i.current_quantity <= 0) : [];
  const lowStockRows = canInv ? (lowStock ?? []).filter((i) => i.current_quantity > 0) : [];
  const expiringRows = canInv ? expiring ?? [] : [];

  const total = outOfStock.length + lowStockRows.length + expiringRows.length + (pendingCount > 0 ? 1 : 0);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger px-1 font-mono text-[10px] font-semibold text-white">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-modal border border-border bg-popover shadow-modal">
            <div className="border-b border-divider px-4 py-3">
              <p className="text-sm font-bold text-ink">Notifications</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto py-1">
              {total === 0 && (
                <p className="px-4 py-8 text-center text-sm text-text-muted">You're all caught up</p>
              )}

              {pendingCount > 0 && (
                <Row
                  icon={<CloudOff className="h-4 w-4" />}
                  tone="warning"
                  title={`${pendingCount} sale${pendingCount > 1 ? 's' : ''} pending sync`}
                  sub="Tap the sync pill to send them"
                  onClick={() => go('/sales/history')}
                />
              )}
              {outOfStock.map((i) => (
                <Row
                  key={`oos-${i.product_id}`}
                  icon={<PackageX className="h-4 w-4" />}
                  tone="danger"
                  title={i.product_name}
                  sub="Out of stock"
                  onClick={() => go('/inventory')}
                />
              ))}
              {lowStockRows.map((i) => (
                <Row
                  key={`low-${i.product_id}`}
                  icon={<PackageMinus className="h-4 w-4" />}
                  tone="warning"
                  title={i.product_name}
                  sub={`Low · ${i.current_quantity} left`}
                  onClick={() => go('/inventory')}
                />
              ))}
              {expiringRows.map((b) => (
                <Row
                  key={`exp-${b.batch_id}`}
                  icon={<CalendarClock className="h-4 w-4" />}
                  tone="warning"
                  title={b.product_name}
                  sub={
                    b.days_until_expiry <= 0
                      ? 'Expired'
                      : `Expires in ${b.days_until_expiry} day${b.days_until_expiry > 1 ? 's' : ''}`
                  }
                  onClick={() => go('/inventory/expiring')}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  icon,
  title,
  sub,
  tone,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  tone: 'warning' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle"
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-2">{title}</span>
        <span className="block truncate text-xs text-text-muted">{sub}</span>
      </span>
    </button>
  );
}
