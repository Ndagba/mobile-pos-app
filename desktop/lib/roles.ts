import type { AuthUser } from '@jaypos/shared';

/**
 * UI-side role gating for the desktop app.
 *
 * These mirror the backend's per-route RBAC (see CLAUDE.md §3): inventory
 * management is admin+manager, destructive/bulk actions are admin-only. The
 * backend still enforces every rule — these helpers only decide what to *show*,
 * so a manager never sees a control the server would reject. `is_super_admin`
 * is treated as admin-capable.
 */

type RoleBearer = Pick<AuthUser, 'role' | 'is_super_admin'> | null | undefined;

/** Admin (or super-admin): may delete products/categories and bulk-import. */
export function isAdmin(user: RoleBearer): boolean {
  return user?.role === 'admin' || !!user?.is_super_admin;
}

/** Admin or manager: may view and manage the inventory catalog. Cashiers may not. */
export function canManageInventory(user: RoleBearer): boolean {
  return user?.role === 'admin' || user?.role === 'manager' || !!user?.is_super_admin;
}

/**
 * Admin or manager: may view and manage suppliers, AP invoices and payments.
 * Cashiers may not. The backend gates every supplier write (including deletes) to
 * admin+manager; this only decides what the section shows.
 */
export function canManageSuppliers(user: RoleBearer): boolean {
  return user?.role === 'admin' || user?.role === 'manager' || !!user?.is_super_admin;
}

/**
 * Admin or manager: may raise purchase orders and receive stock. Cashiers may
 * not. The backend gates every PO write (create/edit/receive/delete) to
 * admin+manager; this only decides what the Purchasing section shows.
 */
export function canManagePurchasing(user: RoleBearer): boolean {
  return user?.role === 'admin' || user?.role === 'manager' || !!user?.is_super_admin;
}
