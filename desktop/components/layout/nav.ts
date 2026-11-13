import type { AuthUser } from '@jaypos/shared';
import {
  LayoutDashboard,
  ShoppingCart,
  History,
  Banknote,
  ScrollText,
  Building2,
  Users,
  Package,
  Truck,
  ClipboardList,
  Wallet,
  BarChart3,
  UserCog,
  Settings,
  type LucideIcon
} from 'lucide-react';
import {
  canManageInventory,
  canManageSuppliers,
  canManagePurchasing,
  canViewReports,
  canManageUsers,
  canViewAuditLog,
  canManageSettings
} from '@/lib/roles';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Role gate — hidden entirely when this returns false. Absent → always shown. */
  visible?: (user: AuthUser | null) => boolean;
  /** Extra path prefixes that also activate this item. */
  matchPaths?: string[];
  /** Keyboard hint chip (e.g. "F2"), shown on the right of the nav row. */
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Primary navigation, grouped per handoff §4.1. Role gating mirrors the backend
 * RBAC (via lib/roles) and the longest-prefix active match is computed by the
 * Sidebar. Keep this the single source of truth — the command menu reads it too.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Sell',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, matchPaths: ['/admin/dashboard'] },
      { label: 'New sale', href: '/sales', icon: ShoppingCart, shortcut: 'F2' },
      { label: 'Sales history', href: '/sales/history', icon: History, shortcut: 'F3' },
      { label: 'Cash shifts', href: '/shifts', icon: Banknote },
      { label: 'Customers', href: '/customers', icon: Users }
    ]
  },
  {
    label: 'Stock',
    items: [
      { label: 'Inventory', href: '/inventory', icon: Package, visible: canManageInventory },
      { label: 'Purchasing', href: '/purchasing', icon: ClipboardList, visible: canManagePurchasing },
      { label: 'Suppliers', href: '/suppliers', icon: Truck, visible: canManageSuppliers }
    ]
  },
  {
    label: 'Money',
    items: [
      { label: 'Expenses', href: '/admin/expenses', icon: Wallet, visible: canManageInventory },
      {
        label: 'Reports',
        href: '/reports',
        icon: BarChart3,
        matchPaths: ['/admin/financials'],
        visible: canViewReports
      }
    ]
  },
  {
    label: 'Admin',
    items: [
      { label: 'Users & roles', href: '/users', icon: UserCog, visible: canManageUsers },
      { label: 'Branches', href: '/branches', icon: Building2, visible: canManageUsers },
      { label: 'Audit log', href: '/admin/audit', icon: ScrollText, visible: canViewAuditLog },
      { label: 'Settings', href: '/settings', icon: Settings, visible: canManageSettings }
    ]
  }
];

/** The cashier menu-visibility toggles from store settings (customer/supplier). */
export interface MenuToggles {
  customer_menu_enabled?: boolean;
  supplier_menu_enabled?: boolean;
}

/**
 * Whether a nav item should show, combining the role gate with the cashier
 * menu toggles. The Customer/Supplier menu toggles only hide the item from
 * **cashiers** (admins/managers always see them). A missing/undefined setting is
 * treated as enabled so the menu never flickers while settings load.
 */
export function navItemAllowed(
  item: NavItem,
  user: AuthUser | null,
  settings?: MenuToggles | null
): boolean {
  if (item.visible && !item.visible(user)) return false;
  const isCashier = user?.role === 'cashier' && !user?.is_super_admin;
  if (isCashier) {
    if (item.href === '/customers' && settings?.customer_menu_enabled === false) return false;
    if (item.href === '/suppliers' && settings?.supplier_menu_enabled === false) return false;
  }
  return true;
}

/** Flat, role-filtered item list — used by the command menu and active matching. */
export function visibleNavItems(user: AuthUser | null, settings?: MenuToggles | null): NavItem[] {
  return NAV_GROUPS.flatMap((g) => g.items).filter((i) => navItemAllowed(i, user, settings));
}

/**
 * The single active href: the longest visible nav href that prefixes the current
 * path, so /sales/history lights "Sales history" (not its /sales prefix).
 */
export function activeNavHref(user: AuthUser | null, pathname: string): string | undefined {
  return visibleNavItems(user)
    .filter(
      (i) =>
        pathname === i.href ||
        pathname.startsWith(`${i.href}/`) ||
        i.matchPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    )
    .map((i) => i.href)
    .sort((a, b) => b.length - a.length)[0];
}
