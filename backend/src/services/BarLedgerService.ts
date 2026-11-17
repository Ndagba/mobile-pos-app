import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { businessDateToDbDate, getBusinessDate } from '../utils/businessDate';
import { assertDayOpen } from './barDayGuard';

/**
 * Attendant ledger + remittances (Bar/Lounge planning Phase 3).
 *
 * What an Attendant owes = SUM(CashierLedgerEntry.amount) — never stored, never
 * reset, so balances carry forward across business days by construction:
 *   opening(D)  = Σ entries with business_date < D        ("brought forward")
 *   day(D)      = Σ entries with business_date = D, by type
 *   closing(D)  = opening(D) + day(D)
 *
 * Signs: + increases what the Attendant owes.
 *   SALE (+) on release · SALE_REVERSAL (−) on an approved reversal
 *   REMITTANCE (−) money handed to the Bar Controller · REMITTANCE_REVERSAL (+)
 *   WRITE_OFF (−) manager forgives (shortage, departed staff) · ADJUSTMENT (±, admin)
 *
 * Every entry is append-only and written in the SAME DB transaction as the
 * business event and its audit row. A reversal points at the entry it reverses
 * (`reverses_entry_id @unique`), so nothing can be reversed twice.
 *
 * Damage never touches this ledger (decision D24: flat beer is a house loss).
 * Day-close locking of past business dates arrives in Phase 4.
 */

export interface LedgerActor {
  userId: string;
  role?: string;
  storeId?: string | null;
  is_super_admin?: boolean;
}

export type LedgerEntryType =
  | 'SALE'
  | 'SALE_REVERSAL'
  | 'REMITTANCE'
  | 'REMITTANCE_REVERSAL'
  | 'WRITE_OFF'
  | 'ADJUSTMENT';

const REMIT_METHODS = ['cash', 'transfer', 'card', 'other'] as const;
type RemitMethod = (typeof REMIT_METHODS)[number];
const MAX_AMOUNT = 100_000_000;
/** Bar Controllers may back-date a remittance this many days when the store allows it. */
export const CONTROLLER_BACKDATE_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;
const n = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const isSupervisor = (a: LedgerActor) => a.role === 'admin' || a.role === 'manager' || !!a.is_super_admin;
const isAdmin = (a: LedgerActor) => a.role === 'admin' || !!a.is_super_admin;

export async function storeBusinessDay(storeId: string) {
  const s = await prisma.storeSetting.findUnique({
    where: { store_id: storeId },
    select: { bar_business_day_cutoff_hour: true, bar_timezone: true, bar_allow_backdated_remittance: true },
  });
  const opts = { cutoffHour: s?.bar_business_day_cutoff_hour ?? 6, timeZone: s?.bar_timezone ?? 'Africa/Lagos' };
  return { ...opts, today: getBusinessDate(new Date(), opts), allowBackdate: !!s?.bar_allow_backdated_remittance };
}

/** Append one ledger entry on the caller's DB transaction. */
export async function appendLedgerEntry(
  tx: Prisma.TransactionClient,
  e: {
    store_id: string;
    branch_id: string;
    cashier_user_id: string;
    entry_type: LedgerEntryType;
    amount: number;
    business_date: Date;
    source_type: string;
    source_id: string;
    reverses_entry_id?: string | null;
    reason?: string | null;
    recorded_by_user_id: string;
  }
) {
  return tx.cashierLedgerEntry.create({ data: { ...e, amount: round2(e.amount) } });
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function parseDate(raw: unknown, fallback: string): string {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new AppError(400, 'Dates must be YYYY-MM-DD');
  }
  return raw;
}

function validateReason(reason: unknown, what: string): string {
  const r = typeof reason === 'string' ? reason.trim() : '';
  if (r.length < 3) throw new AppError(400, `A reason is required to ${what}`);
  return r.slice(0, 500);
}

async function audit(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  storeId: string,
  branchId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, unknown>
) {
  await tx.auditLog.create({
    data: {
      store_id: storeId,
      branch_id: branchId,
      user_id: actor.userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      changes: changes as any,
    },
  });
}

