import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/featureGate.middleware';
import { requireBarCapability, requireBusinessMode } from '../middleware/businessMode.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';
import { BarOrderService, serializeOrder } from '../../services/BarOrderService';
import { hasBarCapability } from '../../utils/businessMode';
import { BarLedgerService } from '../../services/BarLedgerService';

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

// ── Reversal requests (Phase 3) ─────────────────────────────

router.post(
  '/orders/:id/request-reversal',
  requireActiveSubscription,
  requireBarCapability('bar.reversal.request'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.requestReversal(actorOf(req), req.params.id, (req as any).barScope, req.body?.reason));
  })
);

router.post(
  '/orders/:id/decline-reversal',
  requireActiveSubscription,
  requireBarCapability('bar.reversal.approve'),
  withScope,
  catchAsync(async (req: Request, res: Response) => {
    send(res, await BarOrderService.declineReversal(actorOf(req), req.params.id, (req as any).barScope.branchIds, req.body?.reason));
  })
);

// ── Attendant: my balance (Phase 3) — always scoped to the caller ──

router.get(
  '/me/summary',
  requireBarCapability('bar.ledger.view_own'),
  catchAsync(async (req: Request, res: Response) => {
    const a = actorOf(req);
    res.json({ status: 'success', data: await BarLedgerService.cashierSummary(a.storeId, a.userId, req.query.date) });
  })
);

router.get(
  '/me/ledger',
  requireBarCapability('bar.ledger.view_own'),
  catchAsync(async (req: Request, res: Response) => {
    const a = actorOf(req);
    const data = await BarLedgerService.entries(a.storeId, a.userId, {
      from: req.query.from, to: req.query.to, limit: Number(req.query.limit) || undefined,
    });
    res.json({ status: 'success', data });
  })
);

router.get(
  '/me/remittances',
  requireBarCapability('bar.ledger.view_own'),
  catchAsync(async (req: Request, res: Response) => {
    const a = actorOf(req);
    const data = await BarLedgerService.remittances(a.storeId, { cashierId: a.userId, limit: Number(req.query.limit) || undefined });
    res.json({ status: 'success', data });
  })
);

// ── Bar Controller / manager: every Attendant (Phase 3) ──────

router.get(
  '/dashboard',
  requireBarCapability('bar.ledger.view_all'),
  catchAsync(async (req: Request, res: Response) => {
    const branchIds = await getAuthorizedBranchIds(req);
    res.json({ status: 'success', data: await BarLedgerService.dashboard(actorOf(req).storeId, branchIds, req.query.date) });
  })
);

/** Resolve :id to an Attendant the caller may see (same store; branch scope for non-admins). */
const cashierInScope = async (req: Request) => {
  const a = actorOf(req);
  const cashier = await BarLedgerService.resolveCashier(a, req.params.id);
  if (a.role !== 'admin' && !a.is_super_admin) {
    const branchIds = await getAuthorizedBranchIds(req);
    if (!cashier.branch_id || !branchIds.includes(cashier.branch_id)) throw new AppError(404, 'Attendant not found');
  }
  return { actor: a, cashier };
};

router.get(
  '/cashiers/:id/summary',
  requireBarCapability('bar.ledger.view_all'),
  catchAsync(async (req: Request, res: Response) => {
    const { cashier } = await cashierInScope(req);
    res.json({ status: 'success', data: await BarLedgerService.cashierSummary(cashier.store_id, cashier.id, req.query.date) });
  })
);

router.get(
  '/cashiers/:id/ledger',
  requireBarCapability('bar.ledger.view_all'),
  catchAsync(async (req: Request, res: Response) => {
    const { cashier } = await cashierInScope(req);
    const data = await BarLedgerService.entries(cashier.store_id, cashier.id, {
      from: req.query.from, to: req.query.to, limit: Number(req.query.limit) || undefined,
    });
    res.json({ status: 'success', data });
  })
);

router.get(
  '/cashiers/:id/remittances',
  requireBarCapability('bar.ledger.view_all'),
  catchAsync(async (req: Request, res: Response) => {
    const { cashier } = await cashierInScope(req);
    const data = await BarLedgerService.remittances(cashier.store_id, { cashierId: cashier.id, limit: Number(req.query.limit) || undefined });
    res.json({ status: 'success', data });
  })
);

router.post(
  '/cashiers/:id/write-off',
  requireActiveSubscription,
  requireBarCapability('bar.ledger.write_off'),
  catchAsync(async (req: Request, res: Response) => {
    const { actor, cashier } = await cashierInScope(req);
    res.json({ status: 'success', data: await BarLedgerService.writeOff(actor, cashier.id, req.body?.amount, req.body?.reason) });
  })
);

router.post(
  '/cashiers/:id/adjustment',
  requireActiveSubscription,
  requireBarCapability('bar.ledger.adjust'),
  catchAsync(async (req: Request, res: Response) => {
    const { actor, cashier } = await cashierInScope(req);
    res.json({ status: 'success', data: await BarLedgerService.adjust(actor, cashier.id, req.body?.amount, req.body?.reason) });
  })
);

// ── Remittances (Phase 3) ────────────────────────────────────

router.post(
  '/remittances',
  requireActiveSubscription,
  requireBarCapability('bar.remittance.record'),
  catchAsync(async (req: Request, res: Response) => {
    const a = actorOf(req);
    if (a.role !== 'admin' && !a.is_super_admin) {
      // Branch scope: only Attendants of branches the caller covers.
      const target = await BarLedgerService.resolveCashier(a, req.body?.cashier_user_id);
      const branchIds = await getAuthorizedBranchIds(req);
      if (!target.branch_id || !branchIds.includes(target.branch_id)) throw new AppError(404, 'Attendant not found');
    }
    const r = await BarLedgerService.recordRemittance(a, req.body ?? {});
    res.status(r.replayed ? 200 : 201).json({ status: 'success', data: { ...r.remittance, outstanding_after: r.outstanding_after, replayed: r.replayed } });
  })
);

router.get(
  '/remittances',
  requireBarCapability('bar.ledger.view_all'),
  catchAsync(async (req: Request, res: Response) => {
    const branchIds = await getAuthorizedBranchIds(req);
    const data = await BarLedgerService.remittances(actorOf(req).storeId, {
      branchIds, date: req.query.date, limit: Number(req.query.limit) || undefined,
    });
    res.json({ status: 'success', data });
  })
);

router.post(
  '/remittances/:id/reverse',
  requireActiveSubscription,
  requireBarCapability('bar.remittance.record'),
  catchAsync(async (req: Request, res: Response) => {
    res.json({ status: 'success', data: await BarLedgerService.reverseRemittance(actorOf(req), req.params.id, req.body?.reason) });
  })
);

export default router;
