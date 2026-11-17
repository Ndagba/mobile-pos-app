import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import { TransactionService } from './TransactionService';
import { businessDateToDbDate, getBusinessDate } from '../utils/businessDate';
import { appendLedgerEntry } from './BarLedgerService';

/**
 * Bar / Lounge orders (planning Phase 2).
 *
 * An Attendant (Cashier Two) submits an order; the Bar Controller (Cashier One)
 * accepts it, releases the drinks and FULFILS it. Fulfilment is the only step with
 * money or stock effects, and it is atomic:
 *   order → fulfilled  +  one completed Transaction (user_id = Attendant,
 *   fulfilled_by_user_id = Controller, sales_order_id = order)  +  stock decrement
 *   + `sale` movements  +  audit row — all in ONE DB transaction, or nothing.
 *
 * Integrity guarantees:
 *  - Prices/totals are computed HERE from the catalog at submission (D8 snapshot);
 *    the client sends product ids + quantities only.
 *  - The seller of record is read from the ORDER row, never from a request body.
 *  - State changes use conditional `updateMany` (status in the WHERE clause), so two
 *    controllers racing on the same order get exactly one winner; the loser sees 409.
 *    `Transaction.sales_order_id @unique` is the database-level backstop.
 *  - Submission is idempotent on `client_ref`.
 *  - Nobody (except an admin, logged) fulfils an order they initiated themselves.
 *
 * Not in Phase 2 (by roadmap): the Attendant ledger (Phase 3), the two-step reversal
 * request/approval (Phase 3 — here a manager reverses directly), day close (Phase 4),
 * attendant discounts (setting exists; orders carry no discount yet).
 */

export interface BarActor {
  userId: string;
  role?: string;
  storeId?: string | null;
  branchId?: string | null;
  is_super_admin?: boolean;
}

export const OPEN_STATUSES = ['submitted', 'accepted'] as const;
const SINGLE_METHODS = ['cash', 'transfer', 'card'] as const;
type SingleMethod = (typeof SINGLE_METHODS)[number];

const MAX_LINES = 50;
const MAX_QTY = 10000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const isSupervisor = (a: BarActor) => a.role === 'admin' || a.role === 'manager' || !!a.is_super_admin;
const isAdmin = (a: BarActor) => a.role === 'admin' || !!a.is_super_admin;

const ORDER_INCLUDE = {
  items: { include: { product: { select: { name: true, sku: true, item_type: true } } } },
  initiated_by: { select: { id: true, first_name: true, last_name: true } },
  accepted_by: { select: { id: true, first_name: true, last_name: true } },
  fulfilled_by: { select: { id: true, first_name: true, last_name: true } },
  transaction: { select: { id: true, receipt_number: true, status: true } },
} satisfies Prisma.BarOrderInclude;

type OrderWithRelations = Prisma.BarOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));
const personName = (u?: { first_name: string | null; last_name: string | null } | null) =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null;

/** JSON-safe order shape for the API (Decimals → numbers). */
export function serializeOrder(o: OrderWithRelations) {
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    store_id: o.store_id,
    branch_id: o.branch_id,
    table_label: o.table_label,
    notes: o.notes,
    initiated_by: { id: o.initiated_by_user_id, name: personName(o.initiated_by) },
    accepted_by: o.accepted_by_user_id ? { id: o.accepted_by_user_id, name: personName(o.accepted_by) } : null,
    fulfilled_by: o.fulfilled_by_user_id ? { id: o.fulfilled_by_user_id, name: personName(o.fulfilled_by) } : null,
    subtotal: num(o.subtotal),
    tax_amount: num(o.tax_amount),
    discount_amount: num(o.discount_amount),
    total_amount: num(o.total_amount),
    fulfilled_total: num(o.fulfilled_total),
    customer_payment_method: o.customer_payment_method,
    customer_payment_splits: o.customer_payment_splits,
    customer_payment_ref: o.customer_payment_ref,
    business_date: o.business_date ? o.business_date.toISOString().slice(0, 10) : null,
    submitted_at: o.submitted_at,
    accepted_at: o.accepted_at,
    fulfilled_at: o.fulfilled_at,
    closed_reason: o.closed_reason,
    closed_at: o.closed_at,
    reversal_request: o.reversal_requested_at
      ? { by: o.reversal_requested_by_user_id, at: o.reversal_requested_at, reason: o.reversal_request_reason }
      : null,
    transaction: o.transaction,
    items: o.items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product?.name ?? null,
      quantity_requested: num(it.quantity_requested),
      quantity_fulfilled: num(it.quantity_fulfilled),
      unit_price: num(it.unit_price),
      tax_rate: num(it.tax_rate),
      line_total: num(it.line_total),
    })),
  };
}