/** Expand per-sale payment fields (incl. split JSON) into a method → amount mix. */
function addPaymentMix(
  mix: Record<string, number>,
  row: { payment_method: string; total_amount: Prisma.Decimal | number; payment_splits: any }
) {
  if (row.payment_method === 'split' && row.payment_splits && typeof row.payment_splits === 'object') {
    for (const k of ['cash', 'transfer', 'card'] as const) {
      const v = Number(row.payment_splits[k] ?? 0);
      if (v) mix[k] = round2((mix[k] ?? 0) + v);
    }
  } else {
    mix[row.payment_method] = round2((mix[row.payment_method] ?? 0) + n(row.total_amount));
  }
}

export class BarLedgerService {
  // ── Balances ───────────────────────────────────────────────

  static async outstanding(storeId: string, cashierId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
    const agg = await client.cashierLedgerEntry.aggregate({
      where: { store_id: storeId, cashier_user_id: cashierId },
      _sum: { amount: true },
    });
    return round2(n(agg._sum.amount));
  }

  /**
   * One Attendant's reconciliation for a business date: brought forward, the
   * day's movements, closing, plus order counts and payment mixes.
   */
  static async cashierSummary(storeId: string, cashierId: string, dateRaw?: unknown) {
    const day = await storeBusinessDay(storeId);
    const date = parseDate(dateRaw, day.today);
    const dateDb = businessDateToDbDate(date);

    const [openingAgg, dayRows, nowAgg, pending, completed, sales, remits, user] = await Promise.all([
      prisma.cashierLedgerEntry.aggregate({
        where: { store_id: storeId, cashier_user_id: cashierId, business_date: { lt: dateDb } },
        _sum: { amount: true },
      }),
      prisma.cashierLedgerEntry.groupBy({
        by: ['entry_type'],
        where: { store_id: storeId, cashier_user_id: cashierId, business_date: dateDb },
        _sum: { amount: true },
      }),
      prisma.cashierLedgerEntry.aggregate({
        where: { store_id: storeId, cashier_user_id: cashierId },
        _sum: { amount: true },
      }),
      prisma.barOrder.count({
        where: { store_id: storeId, initiated_by_user_id: cashierId, status: { in: ['submitted', 'accepted'] } },
      }),
      prisma.barOrder.count({
        where: { store_id: storeId, initiated_by_user_id: cashierId, status: 'fulfilled', business_date: dateDb },
      }),
      prisma.transaction.findMany({
        where: {
          store_id: storeId,
          user_id: cashierId,
          sales_order_id: { not: null },
          status: 'completed',
          business_date: dateDb,
        },
        select: { payment_method: true, total_amount: true, payment_splits: true },
      }),
      prisma.cashierRemittance.groupBy({
        by: ['method'],
        where: { store_id: storeId, cashier_user_id: cashierId, business_date: dateDb, status: 'recorded' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.user.findUnique({
        where: { id: cashierId },
        select: { id: true, first_name: true, last_name: true, is_active: true, operational_profile: true, branch_id: true },
      }),
    ]);

    const byType = Object.fromEntries(dayRows.map((r) => [r.entry_type, n(r._sum.amount)])) as Record<string, number>;
    const get = (t: string) => byType[t] ?? 0;
    const opening = round2(n(openingAgg._sum.amount));
    const sales_total = round2(get('SALE') + get('SALE_REVERSAL'));
    const remitted = round2(-(get('REMITTANCE') + get('REMITTANCE_REVERSAL')));
    const written_off = round2(-get('WRITE_OFF'));
    const adjustments = round2(get('ADJUSTMENT'));
    const closing = round2(opening + sales_total - remitted - written_off + adjustments);

    const payment_mix: Record<string, number> = {};
    for (const s of sales) addPaymentMix(payment_mix, s);
    const remittance_mix: Record<string, number> = {};
    for (const r of remits) remittance_mix[r.method] = round2(n(r._sum.amount));

    return {
      business_date: date,
      today: day.today,
      cashier: user
        ? {
            id: user.id,
            name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
            is_active: user.is_active,
            operational_profile: user.operational_profile,
          }
        : { id: cashierId, name: null, is_active: false, operational_profile: null },
      brought_forward: opening,
      sales: sales_total,
      remitted,
      written_off,
      adjustments,
      closing_balance: closing,
      outstanding_now: round2(n(nowAgg._sum.amount)),
      pending_orders: pending,
      completed_orders: completed,
      payment_mix, // how customers paid this Attendant (declared on orders)
      remittance_mix, // what the Bar Controller actually received from them
    };
  }

  /** Bar Controller / manager overview: every Attendant in scope for a business date. */
  static async dashboard(storeId: string, branchIds: string[], dateRaw?: unknown) {
    const day = await storeBusinessDay(storeId);
    const date = parseDate(dateRaw, day.today);
    const dateDb = businessDateToDbDate(date);

    // People in scope: Attendants of these branches + anyone with ledger activity here.
    const [profiled, active] = await Promise.all([
      prisma.user.findMany({
        where: { store_id: storeId, operational_profile: 'bar_attendant', branch_id: { in: branchIds } },
        select: { id: true },
      }),
      prisma.cashierLedgerEntry.findMany({
        where: { store_id: storeId, branch_id: { in: branchIds } },
        distinct: ['cashier_user_id'],
        select: { cashier_user_id: true },
      }),
    ]);
    const ids = [...new Set([...profiled.map((u) => u.id), ...active.map((a) => a.cashier_user_id)])];

    const [users, openingRows, dayRows, nowRows, orderRows, sales, remits] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, first_name: true, last_name: true, is_active: true, operational_profile: true },
      }),
      prisma.cashierLedgerEntry.groupBy({
        by: ['cashier_user_id'],
        where: { store_id: storeId, cashier_user_id: { in: ids }, business_date: { lt: dateDb } },
        _sum: { amount: true },
      }),
      prisma.cashierLedgerEntry.groupBy({
        by: ['cashier_user_id', 'entry_type'],
        where: { store_id: storeId, cashier_user_id: { in: ids }, business_date: dateDb },
        _sum: { amount: true },
      }),
      prisma.cashierLedgerEntry.groupBy({
        by: ['cashier_user_id'],
        where: { store_id: storeId, cashier_user_id: { in: ids } },
        _sum: { amount: true },
      }),
      prisma.barOrder.groupBy({
        by: ['initiated_by_user_id', 'status'],
        where: {
          store_id: storeId,
          branch_id: { in: branchIds },
          OR: [{ status: { in: ['submitted', 'accepted', 'reversal_requested'] } }, { status: 'fulfilled', business_date: dateDb }],
        },
        _count: { _all: true },
      }),
      prisma.transaction.findMany({
        where: {
          store_id: storeId,
          branch_id: { in: branchIds },
          sales_order_id: { not: null },
          status: 'completed',
          business_date: dateDb,
        },
        select: { payment_method: true, total_amount: true, payment_splits: true },
      }),
      prisma.cashierRemittance.groupBy({
        by: ['method'],
        where: { store_id: storeId, branch_id: { in: branchIds }, business_date: dateDb, status: 'recorded' },
        _sum: { amount: true },
      }),
    ]);

    const openingBy = new Map(openingRows.map((r) => [r.cashier_user_id, n(r._sum.amount)]));
    const nowBy = new Map(nowRows.map((r) => [r.cashier_user_id, n(r._sum.amount)]));
    const dayBy = new Map<string, Record<string, number>>();
    for (const r of dayRows) {
      const m = dayBy.get(r.cashier_user_id) ?? {};
      m[r.entry_type] = n(r._sum.amount);
      dayBy.set(r.cashier_user_id, m);
    }
    const ordersBy = new Map<string, { pending: number; completed: number; reversal_requests: number }>();
    for (const r of orderRows) {
      const m = ordersBy.get(r.initiated_by_user_id) ?? { pending: 0, completed: 0, reversal_requests: 0 };
      if (r.status === 'fulfilled') m.completed += r._count._all;
      else if (r.status === 'reversal_requested') m.reversal_requests += r._count._all;
      else m.pending += r._count._all;
      ordersBy.set(r.initiated_by_user_id, m);
    }

    const rows = users
      .map((u) => {
        const d = dayBy.get(u.id) ?? {};
        const g = (t: string) => d[t] ?? 0;
        const opening = round2(openingBy.get(u.id) ?? 0);
        const sales_total = round2(g('SALE') + g('SALE_REVERSAL'));
        const remitted = round2(-(g('REMITTANCE') + g('REMITTANCE_REVERSAL')));
        const written_off = round2(-g('WRITE_OFF'));
        const adjustments = round2(g('ADJUSTMENT'));
        const o = ordersBy.get(u.id) ?? { pending: 0, completed: 0, reversal_requests: 0 };
        return {
          cashier_id: u.id,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
          is_active: u.is_active,
          operational_profile: u.operational_profile,
          brought_forward: opening,
          sales: sales_total,
          remitted,
          written_off,
          adjustments,
          closing_balance: round2(opening + sales_total - remitted - written_off + adjustments),
          outstanding_now: round2(nowBy.get(u.id) ?? 0),
          pending_orders: o.pending,
          completed_orders: o.completed,
          reversal_requests: o.reversal_requests,
        };
      })
      .sort((a, b) => b.outstanding_now - a.outstanding_now);

    const sum = (k: keyof (typeof rows)[number]) => round2(rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0));
    const payment_mix: Record<string, number> = {};
    for (const s of sales) addPaymentMix(payment_mix, s);
    const remittance_mix: Record<string, number> = {};
    for (const r of remits) remittance_mix[r.method] = round2(n(r._sum.amount));

    return {
      business_date: date,
      today: day.today,
      totals: {
        brought_forward: sum('brought_forward'),
        sales: sum('sales'),
        remitted: sum('remitted'),
        written_off: sum('written_off'),
        closing_balance: sum('closing_balance'),
        outstanding_now: sum('outstanding_now'),
        pending_orders: sum('pending_orders'),
        completed_orders: sum('completed_orders'),
        reversal_requests: sum('reversal_requests'),
        inactive_with_balance: rows.filter((r) => !r.is_active && Math.abs(r.outstanding_now) > 0.009).length,
      },
      attendants: rows,
      payment_mix,
      remittance_mix,
    };
  }

  static async entries(storeId: string, cashierId: string, opts: { from?: unknown; to?: unknown; limit?: number } = {}) {
    const where: Prisma.CashierLedgerEntryWhereInput = { store_id: storeId, cashier_user_id: cashierId };
    if (opts.from || opts.to) {
      where.business_date = {};
      if (opts.from) where.business_date.gte = businessDateToDbDate(parseDate(opts.from, ''));
      if (opts.to) where.business_date.lte = businessDateToDbDate(parseDate(opts.to, ''));
    }
    const rows = await prisma.cashierLedgerEntry.findMany({
      where,
      orderBy: [{ business_date: 'desc' }, { created_at: 'desc' }],
      take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
    });
    return rows.map((r) => ({
      id: r.id,
      entry_type: r.entry_type,
      amount: n(r.amount),
      business_date: r.business_date.toISOString().slice(0, 10),
      source_type: r.source_type,
      source_id: r.source_id,
      reverses_entry_id: r.reverses_entry_id,
      reason: r.reason,
      recorded_by_user_id: r.recorded_by_user_id,
      created_at: r.created_at,
    }));
  }

  static async remittances(
    storeId: string,
    opts: { cashierId?: string; branchIds?: string[]; date?: unknown; limit?: number } = {}
  ) {
    const where: Prisma.CashierRemittanceWhereInput = { store_id: storeId };
    if (opts.cashierId) where.cashier_user_id = opts.cashierId;
    if (opts.branchIds) where.branch_id = { in: opts.branchIds };
    if (opts.date) where.business_date = businessDateToDbDate(parseDate(opts.date, ''));
    const rows = await prisma.cashierRemittance.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
    });
    const names = await this.names([...new Set(rows.flatMap((r) => [r.cashier_user_id, r.received_by_user_id]))]);
    return rows.map((r) => serializeRemittance(r, names));
  }

  static async names(ids: string[]) {
    if (!ids.length) return new Map<string, string | null>();
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true } });
    return new Map(users.map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || null]));
  }

  // ── Remittances ────────────────────────────────────────────

  /** Can this actor record money for / view the ledger of this person? Same store, Attendant or has a ledger. */
  static async resolveCashier(actor: LedgerActor, cashierId: unknown) {
    if (typeof cashierId !== 'string' || !cashierId) throw new AppError(400, 'cashier_user_id is required');
    const u = await prisma.user.findUnique({
      where: { id: cashierId },
      select: { id: true, store_id: true, branch_id: true, operational_profile: true, first_name: true, last_name: true },
    });
    if (!u || (!actor.is_super_admin && u.store_id !== actor.storeId)) throw new AppError(404, 'Attendant not found');
    if (u.operational_profile !== 'bar_attendant') {
      const hasLedger = await prisma.cashierLedgerEntry.count({ where: { store_id: u.store_id, cashier_user_id: u.id } });
      if (!hasLedger) throw new AppError(400, 'This person is not an Attendant');
    }
    return u;
  }

  static async recordRemittance(
    actor: LedgerActor,
    body: {
      cashier_user_id?: unknown;
      amount?: unknown;
      method?: unknown;
      reference?: unknown;
      narration?: unknown;
      business_date?: unknown;
      client_ref?: unknown;
      confirm_overpayment?: unknown;
      confirm_duplicate?: unknown;
    }
  ) {
    const storeId = actor.storeId;
    if (!storeId) throw new AppError(403, 'No store on this account');

    const clientRef = typeof body.client_ref === 'string' ? body.client_ref.trim() : '';
    if (clientRef.length < 8 || clientRef.length > 100) throw new AppError(400, 'client_ref (8–100 characters) is required');
    const replay = await prisma.cashierRemittance.findUnique({ where: { client_ref: clientRef } });
    if (replay) {
      if (replay.store_id !== storeId || replay.received_by_user_id !== actor.userId) throw new AppError(409, 'client_ref already used');
      const names = await this.names([replay.cashier_user_id, replay.received_by_user_id]);
      return { remittance: serializeRemittance(replay, names), replayed: true, outstanding_after: await this.outstanding(storeId, replay.cashier_user_id) };
    }

    const cashier = await this.resolveCashier(actor, body.cashier_user_id);
    if (cashier.id === actor.userId && !isAdmin(actor)) {
      throw new AppError(403, 'You cannot record money you are handing over yourself');
    }

    const amount = round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new AppError(400, 'Enter an amount above ₦0');

    if (!REMIT_METHODS.includes(body.method as RemitMethod)) {
      throw new AppError(400, "method must be 'cash', 'transfer', 'card' or 'other'");
    }
    const method = body.method as RemitMethod;
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 100) || null : null;
    if ((method === 'transfer' || method === 'card') && !reference) {
      throw new AppError(400, 'A reference is required for transfer and POS payments');
    }
    const narration = typeof body.narration === 'string' ? body.narration.trim().slice(0, 300) || null : null;

    // Business date: today, or back-dated within the rules (never into the future).
    const day = await storeBusinessDay(storeId);
    const date = parseDate(body.business_date, day.today);
    if (date > day.today) throw new AppError(400, 'A remittance cannot be dated in the future');
    if (date < day.today && !isSupervisor(actor)) {
      if (!day.allowBackdate) throw new AppError(403, 'Only a manager can record a remittance for a past day');
      if (date < addDays(day.today, -CONTROLLER_BACKDATE_DAYS)) {
        throw new AppError(403, `Bar Controllers can back-date at most ${CONTROLLER_BACKDATE_DAYS} days`);
      }
    }

    // Soft duplicate check on a bank / POS reference.
    if (reference && body.confirm_duplicate !== true) {
      const dup = await prisma.cashierRemittance.findFirst({
        where: { store_id: storeId, method, reference, status: 'recorded' },
        select: { id: true, amount: true, business_date: true },
      });
      if (dup) {
        throw new AppError(409, `This ${method} reference was already recorded`, true, {
          code: 'DUPLICATE_REFERENCE',
          existing_id: dup.id,
          existing_amount: n(dup.amount),
          existing_date: dup.business_date.toISOString().slice(0, 10),
        });
      }
    }

    // Overpayment (D21): allowed only with explicit confirmation → credit balance.
    const before = await this.outstanding(storeId, cashier.id);
    if (amount > before + 0.009 && body.confirm_overpayment !== true) {
      throw new AppError(409, `This is more than the ₦${before.toLocaleString()} owed`, true, {
        code: 'OVERPAYMENT',
        outstanding: before,
        excess: round2(amount - before),
      });
    }

    const branchId = cashier.branch_id ?? (await prisma.user.findUnique({ where: { id: actor.userId }, select: { branch_id: true } }))?.branch_id;
    if (!branchId) throw new AppError(400, 'This Attendant has no branch');
    const dateDb = businessDateToDbDate(date);
    // Phase 4: never into a day the receiving controller has closed (reopen first).
    await assertDayOpen(actor.userId, dateDb, { self: true, what: 'record money for that day' });

    const created = await prisma.$transaction(async (tx) => {
      const rem = await tx.cashierRemittance.create({
        data: {
          store_id: storeId,
          branch_id: branchId,
          cashier_user_id: cashier.id,
          received_by_user_id: actor.userId,
          amount,
          method,
          reference,
          narration,
          business_date: dateDb,
          client_ref: clientRef,
        },
      });
      await appendLedgerEntry(tx, {
        store_id: storeId,
        branch_id: branchId,
        cashier_user_id: cashier.id,
        entry_type: 'REMITTANCE',
        amount: -amount,
        business_date: dateDb,
        source_type: 'remittance',
        source_id: rem.id,
        recorded_by_user_id: actor.userId,
      });
      await audit(tx, actor, storeId, branchId, 'REMITTANCE_RECORDED', 'cashier_remittance', rem.id, {
        cashier_user_id: cashier.id,
        amount,
        method,
        reference,
        business_date: date,
        backdated: date < day.today,
        outstanding_before: before,
        overpayment: amount > before + 0.009 ? round2(amount - before) : 0,
        duplicate_reference_confirmed: body.confirm_duplicate === true,
      });
      return rem;
    });

    const names = await this.names([created.cashier_user_id, created.received_by_user_id]);
    return {
      remittance: serializeRemittance(created, names),
      replayed: false,
      outstanding_after: await this.outstanding(storeId, cashier.id),
    };
  }

  /**
   * Correct a mis-keyed remittance: never edited, always reversed (+ a fresh correct one).
   * Bar Controller: only their own entries, same business day. Managers/admins: any.
   */
  static async reverseRemittance(actor: LedgerActor, id: string, reasonRaw: unknown) {
    const reason = validateReason(reasonRaw, 'reverse a remittance');
    const rem = await prisma.cashierRemittance.findUnique({ where: { id } });
    if (!rem || (!actor.is_super_admin && rem.store_id !== actor.storeId)) throw new AppError(404, 'Remittance not found');
    if (rem.status !== 'recorded') throw new AppError(409, 'This remittance is already reversed');

    const day = await storeBusinessDay(rem.store_id);
    const remDate = rem.business_date.toISOString().slice(0, 10);
    if (!isSupervisor(actor)) {
      if (rem.received_by_user_id !== actor.userId) throw new AppError(403, 'You can only reverse remittances you recorded');
      if (remDate !== day.today) throw new AppError(403, "Only a manager can reverse a remittance from a past day");
    }
    // Phase 4: a hand-over inside a closed day can't be reversed until that day is reopened.
    await assertDayOpen(rem.received_by_user_id, rem.business_date, {
      self: rem.received_by_user_id === actor.userId,
      what: 'reverse this hand-over',
    });

    await prisma.$transaction(async (tx) => {
      const r = await tx.cashierRemittance.updateMany({
        where: { id, status: 'recorded' },
        data: { status: 'reversed', reversed_by_user_id: actor.userId, reversed_at: new Date(), reversal_reason: reason },
      });
      if (r.count !== 1) throw new AppError(409, 'This remittance was just changed by someone else');
      const original = await tx.cashierLedgerEntry.findUnique({
        where: { entry_type_source_type_source_id: { entry_type: 'REMITTANCE', source_type: 'remittance', source_id: id } },
      });
      if (!original) throw new AppError(500, 'Ledger entry for this remittance is missing');
      await appendLedgerEntry(tx, {
        store_id: rem.store_id,
        branch_id: rem.branch_id,
        cashier_user_id: rem.cashier_user_id,
        entry_type: 'REMITTANCE_REVERSAL',
        amount: -n(original.amount), // original is negative → reversal is positive
        business_date: businessDateToDbDate(day.today),
        source_type: 'remittance',
        source_id: id,
        reverses_entry_id: original.id,
        reason,
        recorded_by_user_id: actor.userId,
      });
      await audit(tx, actor, rem.store_id, rem.branch_id, 'REMITTANCE_REVERSED', 'cashier_remittance', id, {
        reason,
        amount: n(rem.amount),
        original_business_date: remDate,
      });
    });

    const fresh = await prisma.cashierRemittance.findUniqueOrThrow({ where: { id } });
    const names = await this.names([fresh.cashier_user_id, fresh.received_by_user_id]);
    return serializeRemittance(fresh, names);
  }

  // ── Manager / admin corrections ────────────────────────────

  /** Forgive part or all of what an Attendant owes (shortage, bad customer, departed staff). */
  static async writeOff(actor: LedgerActor, cashierId: string, amountRaw: unknown, reasonRaw: unknown) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager or admin can write off a balance');
    const reason = validateReason(reasonRaw, 'write off a balance');
    const cashier = await this.resolveCashier(actor, cashierId);
    if (cashier.id === actor.userId && !isAdmin(actor)) throw new AppError(403, 'You cannot write off your own balance');
    const amount = round2(Number(amountRaw));
    if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'Enter an amount above ₦0');
    const owed = await this.outstanding(cashier.store_id, cashier.id);
    if (amount > owed + 0.009) throw new AppError(400, `You can write off at most the ₦${owed.toLocaleString()} owed`);
    return this.correction(actor, cashier, 'WRITE_OFF', 'write_off', -amount, reason, 'BALANCE_WRITTEN_OFF');
  }

  /** Admin-only signed correction (D13), reason required. */
  static async adjust(actor: LedgerActor, cashierId: string, amountRaw: unknown, reasonRaw: unknown) {
    if (!isAdmin(actor)) throw new AppError(403, 'Only an admin can adjust a balance');
    const reason = validateReason(reasonRaw, 'adjust a balance');
    const cashier = await this.resolveCashier(actor, cashierId);
    const amount = round2(Number(amountRaw));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) throw new AppError(400, 'Enter a non-zero amount');
    return this.correction(actor, cashier, 'ADJUSTMENT', 'adjustment', amount, reason, 'BALANCE_ADJUSTED');
  }

  private static async correction(
    actor: LedgerActor,
    cashier: { id: string; store_id: string; branch_id: string | null },
    type: LedgerEntryType,
    sourceType: string,
    signedAmount: number,
    reason: string,
    action: string
  ) {
    const branchId = cashier.branch_id ?? (await prisma.user.findUnique({ where: { id: actor.userId }, select: { branch_id: true } }))?.branch_id;
    if (!branchId) throw new AppError(400, 'This Attendant has no branch');
    const day = await storeBusinessDay(cashier.store_id);
    const sourceId = uuidv4();
    const entry = await prisma.$transaction(async (tx) => {
      const e = await appendLedgerEntry(tx, {
        store_id: cashier.store_id,
        branch_id: branchId,
        cashier_user_id: cashier.id,
        entry_type: type,
        amount: signedAmount,
        business_date: businessDateToDbDate(day.today),
        source_type: sourceType,
        source_id: sourceId,
        reason,
        recorded_by_user_id: actor.userId,
      });
      await audit(tx, actor, cashier.store_id, branchId, action, 'cashier_ledger', e.id, {
        cashier_user_id: cashier.id,
        amount: signedAmount,
        reason,
      });
      return e;
    });
    return { entry_id: entry.id, amount: signedAmount, outstanding_after: await this.outstanding(cashier.store_id, cashier.id) };
  }
}

export function serializeRemittance(
  r: Prisma.CashierRemittanceGetPayload<{}>,
  names: Map<string, string | null>
) {
  return {
    id: r.id,
    cashier: { id: r.cashier_user_id, name: names.get(r.cashier_user_id) ?? null },
    received_by: { id: r.received_by_user_id, name: names.get(r.received_by_user_id) ?? null },
    amount: n(r.amount),
    method: r.method,
    reference: r.reference,
    narration: r.narration,
    business_date: r.business_date.toISOString().slice(0, 10),
    status: r.status,
    reversed_at: r.reversed_at,
    reversal_reason: r.reversal_reason,
    created_at: r.created_at,
  };
}
