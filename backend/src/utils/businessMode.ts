/**
 * MIRROR of shared/src/modes/businessMode.ts — keep the two byte-for-byte equivalent
 * below this header. backend/ is not an npm-workspace member, so it cannot import
 * @jaypos/shared; both copies are pinned by shared/src/modes/capability-matrix.json
 * (tests: shared businessMode.test.ts + backend tests/unit/businessMode.test.ts).
 */
/**
 * Business modes & operational profiles (Bar/Lounge planning, Phase 1).
 *
 * A store runs in one business mode. In a `bar` store, cashiers carry an
 * operational profile on top of their unchanged `role = 'cashier'`:
 *   - `bar_controller` — Bar Controller (Cashier One): releases drinks, records remittances
 *   - `bar_attendant`  — Attendant (Cashier Two): takes orders from customers
 *
 * This is the client copy of the capability map. The backend keeps an identical
 * copy in `backend/src/utils/businessMode.ts` (backend is not a workspace member);
 * both are pinned by the same truth-table tests. The server is always the authority —
 * clients use this only to decide what to show.
 *
 * Pure TypeScript: no React / React Native / Next imports.
 */

export type BusinessMode = 'retail' | 'bar';
export type OperationalProfile = 'bar_controller' | 'bar_attendant';

export const BUSINESS_MODES: readonly BusinessMode[] = ['retail', 'bar'];
export const OPERATIONAL_PROFILES: readonly OperationalProfile[] = ['bar_controller', 'bar_attendant'];

/** UI labels (decision N1). */
export const BUSINESS_MODE_LABELS: Record<BusinessMode, string> = {
  retail: 'Standard Retail',
  bar: 'Bar / Lounge',
};

export const OPERATIONAL_PROFILE_LABELS: Record<OperationalProfile, string> = {
  bar_controller: 'Bar Controller (Cashier One)',
  bar_attendant: 'Attendant (Cashier Two)',
};

export const OPERATIONAL_PROFILE_SHORT_LABELS: Record<OperationalProfile, string> = {
  bar_controller: 'Bar Controller',
  bar_attendant: 'Attendant',
};

/** Anything unknown or missing is treated as retail (the safe default for existing stores). */
export function normalizeBusinessMode(value: unknown): BusinessMode {
  return value === 'bar' ? 'bar' : 'retail';
}

export function normalizeOperationalProfile(value: unknown): OperationalProfile | null {
  return value === 'bar_controller' || value === 'bar_attendant' ? value : null;
}

export interface ModeUser {
  role?: string | null;
  is_super_admin?: boolean | null;
  operational_profile?: string | null;
}

function isSupervisor(user: ModeUser | null | undefined): boolean {
  return user?.role === 'admin' || user?.role === 'manager' || !!user?.is_super_admin;
}

function isAdmin(user: ModeUser | null | undefined): boolean {
  return user?.role === 'admin' || !!user?.is_super_admin;
}

/** A cashier's effective bar profile. Admins/managers and retail stores have none. */
export function effectiveProfile(user: ModeUser | null | undefined, mode: BusinessMode): OperationalProfile | null {
  if (mode !== 'bar' || !user || isSupervisor(user)) return null;
  return normalizeOperationalProfile(user.operational_profile);
}

/**
 * May this user use the normal retail checkout?
 *  - retail store: everyone (unchanged behaviour)
 *  - bar store: admins/managers, and Bar Controllers for direct walk-up sales as
 *    their own sale (decision D10). Attendants and un-profiled cashiers may not —
 *    an attendant's direct sale would bypass the controller's release control.
 */
export function canUseRetailCheckout(user: ModeUser | null | undefined, mode: BusinessMode): boolean {
  if (mode !== 'bar') return true;
  if (isSupervisor(user)) return true;
  return effectiveProfile(user, mode) === 'bar_controller';
}

export type BarCapability =
  | 'bar.order.create'
  | 'bar.order.cancel_own'
  | 'bar.order.queue.view'
  | 'bar.order.fulfil'
  | 'bar.order.reject'
  | 'bar.order.declare_payment'
  | 'bar.reversal.request'
  | 'bar.reversal.approve'
  | 'bar.remittance.record'
  | 'bar.remittance.reverse_after_close'
  | 'bar.ledger.view_own'
  | 'bar.ledger.view_all'
  | 'bar.ledger.write_off'
  | 'bar.ledger.adjust'
  | 'bar.damage.record'
  | 'bar.dayclose.submit'
  | 'bar.dayclose.acknowledge'
  | 'bar.commission.manage'
  | 'bar.reports.view'
  | 'bar.settings.manage'
  | 'bar.profiles.assign';

export const BAR_CAPABILITIES: readonly BarCapability[] = [
  'bar.order.create',
  'bar.order.cancel_own',
  'bar.order.queue.view',
  'bar.order.fulfil',
  'bar.order.reject',
  'bar.order.declare_payment',
  'bar.reversal.request',
  'bar.reversal.approve',
  'bar.remittance.record',
  'bar.remittance.reverse_after_close',
  'bar.ledger.view_own',
  'bar.ledger.view_all',
  'bar.ledger.write_off',
  'bar.ledger.adjust',
  'bar.damage.record',
  'bar.dayclose.submit',
  'bar.dayclose.acknowledge',
  'bar.commission.manage',
  'bar.reports.view',
  'bar.settings.manage',
  'bar.profiles.assign',
];

const ATTENDANT: BarCapability[] = [
  'bar.order.create',
  'bar.order.cancel_own',
  'bar.order.declare_payment',
  'bar.reversal.request',
  'bar.ledger.view_own',
];

const CONTROLLER: BarCapability[] = [
  'bar.order.cancel_own',
  'bar.order.queue.view',
  'bar.order.fulfil',
  'bar.order.reject',
  'bar.order.declare_payment',
  'bar.reversal.request',
  'bar.remittance.record',
  'bar.ledger.view_all',
  'bar.damage.record',
  'bar.dayclose.submit',
];

const MANAGER: BarCapability[] = [
  ...CONTROLLER,
  'bar.order.create',
  'bar.reversal.approve',
  'bar.remittance.reverse_after_close',
  'bar.ledger.write_off',
  'bar.dayclose.acknowledge',
  'bar.commission.manage',
  'bar.reports.view',
  'bar.settings.manage',
];

const ADMIN: BarCapability[] = [...MANAGER, 'bar.ledger.adjust', 'bar.profiles.assign'];

/** Every bar capability this user holds. Always empty in a retail store. */
export function barCapabilities(user: ModeUser | null | undefined, mode: BusinessMode): Set<BarCapability> {
  if (mode !== 'bar' || !user) return new Set();
  if (isAdmin(user)) return new Set(ADMIN);
  if (user.role === 'manager') return new Set(MANAGER);
  const profile = effectiveProfile(user, mode);
  if (profile === 'bar_controller') return new Set(CONTROLLER);
  if (profile === 'bar_attendant') return new Set(ATTENDANT);
  return new Set();
}

export function hasBarCapability(
  user: ModeUser | null | undefined,
  mode: BusinessMode,
  capability: BarCapability
): boolean {
  return barCapabilities(user, mode).has(capability);
}

/** Only an admin may choose the mode, and only before the first sale (D3: super-admin afterwards). */
export function canChangeBusinessMode(user: ModeUser | null | undefined, locked: boolean): boolean {
  if (user?.is_super_admin) return true;
  return user?.role === 'admin' && !locked;
}
