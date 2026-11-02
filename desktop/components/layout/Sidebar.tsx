'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Eye,
  EyeOff,
  User as UserIcon,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { usePrefsStore } from '@/store/prefsStore';
import { useLowStock } from '@/hooks/useLowStock';
import { canManageInventory } from '@/lib/roles';
import { useSettings } from '@/hooks/useSettings';
import { NAV_GROUPS, activeNavHref, navItemAllowed, type NavItem } from './nav';

function initials(name?: string, email?: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const collapsed = usePrefsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = usePrefsStore((s) => s.toggleSidebar);
  const hideAmounts = usePrefsStore((s) => s.hideAmounts);
  const toggleHideAmounts = usePrefsStore((s) => s.toggleHideAmounts);
  const [menuOpen, setMenuOpen] = useState(false);

  // Store settings gate the Customer/Supplier menus for cashiers.
  const { settings } = useSettings();

  // Low-stock count badge on the Inventory nav item (admin/manager only).
  const { data: lowStock } = useLowStock();
  const lowCount = canManageInventory(user) ? lowStock?.length ?? 0 : 0;

  const active = activeNavHref(user, pathname);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const renderItem = (item: NavItem) => {
    if (!navItemAllowed(item, user, settings)) return null;
    const isActive = item.href === active;
    const badge = item.href === '/inventory' && lowCount > 0 ? lowCount : null;

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          'group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-white/[0.1] font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
            : 'font-medium text-[#C9C2F5] hover:bg-white/[0.06] hover:text-white'
        )}
      >
        <item.icon
          className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-[#A99BFF]' : 'text-[#8B81C4]')}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {badge !== null && (
              <span className="rounded-pill bg-warning-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-warning">
                {badge}
              </span>
            )}
            {item.shortcut && badge === null && (
              <kbd className="rounded-chip border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-[#9A90D0]">
                {item.shortcut}
              </kbd>
            )}
          </>
        )}
        {collapsed && badge !== null && (
          <span className="absolute ml-5 -mt-5 h-2 w-2 rounded-pill bg-warning" />
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-white/5 text-white transition-[width] duration-180 ease-out',
        collapsed ? 'w-[72px]' : 'w-[248px]'
      )}
      style={{
        // Deep-indigo gradient drawn from the login scene (#2A1F7A → #140F3D → #0B0824).
        background:
          'radial-gradient(130% 80% at 20% 0%, #2A1F7A 0%, #171046 45%, #0F0A30 100%)'
      }}
    >
      {/* Logo row */}
      <div className={cn('flex h-[60px] items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
        <Image src="/icon.svg" alt="JayPOS" width={32} height={32} className="rounded-[9px]" priority />
        {!collapsed && (
          <span className="text-[19px] font-extrabold leading-none tracking-[-0.04em]">
            <span className="text-white">Jay</span>
            <span className="text-[#A99BFF]">POS</span>
          </span>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => navItemAllowed(i, user, settings));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-1 mt-3 first:mt-1">
              {!collapsed && (
                <p className="px-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/35">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">{items.map(renderItem)}</div>
            </div>
          );
        })}
      </nav>

      {/* Footer: user card + menu, collapse toggle */}
      <div className="relative border-t border-white/10 p-3">
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute bottom-[64px] left-3 right-3 z-40 overflow-hidden rounded-lg border border-border bg-popover shadow-modal">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/profile');
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink-2 hover:bg-surface-subtle"
              >
                <UserIcon className="h-4 w-4 text-text-muted" /> Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleHideAmounts();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink-2 hover:bg-surface-subtle"
              >
                {hideAmounts ? (
                  <Eye className="h-4 w-4 text-text-muted" />
                ) : (
                  <EyeOff className="h-4 w-4 text-text-muted" />
                )}
                {hideAmounts ? 'Show amounts' : 'Hide amounts'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 border-t border-divider px-3 py-2 text-sm text-danger hover:bg-danger-soft"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-white/5',
            collapsed && 'justify-center'
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-white/10 font-mono text-xs font-semibold text-white">
            {initials(user?.first_name, user?.email)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {user?.first_name || user?.email || 'User'}
                </span>
                <span className="block truncate text-2xs capitalize text-[#A79FD6]">
                  {user?.is_super_admin ? 'Super admin' : user?.role}
                </span>
              </span>
              <ChevronUp className="h-4 w-4 shrink-0 text-white/40" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[#9A90D0] transition-colors hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px]" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
