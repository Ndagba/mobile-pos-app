import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import {
  BusinessMode,
  OperationalProfile,
  canChangeBusinessMode,
  normalizeBusinessMode,
  normalizeOperationalProfile,
} from '../utils/businessMode';

/**
 * Store business mode + user operational profiles (Bar/Lounge planning, Phase 1).
 *
 * Rules implemented here (docs/bar-lounge-mode-planning):
 *  - Mode lives on Store.business_mode; a missing Store row (legacy tenants) reads as `retail`.
 *  - Mode LOCK: once the store has recorded any sale, an admin can no longer change the mode.
 *    Only a super-admin can (decision D3, default). Phase 2–3 will add "no pending bar orders
 *    and no open attendant balances" to the super-admin path once those tables exist.
 *  - Profiles are only for role='cashier' users of the same store, only in bar stores,
 *    and only an admin (or super-admin) may assign them (D16).
 *  - Every change writes an AuditLog row inside the same DB transaction.
 */

interface Actor {
  userId: string;
  role?: string;
  storeId?: string | null;
  is_super_admin?: boolean;
}

export class BusinessModeService {
  /** The store's current mode (fresh from the DB — never trust a token for this). */
  static async getStoreMode(storeId: string | null | undefined): Promise<BusinessMode> {
    if (!storeId) return 'retail';
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { business_mode: true } });
    return normalizeBusinessMode(store?.business_mode);
  }

  /** Locked once any sale exists for the store. */
  static async isModeLocked(storeId: string): Promise<boolean> {
    const count = await prisma.transaction.count({ where: { store_id: storeId } });
    return count > 0;
  }

  static async getModeState(storeId: string | null | undefined) {
    const business_mode = await this.getStoreMode(storeId);
    const business_mode_locked = storeId ? await this.isModeLocked(storeId) : false;
    return { business_mode, business_mode_locked };
  }

  /** The user's current profile + store mode, read fresh (for /auth/me and server guards). */
  static async getUserModeContext(userId: string, storeId: string | null | undefined) {
    const [user, business_mode] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { operational_profile: true, role: true } }),
      this.getStoreMode(storeId),
    ]);
    return {
      business_mode,
      operational_profile: normalizeOperationalProfile(user?.operational_profile),
      role: user?.role,
    };
  }

  static async setStoreMode(storeId: string, requested: unknown, actor: Actor) {
    if (requested !== 'retail' && requested !== 'bar') {
      throw new AppError(400, "business_mode must be 'retail' or 'bar'");
    }
    const mode = requested as BusinessMode;

    if (!actor.is_super_admin && actor.storeId !== storeId) {
      throw new AppError(403, 'You can only change your own store');
    }

    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, business_mode: true } });
    if (!store) throw new AppError(404, 'Store not found');

    const current = normalizeBusinessMode(store.business_mode);
    if (current === mode) {
      return { business_mode: current, business_mode_locked: await this.isModeLocked(storeId), changed: false };
    }

    const locked = await this.isModeLocked(storeId);
    if (!canChangeBusinessMode(actor, locked)) {
      throw new AppError(
        403,
        locked
          ? 'The business mode is locked because this store has recorded sales. Contact JayPOS support to change it.'
          : 'Only an admin can change the business mode'
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: storeId },
        data: { business_mode: mode, business_mode_set_at: new Date() },
      });
      await tx.auditLog.create({
        data: {
          store_id: storeId,
          user_id: actor.userId,
          action: 'CHANGE_BUSINESS_MODE',
          resource_type: 'store',
          resource_id: storeId,
          changes: { from: current, to: mode, locked_at_change: locked, by_super_admin: !!actor.is_super_admin } as any,
        },
      });
    });

    return { business_mode: mode, business_mode_locked: locked, changed: true };
  }

  static async setUserProfile(targetUserId: string, requested: unknown, actor: Actor) {
    const isAdmin = actor.role === 'admin' || !!actor.is_super_admin;
    if (!isAdmin) throw new AppError(403, 'Only an admin can assign bar profiles');

    if (requested !== null && normalizeOperationalProfile(requested) === null) {
      throw new AppError(400, "operational_profile must be 'bar_controller', 'bar_attendant' or null");
    }
    const profile = requested as OperationalProfile | null;

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, store_id: true, role: true, operational_profile: true, is_active: true },
    });
    // Same 404 for "missing" and "other store" so IDs from other tenants are not confirmed.
    if (!target || (!actor.is_super_admin && target.store_id !== actor.storeId)) {
      throw new AppError(404, 'User not found');
    }
    if (profile !== null) {
      if (target.role !== 'cashier') {
        throw new AppError(400, 'Bar profiles can only be given to cashiers');
      }
      if ((await this.getStoreMode(target.store_id)) !== 'bar') {
        throw new AppError(400, 'Bar profiles can only be assigned in a Bar / Lounge store');
      }
    }

    const from = normalizeOperationalProfile(target.operational_profile);
    if (from === profile) {
      return { id: target.id, operational_profile: profile, changed: false };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { operational_profile: profile } });
      await tx.auditLog.create({
        data: {
          store_id: target.store_id,
          user_id: actor.userId,
          action: 'SET_OPERATIONAL_PROFILE',
          resource_type: 'user',
          resource_id: target.id,
          changes: { from, to: profile } as any,
        },
      });
    });

    return { id: target.id, operational_profile: profile, changed: true };
  }
}
