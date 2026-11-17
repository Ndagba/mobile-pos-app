import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/featureGate.middleware';
import { requireBarCapability, requireBusinessMode } from '../middleware/businessMode.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';
import { BarOrderService, serializeOrder } from '../../services/BarOrderService';
import { hasBarCapability } from '../../utils/businessMode';

/**
 * Bar / Lounge API (planning Phase 2) — mounted at /v1/bar.
 *
 * Every route: authenticated, store in `bar` mode (404 otherwise), and a bar
 * capability checked against the caller's role + operational profile read FRESH
 * from the DB (see businessMode.middleware). Branch scope uses the existing
 * branch helper (cashiers = home branch). Attendant data is scoped server-side;
 * no endpoint accepts a user id to look at someone else's orders.
 */
const router = Router();
router.use(authMiddleware);
router.use(requireBusinessMode('bar'));

const actorOf = (req: Request) => {
  const u = (req as any).user;
  // Role from the DB (modeContext) wins over a possibly stale token role.
  return {
    userId: u.userId,
    role: (req as any).modeContext?.role ?? u.role,
    storeId: u.storeId,
    branchId: u.branchId,
    is_super_admin: !!u.is_super_admin,
  };
};

const canViewQueue = (req: Request) => {
  const ctx = (req as any).modeContext;
  const u = (req as any).user;
  return hasBarCapability(
    { role: ctx?.role ?? u.role, is_super_admin: u.is_super_admin, operational_profile: ctx?.operational_profile },
    'bar',
    'bar.order.queue.view'
  );
};

const statusFilter = (raw: unknown) =>
  typeof raw === 'string' && raw.trim()
    ? raw.split(',').map((s) => s.trim()).filter((s) => /^[a-z_]+$/.test(s))
    : undefined;

const send = (res: Response, order: any, extra: Record<string, unknown> = {}, code = 200) =>
  res.status(code).json({ status: 'success', data: { ...serializeOrder(order), ...extra } });

// ── Attendant ───────────────────────────────────────────────

// Submit a new order (Attendants; managers/admins may also order, attributed to themselves).
router.post(
  '/orders',
  requireActiveSubscription,
  requireBarCapability('bar.order.create'),
  catchAsync(async (req: Request, res: Response) => {
    const branchId = await getAuthorizedBranchId(req);
    if (!branchId) throw new AppError(400, 'branch_id is required');
    const { order, stock_warnings, replayed } = await BarOrderService.submit(actorOf(req), branchId, req.body ?? {});
    send(res, order, { stock_warnings, replayed }, replayed ? 200 : 201);
  })
);

// My orders (always scoped to the caller).
router.get(
  '/orders/mine',
  requireBarCapability('bar.order.create'),
  catchAsync(async (req: Request, res: Response) => {
    const orders = await BarOrderService.listMine(actorOf(req), {
      status: statusFilter(req.query.status),
      limit: Number(req.query.limit) || undefined,
    });
    res.json({ status: 'success', data: orders.map(serializeOrder) });
  })
);

// ── Bar Controller ──────────────────────────────────────────

// Queue: open orders oldest-first by default; ?status=fulfilled,... for history.
router.get(
  '/orders/queue',
  requireBarCapability('bar.order.queue.view'),
  catchAsync(async (req: Request, res: Response) => {
    const branchIds = await getAuthorizedBranchIds(req);
    const orders = await BarOrderService.listQueue(actorOf(req), branchIds, {
      status: statusFilter(req.query.status),
      limit: Number(req.query.limit) || undefined,
    });
    res.json({ status: 'success', data: orders.map(serializeOrder) });
  })
);

// Middleware: resolve the caller's branch scope once for the per-order routes.
const withScope = (req: Request, _res: Response, next: NextFunction) => {
  getAuthorizedBranchIds(req)
    .then((ids) => {
      (req as any).barScope = { branchIds: ids, canViewQueue: canViewQueue(req) };
      next();
    })
    .catch(next);
};

// One order: the initiator, or a queue viewer in the branch.
router.get(
  '/orders/:id',
  requireBarCapability('bar.order.cancel_own'), // every bar profile + supervisors hold this
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    const order = await BarOrderService.getOrder(actorOf(req), req.params.id, (req as any).barScope);
    send(res, order);
  })
);

router.post(
  '/orders/:id/cancel',
  requireActiveSubscription,
  requireBarCapability('bar.order.cancel_own'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    const order = await BarOrderService.cancel(actorOf(req), req.params.id, (req as any).barScope, req.body?.reason);
    send(res, order);
  })
);

router.post(
  '/orders/:id/accept',
  requireActiveSubscription,
  requireBarCapability('bar.order.fulfil'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.accept(actorOf(req), req.params.id, (req as any).barScope.branchIds));
  })
);

router.post(
  '/orders/:id/release',
  requireActiveSubscription,
  requireBarCapability('bar.order.fulfil'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.release(actorOf(req), req.params.id, (req as any).barScope.branchIds));
  })
);

router.post(
  '/orders/:id/reject',
  requireActiveSubscription,
  requireBarCapability('bar.order.reject'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.reject(actorOf(req), req.params.id, (req as any).barScope.branchIds, req.body?.reason));
  })
);

router.post(
  '/orders/:id/fulfil',
  requireActiveSubscription,
  requireBarCapability('bar.order.fulfil'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.fulfil(actorOf(req), req.params.id, (req as any).barScope.branchIds, req.body ?? {}));
  })
);

// Declare / correct how the customer paid (initiator or controller).
router.post(
  '/orders/:id/payment',
  requireActiveSubscription,
  requireBarCapability('bar.order.declare_payment'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.declarePayment(actorOf(req), req.params.id, (req as any).barScope, req.body ?? {}));
  })
);

// ── Manager / admin ─────────────────────────────────────────

router.post(
  '/orders/:id/reverse',
  requireActiveSubscription,
  requireBarCapability('bar.reversal.approve'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.reverse(actorOf(req), req.params.id, (req as any).barScope.branchIds, req.body?.reason));
  })
);

export default router;