/** Server-side line math — the house rule from shared/buildTransactionInput:
 *  line_total = price × qty (excl. tax); line tax = round2(price × qty × rate / 100);
 *  subtotal / tax are rounded once on the sums; total = subtotal + tax − discount. */
export function priceLines(lines: { unit_price: number; tax_rate: number; quantity: number }[]) {
  let subtotal = 0;
  let tax = 0;
  const priced = lines.map((l) => {
    const gross = l.unit_price * l.quantity;
    const lineTax = (gross * l.tax_rate) / 100;
    subtotal += gross;
    tax += lineTax;
    return { line_total: round2(gross), tax_amount: round2(lineTax) };
  });
  const sub = round2(subtotal);
  const t = round2(tax);
  return { priced, subtotal: sub, tax_amount: t, total_amount: round2(sub + t) };
}

async function storeDayOptions(storeId: string) {
  const s = await prisma.storeSetting.findUnique({
    where: { store_id: storeId },
    select: { bar_business_day_cutoff_hour: true, bar_timezone: true, bar_require_payment_declaration: true },
  });
  return {
    cutoffHour: s?.bar_business_day_cutoff_hour ?? 6,
    timeZone: s?.bar_timezone ?? 'Africa/Lagos',
    requireDeclaration: !!s?.bar_require_payment_declaration,
  };
}

async function audit(
  tx: Prisma.TransactionClient,
  actor: BarActor,
  order: { id: string; store_id: string; branch_id: string },
  action: string,
  changes: Record<string, unknown>
) {
  await tx.auditLog.create({
    data: {
      store_id: order.store_id,
      branch_id: order.branch_id,
      user_id: actor.userId,
      action,
      resource_type: 'bar_order',
      resource_id: order.id,
      changes: changes as any,
    },
  });
}

function validateReason(reason: unknown, what: string): string {
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < 3) throw new AppError(400, `A reason is required to ${what}`);
  return r.slice(0, 500);
}

function validateSplits(splits: any, total: number) {
  if (!splits || typeof splits !== 'object') throw new AppError(400, 'payment_splits is required for a split payment');
  const parts = (['cash', 'card', 'transfer'] as const).map((k) => {
    const n = splits[k] === undefined || splits[k] === null ? 0 : Number(splits[k]);
    if (!Number.isFinite(n) || n < 0) throw new AppError(400, `payment_splits.${k} must be a non-negative amount`);
    return round2(n);
  });
  const sum = round2(parts.reduce((a, b) => a + b, 0));
  if (Math.abs(sum - total) > 0.009) {
    throw new AppError(400, `Split payments must add up to the order total (₦${total.toLocaleString()})`);
  }
  if (parts.filter((p) => p > 0).length < 2) throw new AppError(400, 'A split payment needs at least two methods');
  return { cash: parts[0], card: parts[1], transfer: parts[2] };
}

export class BarOrderService {
  // ── Reads ──────────────────────────────────────────────────

