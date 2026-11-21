import { Request, Response, NextFunction } from 'express';
import { BusinessModeService } from '../../services/BusinessModeService';
import { AppError } from '../../utils/errorHandler';
import { BarCapability, BusinessMode, canUseRetailCheckout, hasBarCapability } from '../../utils/businessMode';

/**
 * Business-mode guards (Bar/Lounge planning, Phase 1). All of them read the store
 * mode and the caller's operational profile FRESH from the DB, so a stale 24h JWT
 * can't keep acting after a profile or mode change.
 *
 * Every guard attaches `req.modeContext = { business_mode, operational_profile }`.
 */

async function loadContext(req: Request) {
  const user = (req as any).user;
  if (!user) throw new AppError(401, 'Authentication required');
  // Read once per request: the /bar router guard and the per-route capability
  // guard both need it, and it is already fresh from the DB for this request.
  const ctx = (req as any).modeContext ?? (await BusinessModeService.getUserModeContext(user.userId, user.storeId));
  (req as any).modeContext = ctx;
  return {
    ctx,
    modeUser: {
      // The DB role wins over the token role if they differ (e.g. demoted user).
      role: ctx.role ?? user.role,
      is_super_admin: !!user.is_super_admin,
      operational_profile: ctx.operational_profile,
    },
  };
}

const wrap =
  (fn: (req: Request) => Promise<void>) => (req: Request, _res: Response, next: NextFunction) =>
    fn(req).then(() => next(), next);

/** 404 the route entirely for stores in another mode (e.g. /v1/bar/* in a retail store). */
export const requireBusinessMode = (mode: BusinessMode) =>
  wrap(async (req) => {
    const { ctx } = await loadContext(req);
    if (ctx.business_mode !== mode) {
      throw new AppError(404, 'Not available for this store');
    }
  });

/** 403 unless the caller holds a bar capability (implies the store is in bar mode). */
export const requireBarCapability = (capability: BarCapability) =>
  wrap(async (req) => {
    const { ctx, modeUser } = await loadContext(req);
    if (ctx.business_mode !== 'bar') throw new AppError(404, 'Not available for this store');
    if (!hasBarCapability(modeUser, ctx.business_mode, capability)) {
      throw new AppError(403, 'You do not have permission to do this');
    }
  });

/**
 * Retail checkout guard for POST /transactions and /transactions/batch.
 * Retail stores: no-op (one indexed lookup). Bar stores: Attendants and
 * un-profiled cashiers are refused — an Attendant's sale must go through the
 * Bar Controller so the drinks' release is controlled.
 */
export const blockRetailCheckoutForBarAttendants = wrap(async (req) => {
  const { ctx, modeUser } = await loadContext(req);
  if (!canUseRetailCheckout(modeUser, ctx.business_mode)) {
    throw new AppError(
      403,
      ctx.operational_profile === 'bar_attendant'
        ? 'Attendants submit orders to the Bar Controller instead of selling directly.'
        : 'Ask your admin to assign you a bar profile before selling.'
    );
  }
});
