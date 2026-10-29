'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AuthUser } from '@jaypos/shared';
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  Package,
  Truck,
  ClipboardList,
  BarChart3,
  Store,
  Users,
  Wallet,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canManageInventory, canManageSuppliers, canManagePurchasing } from '@/lib/roles';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not yet built — rendered but non-navigable in Phase 1. */
  disabled?: boolean;
  /** Role gate — hidden entirely when this returns false. Absent → always shown. */
  visible?: (user: AuthUser | null) => boolean;
  /** Additional path prefixes that activate this nav item */
  matchPaths?: string[];
}

/**
 * Primary navigation. Dashboard/Sales/History/Inventory/Suppliers are wired;
 * Reports is shown (disabled) to convey the app's shape without producing a 404,
 * lighting up when Phase 5 lands. Inventory and Suppliers are gated to
 * admin + manager — a cashier never sees them (mobile parity).
 */
const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sales', href: '/sales', icon: ShoppingCart },
  { label: 'History', href: '/sales/history', icon: History },
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Inventory', href: '/inventory', icon: Package, visible: canManageInventory },
  { label: 'Suppliers', href: '/suppliers', icon: Truck, visible: canManageSuppliers },
  { label: 'Purchasing', href: '/purchasing', icon: ClipboardList, visible: canManagePurchasing },
  { label: 'Expenses', href: '/admin/expenses', icon: Wallet, visible: canManageInventory },
  { label: 'Report', href: '/reports', icon: BarChart3, matchPaths: ['/admin/financials'] },
  { label: 'Settings', href: '/settings', icon: Store, visible: (user) => user?.role === 'admin' || user?.role === 'manager' },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const nav = NAV.filter((i) => !i.visible || i.visible(user));

  // A single active item: the longest nav href that matches the current path, so
  // /sales/history lights up "History" (not its /sales prefix).
  const activeHref = nav
    .filter((i) => !i.disabled)
    .map((i) => i.href)
    .filter((href) => {
      const item = nav.find((i) => i.href === href);
      return (
        pathname === href ||
        pathname.startsWith(`${href}/`) ||
        item?.matchPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))
      );
    })
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <Store className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">JayPOS</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {nav.map((item) => {
          const active = item.href === activeHref;
          const className = cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            item.disabled
              ? 'cursor-not-allowed text-muted-foreground/50'
              : active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          );
          const content = (
            <>
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.disabled && (
                <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>
              )}
            </>
          );

          return item.disabled ? (
            <div key={item.href} className={className} aria-disabled="true">
              {content}
            </div>
          ) : (
            <Link key={item.href} href={item.href} className={className}>
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