  static async findScoped(actor: BarActor, id: string) {
    const order = await prisma.barOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order || (!actor.is_super_admin && order.store_id !== actor.storeId)) {
      throw new AppError(404, 'Order not found');
    }
    return order;
  }

  /** Initiator always; otherwise only queue viewers in an authorized branch. */
  static async getOrder(actor: BarActor, id: string, opts: { canViewQueue: boolean; branchIds: string[] }) {
    const order = await this.findScoped(actor, id);
    const mine = order.initiated_by_user_id === actor.userId;
    if (!mine && !(opts.canViewQueue && opts.branchIds.includes(order.branch_id))) {
      throw new AppError(404, 'Order not found');
    }
    return order;
  }

  static async listMine(actor: BarActor, opts: { status?: string[]; limit?: number } = {}) {
    return prisma.barOrder.findMany({
      where: {
        store_id: actor.storeId ?? '__none__',
        initiated_by_user_id: actor.userId, // server-side scope — no user id is ever taken from the request
        ...(opts.status?.length ? { status: { in: opts.status } } : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: { submitted_at: 'desc' },
      take: Math.min(Math.max(opts.limit ?? 50, 1), 200),
    });
  }

  static async listQueue(actor: BarActor, branchIds: string[], opts: { status?: string[]; limit?: number } = {}) {
    return prisma.barOrder.findMany({
      where: {
        store_id: actor.storeId ?? '__none__',
        branch_id: { in: branchIds },
        status: { in: opts.status?.length ? opts.status : [...OPEN_STATUSES] },
      },
      include: ORDER_INCLUDE,
      // Oldest first for the open queue (FIFO); newest first for history views.
      orderBy: { submitted_at: opts.status?.length ? 'desc' : 'asc' },
      take: Math.min(Math.max(opts.limit ?? 100, 1), 200),
    });
  }

  // ── Submit ─────────────────────────────────────────────────

  static async submit(
    actor: BarActor,
    branchId: string,
    body: {
      client_ref?: unknown;
      items?: unknown;
      table_label?: unknown;
      notes?: unknown;
      customer_payment_method?: unknown;
      customer_payment_ref?: unknown;
    }
  ) {
    const storeId = actor.storeId;
    if (!storeId) throw new AppError(403, 'No store on this account');

    const clientRef = typeof body.client_ref === 'string' ? body.client_ref.trim() : '';
    if (clientRef.length < 8 || clientRef.length > 100) {
      throw new AppError(400, 'client_ref (8–100 characters) is required');
    }

    // Idempotent replay: same device retrying the same submit gets the same order.
    const existing = await prisma.barOrder.findUnique({ where: { client_ref: clientRef }, include: ORDER_INCLUDE });
    if (existing) {
      if (existing.initiated_by_user_id !== actor.userId || existing.store_id !== storeId) {
        throw new AppError(409, 'client_ref already used');
      }
      return { order: existing, stock_warnings: [] as any[], replayed: true };
    }

    if (!Array.isArray(body.items) || body.items.length === 0) throw new AppError(400, 'Add at least one item');
    // Merge duplicate products; validate quantities.
    const qtyByProduct = new Map<string, number>();
    for (const raw of body.items as any[]) {
      const pid = typeof raw?.product_id === 'string' ? raw.product_id : '';
      const q = Number(raw?.quantity);
      if (!pid) throw new AppError(400, 'Every item needs a product_id');
      if (!Number.isFinite(q) || q <= 0 || q > MAX_QTY) throw new AppError(400, 'Item quantities must be positive');
      qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q);
    }
    if (qtyByProduct.size > MAX_LINES) throw new AppError(400, `An order can have at most ${MAX_LINES} products`);

    const day = await storeDayOptions(storeId);
    let method: SingleMethod;
    if (body.customer_payment_method === undefined || body.customer_payment_method === null) {
      if (day.requireDeclaration) throw new AppError(400, 'Choose how the customer is paying');
      method = 'cash';
    } else if (SINGLE_METHODS.includes(body.customer_payment_method as SingleMethod)) {
      method = body.customer_payment_method as SingleMethod;
    } else {
      throw new AppError(400, "customer_payment_method must be 'cash', 'transfer' or 'card' (split can be declared after fulfilment)");
    }

    const products = await prisma.product.findMany({
      where: { id: { in: [...qtyByProduct.keys()] }, branch_id: branchId, is_active: true },
      include: { inventory: true },
    });
    if (products.length !== qtyByProduct.size) {
      throw new AppError(400, 'Some products are not available in this branch');
    }

    const lines = products.map((p) => ({
      product_id: p.id,
      name: p.name,
      quantity: qtyByProduct.get(p.id)!,
      unit_price: Number(p.effective_price),
      tax_rate: Number(p.tax_rate ?? 0),
      available: p.item_type === 'PRODUCT' ? Number(p.inventory?.quantity_on_hand ?? 0) - Number(p.inventory?.quantity_reserved ?? 0) : null,
    }));
    const totals = priceLines(lines);

    // No reservation (D5) — just tell the Attendant if the bar looks short.
    const stock_warnings = lines
      .filter((l) => l.available !== null && l.available < l.quantity)
      .map((l) => ({ product_id: l.product_id, product_name: l.name, requested: l.quantity, available: l.available }));

    const businessDate = getBusinessDate(new Date(), { cutoffHour: day.cutoffHour, timeZone: day.timeZone });
    const prefix = `B-${businessDate.replace(/-/g, '')}-`;

    const tableLabel = typeof body.table_label === 'string' ? body.table_label.trim().slice(0, 40) || null : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) || null : null;
    const paymentRef =
      typeof body.customer_payment_ref === 'string' ? body.customer_payment_ref.trim().slice(0, 100) || null : null;

    // Human order number per store per business day; retry on the rare collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await prisma.barOrder.count({ where: { store_id: storeId, order_number: { startsWith: prefix } } });
      const orderNumber = `${prefix}${String(count + 1 + attempt).padStart(4, '0')}`;
      try {
        const created = await prisma.$transaction(async (tx) => {
          const order = await tx.barOrder.create({
            data: {
              store_id: storeId,
              branch_id: branchId,
              order_number: orderNumber,
              client_ref: clientRef,
              status: 'submitted',
              initiated_by_user_id: actor.userId,
              table_label: tableLabel,
              notes,
              subtotal: totals.subtotal,
              tax_amount: totals.tax_amount,
              discount_amount: 0,
              total_amount: totals.total_amount,
              customer_payment_method: method,
              customer_payment_ref: paymentRef,
              items: {
                create: lines.map((l, i) => ({
                  product_id: l.product_id,
                  quantity_requested: l.quantity,
                  unit_price: l.unit_price,
                  tax_rate: l.tax_rate,
                  line_total: totals.priced[i].line_total,
                })),
              },
            },
          });
          await audit(tx, actor, order, 'BAR_ORDER_SUBMITTED', {
            order_number: orderNumber,
            total_amount: totals.total_amount,
            lines: lines.length,
          });
          return order;
        });
        const full = await prisma.barOrder.findUniqueOrThrow({ where: { id: created.id }, include: ORDER_INCLUDE });
        return { order: full, stock_warnings, replayed: false };
      } catch (e: any) {
        if (e?.code === 'P2002') {
          const target = String(e?.meta?.target ?? '');
          if (target.includes('client_ref')) {
            // Concurrent replay of the same submit — return the winner.
            const winner = await prisma.barOrder.findUnique({ where: { client_ref: clientRef }, include: ORDER_INCLUDE });
            if (winner && winner.initiated_by_user_id === actor.userId) return { order: winner, stock_warnings, replayed: true };
          }
          continue; // order_number collision — try the next number
        }
        throw e;
      }
    }
    throw new AppError(503, 'Could not allocate an order number — please try again');
  }

  // ── State changes before fulfilment ────────────────────────

  private static async conflict(id: string, attempted: string): Promise<never> {
    const now = await prisma.barOrder.findUnique({ where: { id }, select: { status: true, accepted_by_user_id: true } });
    if (!now) throw new AppError(404, 'Order not found');
    if (now.status === 'accepted' && attempted !== 'release') {
      throw new AppError(409, 'Another Bar Controller is handling this order');
    }
    throw new AppError(409, `This order is already ${now.status}`);
  }

  static async accept(actor: BarActor, id: string, branchIds: string[]) {
    const order = await this.findScoped(actor, id);
    if (!branchIds.includes(order.branch_id)) throw new AppError(404, 'Order not found');
    if (order.initiated_by_user_id === actor.userId && !isAdmin(actor)) {
      throw new AppError(403, 'You cannot handle an order you placed yourself');
    }
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: { id, status: 'submitted' },
        data: { status: 'accepted', accepted_by_user_id: actor.userId, accepted_at: new Date() },
      });
      if (r.count === 1) await audit(tx, actor, order, 'BAR_ORDER_ACCEPTED', {});
      return r.count;
    });
    if (res !== 1) await this.conflict(id, 'accept');
    return this.findScoped(actor, id);
  }

  static async release(actor: BarActor, id: string, branchIds: string[]) {
    const order = await this.findScoped(actor, id);
    if (!branchIds.includes(order.branch_id)) throw new AppError(404, 'Order not found');
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: {
          id,
          status: 'accepted',
          ...(isSupervisor(actor) ? {} : { accepted_by_user_id: actor.userId }),
        },
        data: { status: 'submitted', accepted_by_user_id: null, accepted_at: null },
      });
      if (r.count === 1) await audit(tx, actor, order, 'BAR_ORDER_RELEASED', { previously_accepted_by: order.accepted_by_user_id });
      return r.count;
    });
    if (res !== 1) await this.conflict(id, 'release');
    return this.findScoped(actor, id);
  }

  static async reject(actor: BarActor, id: string, branchIds: string[], reasonRaw: unknown) {
    const reason = validateReason(reasonRaw, 'reject an order');
    const order = await this.findScoped(actor, id);
    if (!branchIds.includes(order.branch_id)) throw new AppError(404, 'Order not found');
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: {
          id,
          status: { in: [...OPEN_STATUSES] },
          ...(isSupervisor(actor)
            ? {}
            : { OR: [{ accepted_by_user_id: null }, { accepted_by_user_id: actor.userId }] }),
        },
        data: { status: 'rejected', closed_reason: reason, closed_by_user_id: actor.userId, closed_at: new Date() },
      });
      if (r.count === 1) await audit(tx, actor, order, 'BAR_ORDER_REJECTED', { reason });
      return r.count;
    });
    if (res !== 1) await this.conflict(id, 'reject');
    return this.findScoped(actor, id);
  }

  /** Attendant: own order while `submitted`. Controllers/managers: any `submitted` order in their branches. */
  static async cancel(actor: BarActor, id: string, opts: { canViewQueue: boolean; branchIds: string[] }, reasonRaw: unknown) {
    const reason = validateReason(reasonRaw, 'cancel an order');
    const order = await this.findScoped(actor, id);
    const mine = order.initiated_by_user_id === actor.userId;
    if (!mine && !(opts.canViewQueue && opts.branchIds.includes(order.branch_id))) {
      throw new AppError(404, 'Order not found');
    }
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: { id, status: 'submitted' },
        data: { status: 'cancelled', closed_reason: reason, closed_by_user_id: actor.userId, closed_at: new Date() },
      });
      if (r.count === 1) await audit(tx, actor, order, 'BAR_ORDER_CANCELLED', { reason, by_initiator: mine });
      return r.count;
    });
    if (res !== 1) {
      const now = await prisma.barOrder.findUnique({ where: { id }, select: { status: true } });
      if (now?.status === 'accepted') {
        throw new AppError(409, 'The Bar Controller is already preparing this order — ask them to reject it instead');
      }
      await this.conflict(id, 'cancel');
    }
    return this.findScoped(actor, id);
  }

  // ── Fulfil (the only step with money + stock effects) ──────

  static async fulfil(
    actor: BarActor,
    id: string,
    branchIds: string[],
    body: { lines?: unknown; reduction_reason?: unknown }
  ) {
    const order = await this.findScoped(actor, id);
    if (!branchIds.includes(order.branch_id)) throw new AppError(404, 'Order not found');
    if (!OPEN_STATUSES.includes(order.status as any)) {
      throw new AppError(409, `This order is already ${order.status}`);
    }
    if (order.status === 'accepted' && order.accepted_by_user_id !== actor.userId && !isSupervisor(actor)) {
      throw new AppError(409, 'Another Bar Controller is handling this order');
    }
    const selfFulfil = order.initiated_by_user_id === actor.userId;
    if (selfFulfil && !isAdmin(actor)) {
      throw new AppError(403, 'You cannot release an order you placed yourself');
    }

    // Quantities to release: default = requested; reductions only go DOWN.
    const fulfilQty = new Map(order.items.map((it) => [it.id, Number(it.quantity_requested)]));
    const reductions: { item_id: string; from: number; to: number }[] = [];
    if (body.lines !== undefined) {
      if (!Array.isArray(body.lines)) throw new AppError(400, 'lines must be a list');
      for (const raw of body.lines as any[]) {
        const item = order.items.find((it) => it.id === raw?.item_id);
        if (!item) throw new AppError(400, 'Unknown order line');
        const q = Number(raw?.quantity);
        const requested = Number(item.quantity_requested);
        if (!Number.isFinite(q) || q < 0) throw new AppError(400, 'Released quantities cannot be negative');
        if (q > requested) throw new AppError(400, 'You can release less than was ordered, never more');
        fulfilQty.set(item.id, q);
        if (q < requested) reductions.push({ item_id: item.id, from: requested, to: q });
      }
    }
    const reductionReason = reductions.length ? validateReason(body.reduction_reason, 'release fewer items than ordered') : null;

    const lines = order.items
      .map((it) => ({
        item_id: it.id,
        product_id: it.product_id,
        quantity: fulfilQty.get(it.id)!,
        unit_price: Number(it.unit_price),
        tax_rate: Number(it.tax_rate),
      }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) throw new AppError(400, 'Nothing to release — reject the order instead');

    const totals = priceLines(lines);
    const day = await storeDayOptions(order.store_id);
    const businessDate = getBusinessDate(new Date(), { cutoffHour: day.cutoffHour, timeZone: day.timeZone });
    const businessDateDb = businessDateToDbDate(businessDate);
    const now = new Date();
    const method = order.customer_payment_method ?? 'cash';

    await prisma.$transaction(async (tx) => {
      await BarOrderService.fulfilInTx(tx, actor, order, {
        id, now, totals, lines, fulfilQty, reductions, reductionReason, selfFulfil, businessDate, businessDateDb, method,
      });
    }).catch((e: any) => {
      // Unique backstops (sales_order_id / offline_session_hash) → someone else won.
      if (e?.code === 'P2002') throw new AppError(409, 'This order was just handled by someone else');
      throw e;
    });

    logger.info({ event: 'bar_order_fulfilled', order_id: id, by: actor.userId, total: totals.total_amount });
    return this.findScoped(actor, id);
  }

  private static async fulfilInTx(
    tx: Prisma.TransactionClient,
    actor: BarActor,
    order: OrderWithRelations,
    p: {
      id: string;
      now: Date;
      totals: ReturnType<typeof priceLines>;
      lines: { item_id: string; product_id: string; quantity: number; unit_price: number; tax_rate: number }[];
      fulfilQty: Map<string, number>;
      reductions: { item_id: string; from: number; to: number }[];
      reductionReason: string | null;
      selfFulfil: boolean;
      businessDate: string;
      businessDateDb: Date;
      method: string;
    }
  ) {
    const { id, now, totals, lines, fulfilQty, reductions, reductionReason, selfFulfil, businessDate, businessDateDb, method } = p;
    {
      // 1. Claim the order (row-locked, conditional): exactly one fulfiller wins.
      const claimed = await tx.barOrder.updateMany({
        where: {
          id,
          status: { in: [...OPEN_STATUSES] },
          ...(isSupervisor(actor)
            ? {}
            : { OR: [{ accepted_by_user_id: null }, { accepted_by_user_id: actor.userId }] }),
        },
        data: {
          status: 'fulfilled',
          accepted_by_user_id: order.accepted_by_user_id ?? actor.userId,
          accepted_at: order.accepted_at ?? now,
          fulfilled_by_user_id: actor.userId,
          fulfilled_at: now,
          fulfilled_total: totals.total_amount,
          business_date: businessDateDb,
          closed_reason: reductionReason,
        },
      });
      if (claimed.count !== 1) throw new AppError(409, 'This order was just handled by someone else');

      // 2. Record what was actually released.
      for (const it of order.items) {
        await tx.barOrderItem.update({ where: { id: it.id }, data: { quantity_fulfilled: fulfilQty.get(it.id)! } });
      }

      // 3. Post the completed sale through the shared posting core.
      await TransactionService.postSale(tx, {
        id: uuidv4(),
        receipt_number: `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        store_id: order.store_id,
        branch_id: order.branch_id,
        user_id: order.initiated_by_user_id, // seller of record = the Attendant (from the ORDER row)
        offline_session_hash: `bar-order:${order.id}`, // deterministic → second DB-level dedupe
        subtotal: totals.subtotal,
        tax_amount: totals.tax_amount,
        discount_amount: 0,
        total_amount: totals.total_amount,
        payment_method: method,
        items: lines.map((l, i) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_amount: totals.priced[i].tax_amount,
          discount_amount: 0,
          line_total: totals.priced[i].line_total,
        })),
        sales_order_id: order.id,
        fulfilled_by_user_id: actor.userId,
        business_date: businessDateDb,
      });

      // 4. The Attendant now owes the released amount (Phase 3 ledger).
      await appendLedgerEntry(tx, {
        store_id: order.store_id,
        branch_id: order.branch_id,
        cashier_user_id: order.initiated_by_user_id,
        entry_type: 'SALE',
        amount: totals.total_amount,
        business_date: businessDateDb,
        source_type: 'bar_order',
        source_id: order.id,
        recorded_by_user_id: actor.userId,
      });

      // 5. Audit, in the same unit.
      await audit(tx, actor, order, 'BAR_ORDER_FULFILLED', {
        order_number: order.order_number,
        attendant_id: order.initiated_by_user_id,
        total_amount: totals.total_amount,
        ordered_total: Number(order.total_amount),
        reductions,
        reduction_reason: reductionReason,
        self_fulfil: selfFulfil,
        business_date: businessDate,
      });
    }
  }

  // ── After fulfilment ───────────────────────────────────────

  /**
   * Declare how the customer paid. Initiator, or a queue viewer in the branch.
   * On a fulfilled order this also updates the sale's payment fields so existing
   * EOD / payment-mix reports stay right. Day-close locking arrives in Phase 4.
   */
  static async declarePayment(
    actor: BarActor,
    id: string,
    opts: { canViewQueue: boolean; branchIds: string[] },
    body: { method?: unknown; splits?: unknown; reference?: unknown }
  ) {
    const order = await this.getOrder(actor, id, opts);
    if (!['submitted', 'accepted', 'fulfilled'].includes(order.status)) {
      throw new AppError(409, `This order is ${order.status}`);
    }
    const method = body.method;
    const total = Number(order.fulfilled_total ?? order.total_amount);
    let splits: { cash: number; card: number; transfer: number } | null = null;
    if (method === 'split') {
      if (order.status !== 'fulfilled') throw new AppError(400, 'Split payments can be declared once the order is released');
      splits = validateSplits(body.splits, total);
    } else if (!SINGLE_METHODS.includes(method as SingleMethod)) {
      throw new AppError(400, "method must be 'cash', 'transfer', 'card' or 'split'");
    }
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 100) || null : null;

    await prisma.$transaction(async (tx) => {
      await tx.barOrder.update({
        where: { id },
        data: {
          customer_payment_method: method as string,
          customer_payment_splits: splits ?? Prisma.DbNull,
          customer_payment_ref: reference,
        },
      });
      if (order.status === 'fulfilled' && order.transaction) {
        await tx.transaction.update({
          where: { id: order.transaction.id },
          data: {
            payment_method: method as string,
            payment_splits: splits ?? Prisma.DbNull,
            payment_reference: splits
              ? `Cash: ₦${splits.cash.toLocaleString()}, Card: ₦${splits.card.toLocaleString()}, Transfer: ₦${splits.transfer.toLocaleString()}`
              : reference,
          },
        });
      }
      await audit(tx, actor, order, 'BAR_PAYMENT_DECLARED', {
        from: { method: order.customer_payment_method, splits: order.customer_payment_splits },
        to: { method, splits },
        reference,
      });
    });
    return this.findScoped(actor, id);
  }

  /**
   * Attendant (own order) or Bar Controller (branch): ask a manager to reverse a
   * released order — e.g. unopened bottles came back. Nothing moves until approved.
   */
  static async requestReversal(
    actor: BarActor,
    id: string,
    opts: { canViewQueue: boolean; branchIds: string[] },
    reasonRaw: unknown
  ) {
    const reason = validateReason(reasonRaw, 'ask for a reversal');
    const order = await this.getOrder(actor, id, opts);
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: { id, status: 'fulfilled' },
        data: {
          status: 'reversal_requested',
          reversal_requested_by_user_id: actor.userId,
          reversal_requested_at: new Date(),
          reversal_request_reason: reason,
        },
      });
      if (r.count === 1) await audit(tx, actor, order, 'BAR_REVERSAL_REQUESTED', { reason });
      return r.count;
    });
    if (res !== 1) await this.conflict(id, 'request reversal');
    return this.findScoped(actor, id);
  }

  /** Manager declines a reversal request: the order goes back to released, untouched. */
  static async declineReversal(actor: BarActor, id: string, branchIds: string[], reasonRaw: unknown) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager or admin can decide reversals');
    const reason = validateReason(reasonRaw, 'decline a reversal');
    const order = await this.findScoped(actor, id);
    if (!branchIds.includes(order.branch_id)) throw new AppError(404, 'Order not found');
    const res = await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: { id, status: 'reversal_requested' },
        data: {
          status: 'fulfilled',
          reversal_requested_by_user_id: null,
          reversal_requested_at: null,
          reversal_request_reason: null,
        },
      });
      if (r.count === 1) {
        await audit(tx, actor, order, 'BAR_REVERSAL_DECLINED', {
          reason,
          requested_by: order.reversal_requested_by_user_id,
          request_reason: order.reversal_request_reason,
        });
      }
      return r.count;
    });
    if (res !== 1) await this.conflict(id, 'decline reversal');
    return this.findScoped(actor, id);
  }

  /**
   * Reverse a released order (manager/admin) — directly, or by approving a request.
   * One atomic unit: order → reversed, stock restored + sale voided (voidSaleCore),
   * a SALE_REVERSAL ledger entry that cancels the Attendant's SALE entry (dated
   * today, so past business days are never rewritten), and the audit row.
   * Approving your own request is refused unless you are an admin (logged).
   */
  static async reverse(actor: BarActor, id: string, branchIds: string[], reasonRaw: unknown) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager or admin can reverse a released order');
    const reason = validateReason(reasonRaw, 'reverse an order');
    const order = await this.findScoped(actor, id);
    if (!branchIds.includes(order.branch_id)) throw new AppError(404, 'Order not found');
    if (order.status !== 'fulfilled' && order.status !== 'reversal_requested') {
      throw new AppError(409, `Only released orders can be reversed (this one is ${order.status})`);
    }
    if (order.reversal_requested_by_user_id === actor.userId && !isAdmin(actor)) {
      throw new AppError(403, 'You cannot approve a reversal you asked for');
    }
    const day = await storeDayOptions(order.store_id);
    const todayDb = businessDateToDbDate(getBusinessDate(new Date(), { cutoffHour: day.cutoffHour, timeZone: day.timeZone }));

    await prisma.$transaction(async (tx) => {
      const r = await tx.barOrder.updateMany({
        where: { id, status: { in: ['fulfilled', 'reversal_requested'] } },
        data: { status: 'reversed', closed_reason: reason, closed_by_user_id: actor.userId, closed_at: new Date() },
      });
      if (r.count !== 1) throw new AppError(409, 'This order was just changed by someone else');

      const sale = await tx.transaction.findUnique({
        where: { sales_order_id: id },
        include: { transaction_items: { include: { product: { select: { item_type: true } } } } },
      });
      if (sale && sale.status !== 'voided') {
        await TransactionService.voidSaleCore(tx, sale, `Bar order ${order.order_number} reversed: ${reason}`, actor.userId);
      }

      const saleEntry = await tx.cashierLedgerEntry.findUnique({
        where: { entry_type_source_type_source_id: { entry_type: 'SALE', source_type: 'bar_order', source_id: id } },
      });
      if (saleEntry) {
        await appendLedgerEntry(tx, {
          store_id: order.store_id,
          branch_id: order.branch_id,
          cashier_user_id: saleEntry.cashier_user_id,
          entry_type: 'SALE_REVERSAL',
          amount: -Number(saleEntry.amount),
          business_date: todayDb,
          source_type: 'bar_order',
          source_id: id,
          reverses_entry_id: saleEntry.id,
          reason,
          recorded_by_user_id: actor.userId,
        });
      }

      await audit(tx, actor, order, 'BAR_ORDER_REVERSED', {
        reason,
        transaction_id: sale?.id ?? null,
        amount: Number(order.fulfilled_total ?? order.total_amount),
        approved_request: order.status === 'reversal_requested',
        requested_by: order.reversal_requested_by_user_id,
        ledger_reversed: !!saleEntry,
      });
    });
    return this.findScoped(actor, id);
  }
}
