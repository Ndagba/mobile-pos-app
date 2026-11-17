/**
 * Who may see or reverse which sale (Bar/Lounge planning, Phase 0 — risks R1, R2, R3;
 * decision D1: applied to ALL stores).
 *
 * Pure functions over the JWT user shape so the rules are unit-testable without
 * Express or Prisma. Routes call these; they never re-implement the checks inline.
 *
 *  - R1  `GET /transactions`: a cashier only ever sees their OWN sales. Any `userId`
 *        filter a cashier sends is overridden with their own id.
 *  - R2  `GET /transactions/:id` (and refund/void lookups): the sale must belong to the
 *        caller's store; a cashier may only open their own sale. Out-of-scope rows are
 *        reported as 404 so IDs from other tenants are not confirmed to exist.
 *  - R3  `POST /transactions/:id/void`: admin / manager (or super-admin) only.
 */

export interface AccessUser {
  userId: string;
  role?: string;
  storeId?: string | null;
  is_super_admin?: boolean;
}

export interface AccessTransaction {
  store_id: string;
  user_id: string;
}

export function isSupervisor(user: AccessUser): boolean {
  return user.role === 'admin' || user.role === 'manager' || !!user.is_super_admin;
}

/** The user id a transaction LIST must be restricted to (undefined = no restriction). */
export function scopedListUserId(user: AccessUser, requestedUserId?: string): string | undefined {
  if (isSupervisor(user)) return requestedUserId;
  return user.userId;
}

/** Whether `user` may open / act on this specific transaction. */
export function canAccessTransaction(user: AccessUser, tx: AccessTransaction): boolean {
  if (user.is_super_admin) return true;
  if (!user.storeId || tx.store_id !== user.storeId) return false;
  if (isSupervisor(user)) return true;
  return tx.user_id === user.userId;
}

/** Store-only check (used where a cashier may legitimately act on a colleague's sale, e.g. refund when enabled). */
export function isSameStore(user: AccessUser, tx: AccessTransaction): boolean {
  if (user.is_super_admin) return true;
  return !!user.storeId && tx.store_id === user.storeId;
}

export function canVoidTransaction(user: AccessUser): boolean {
  return isSupervisor(user);
}
