import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { businessDateToDbDate } from '../utils/businessDate';
import { appendLedgerEntry, storeBusinessDay } from './BarLedgerService';

/**
 * Bar Controller day close + manager handover (Bar/Lounge Phase 4).
 *
 * One close per Bar Controller per business day (D11). It covers what THAT
 * controller handled on that day:
 *   - money handed to them (remittances they received, by method) → expected cash,
 *     transfer, POS, other
 *   - orders they released, damages they recorded
 * The controller counts the cash; the variance (counted − expected cash) needs a
 * reason when it isn't zero. Transfers / POS are already in the bank, so the
 * physical handover is the cash line.
 *
 * Lifecycle: submitted → acknowledged (manager counts what they received)
 *            submitted | acknowledged → reopened (manager, reason) → submitted again.
 * Submitting freezes a snapshot and locks that day for the controller (see
 * barDayGuard). Nothing is reset: Attendant balances simply carry forward.
 *
 * D23 (shortages): on acknowledgement the manager chooses to absorb a cash
 * shortage (house loss) or charge it to the controller — an ADJUSTMENT entry on
 * the controller's own ledger, undone automatically if the close is reopened.
 */

interface Actor {
  userId: string;
  role?: string;
  storeId?: string | null;
  is_super_admin?: boolean;
}

const METHODS = ['cash', 'transfer', 'card', 'other'] as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const isSupervisor = (a: Actor) => a.role === 'admin' || a.role === 'manager' || !!a.is_super_admin;
const isAdmin = (a: Actor) => a.role === 'admin' || !!a.is_super_admin;
const fullName = (u?: { first_name: string | null; last_name: string | null } | null) =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null;

function parseDate(raw: unknown, today: string) {
  if (raw === undefined || raw === null || raw === '') return today;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new AppError(400, 'business_date must be YYYY-MM-DD');
  if (raw > today) throw new AppError(400, 'You cannot close a day that has not started');
  return raw;
}

export class BarDayCloseService {
  /** Live figures for a controller's day (what a close would freeze). */
  static async compute(storeId: string, controllerId: string, date: string) {
    const dateDb = businessDateToDbDate(date);
    const [controller, remits, released, damages, myAccepted, unclaimed] = await Promise.all([
      prisma.user.findUnique({ where: { id: controllerId }, select: { id: true, first_name: true, last_name: true, branch_id: true } }),
      prisma.cashierRemittance.findMany({
        where: { store_id: storeId, received_by_user_id: controllerId, business_date: dateDb, status: 'recorded' },
        select: { cashier_user_id: true, amount: true, method: true },
      }),
      prisma.barOrder.findMany({
        where: {
          store_id: storeId,
          fulfilled_by_user_id: controllerId,
          business_date: dateDb,
          status: { in: ['fulfilled', 'reversal_requested', 'reversed'] },
        },
        select: { status: true, fulfilled_total: true, total_amount: true, closed_reason: true },
      }),
      prisma.damageRecord.findMany({
        where: { store_id: storeId, recorded_by_user_id: controllerId, business_date: dateDb, status: 'recorded' },
        select: { quantity: true, unit_cost: true, unit_price: true },
      }),
      prisma.barOrder.count({ where: { store_id: storeId, accepted_by_user_id: controllerId, status: 'accepted' } }),
      controllerId
        ? prisma.user
            .findUnique({ where: { id: controllerId }, select: { branch_id: true } })
            .then((u) =>
              u?.branch_id
                ? prisma.barOrder.count({ where: { store_id: storeId, branch_id: u.branch_id, status: 'submitted' } })
                : 0
            )
        : Promise.resolve(0),
    ]);

    const byMethod: Record<string, number> = { cash: 0, transfer: 0, card: 0, other: 0 };
    const byAttendant = new Map<string, { cashier_id: string; amount: number; count: number }>();
    for (const r of remits) {
      byMethod[r.method] = round2((byMethod[r.method] ?? 0) + num(r.amount));
      const a = byAttendant.get(r.cashier_user_id) ?? { cashier_id: r.cashier_user_id, amount: 0, count: 0 };
      a.amount = round2(a.amount + num(r.amount));
      a.count++;
      byAttendant.set(r.cashier_user_id, a);
    }
    const names = byAttendant.size
      ? await prisma.user.findMany({ where: { id: { in: [...byAttendant.keys()] } }, select: { id: true, first_name: true, last_name: true } })
      : [];
    const nameOf = new Map(names.map((u) => [u.id, fullName(u)]));

    const live = released.filter((o) => o.status !== 'reversed');
    return {
      business_date: date,
      controller: { id: controllerId, name: fullName(controller) },
      branch_id: controller?.branch_id ?? null,
      remittances: {
        count: remits.length,
        by_method: byMethod,
        total: round2(Object.values(byMethod).reduce((a, b) => a + b, 0)),
        by_attendant: [...byAttendant.values()].map((a) => ({ ...a, name: nameOf.get(a.cashier_id) ?? null })),
      },
      orders_released: {
        count: live.length,
        total: round2(live.reduce((a, o) => a + num(o.fulfilled_total ?? o.total_amount), 0)),
        reversed_count: released.length - live.length,
        reduced_count: live.filter((o) => !!o.closed_reason).length,
      },
      damages: {
        count: damages.length,
        quantity: damages.reduce((a, d) => a + num(d.quantity), 0),
        cost_value: round2(damages.reduce((a, d) => a + num(d.unit_cost) * num(d.quantity), 0)),
        retail_value: round2(damages.reduce((a, d) => a + num(d.unit_price) * num(d.quantity), 0)),
      },
      open_orders: { mine_in_progress: myAccepted, unclaimed_in_queue: unclaimed },
      // Cash is physically handed over; transfers / POS are already in the bank.
      handover_cash_expected: byMethod.cash,
    };
  }

  static async preview(actor: Actor, dateRaw?: unknown) {
    const storeId = actor.storeId!;
    const day = await storeBusinessDay(storeId);
    const date = parseDate(dateRaw, day.today);
    const [figures, existing] = await Promise.all([
      this.compute(storeId, actor.userId, date),
      prisma.barDayClose.findFirst({ where: { store_id: storeId, closed_by_user_id: actor.userId, business_date: businessDateToDbDate(date) } }),
    ]);
    return { today: day.today, figures, close: existing ? await this.serialize(existing) : null };
  }

  static async submit(
    actor: Actor,
    body: { business_date?: unknown; counted_cash?: unknown; variance_reason?: unknown; notes?: unknown }
  ) {
    const storeId = actor.storeId;
    if (!storeId) throw new AppError(403, 'No store on this account');
    const day = await storeBusinessDay(storeId);
    const date = parseDate(body.business_date, day.today);
    const dateDb = businessDateToDbDate(date);

    const counted = round2(Number(body.counted_cash));
    if (!Number.isFinite(counted) || counted < 0) throw new AppError(400, 'Enter the cash you counted (₦0 or more)');

    const figures = await this.compute(storeId, actor.userId, date);
    if (!figures.branch_id) throw new AppError(400, 'Your account has no branch');
    if (figures.open_orders.mine_in_progress > 0) {
      throw new AppError(409, `Finish or hand back the ${figures.open_orders.mine_in_progress} order(s) you are preparing first`, true, {
        code: 'OPEN_ORDERS',
        count: figures.open_orders.mine_in_progress,
      });
    }

    const expectedCash = figures.remittances.by_method.cash;
    const variance = round2(counted - expectedCash);
    const varianceReason = typeof body.variance_reason === 'string' ? body.variance_reason.trim().slice(0, 500) : '';
    if (Math.abs(variance) > 0.009 && varianceReason.length < 3) {
      throw new AppError(400, `Your count is ₦${Math.abs(variance).toLocaleString()} ${variance < 0 ? 'short' : 'over'} — say why`, true, {
        code: 'VARIANCE_REASON_REQUIRED',
        variance,
        expected_cash: expectedCash,
      });
    }
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) || null : null;

    const existing = await prisma.barDayClose.findUnique({
      where: { branch_id_business_date_closed_by_user_id: { branch_id: figures.branch_id, business_date: dateDb, closed_by_user_id: actor.userId } },
    });
    if (existing && existing.status !== 'reopened') {
      throw new AppError(409, `You already closed ${date}`, true, { code: 'ALREADY_CLOSED', day_close_id: existing.id });
    }

    const data = {
      status: 'submitted',
      snapshot: figures as any,
      expected_cash: expectedCash,
      expected_transfer: figures.remittances.by_method.transfer,
      expected_card: figures.remittances.by_method.card,
      expected_other: figures.remittances.by_method.other,
      counted_cash: counted,
      variance,
      variance_reason: Math.abs(variance) > 0.009 ? varianceReason : null,
      notes,
      submitted_at: new Date(),
    };

    const close = await prisma.$transaction(async (tx) => {
      const c = existing
        ? await tx.barDayClose.update({ where: { id: existing.id }, data })
        : await tx.barDayClose.create({
            data: { ...data, store_id: storeId, branch_id: figures.branch_id!, business_date: dateDb, closed_by_user_id: actor.userId },
          });
      // Link what this close covers (reporting).
      await tx.cashierRemittance.updateMany({
        where: { store_id: storeId, received_by_user_id: actor.userId, business_date: dateDb },
        data: { day_close_id: c.id },
      });
      await tx.barOrder.updateMany({
        where: { store_id: storeId, fulfilled_by_user_id: actor.userId, business_date: dateDb },
        data: { day_close_id: c.id },
      });
      await tx.damageRecord.updateMany({
        where: { store_id: storeId, recorded_by_user_id: actor.userId, business_date: dateDb },
        data: { day_close_id: c.id },
      });
      await tx.auditLog.create({
        data: {
          store_id: storeId,
          branch_id: c.branch_id,
          user_id: actor.userId,
          action: existing ? 'DAY_CLOSE_RESUBMITTED' : 'DAY_CLOSE_SUBMITTED',
          resource_type: 'bar_day_close',
          resource_id: c.id,
          changes: { business_date: date, expected_cash: expectedCash, counted_cash: counted, variance, variance_reason: data.variance_reason } as any,
        },
      });
      return c;
    });
    return this.serialize(close);
  }

  static async acknowledge(
    actor: Actor,
    id: string,
    branchIds: string[],
    body: { acknowledged_amount?: unknown; note?: unknown; variance_treatment?: unknown }
  ) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager can acknowledge a handover');
    const close = await this.find(actor, id, branchIds);
    if (close.status !== 'submitted') throw new AppError(409, `This close is ${close.status}`);
    if (close.closed_by_user_id === actor.userId && !isAdmin(actor)) {
      throw new AppError(403, 'You cannot acknowledge your own handover');
    }

    const amount = round2(Number(body.acknowledged_amount));
    if (!Number.isFinite(amount) || amount < 0) throw new AppError(400, 'Enter the cash you received (₦0 or more)');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    if (Math.abs(amount - num(close.counted_cash)) > 0.009 && !note) {
      throw new AppError(400, 'What you received differs from what the Bar Controller counted — add a note');
    }

    const variance = num(close.variance);
    let treatment: 'absorb' | 'charge_controller' | null = null;
    if (variance < -0.009) {
      if (body.variance_treatment !== 'absorb' && body.variance_treatment !== 'charge_controller') {
        throw new AppError(400, 'Choose how to settle the shortage: absorb it, or charge the Bar Controller', true, {
          code: 'VARIANCE_TREATMENT_REQUIRED',
          variance,
        });
      }
      treatment = body.variance_treatment;
    } else if (Math.abs(variance) > 0.009) {
      treatment = 'absorb'; // an overage is recorded, never charged
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const r = await tx.barDayClose.updateMany({
        where: { id, status: 'submitted' },
        data: {
          status: 'acknowledged',
          acknowledged_by_user_id: actor.userId,
          acknowledged_amount: amount,
          acknowledged_at: now,
          ack_note: note,
          variance_treatment: treatment,
        },
      });
      if (r.count !== 1) throw new AppError(409, 'This close was just changed by someone else');
      if (treatment === 'charge_controller') {
        await appendLedgerEntry(tx, {
          store_id: close.store_id,
          branch_id: close.branch_id,
          cashier_user_id: close.closed_by_user_id,
          entry_type: 'ADJUSTMENT',
          amount: Math.abs(variance),
          business_date: close.business_date,
          source_type: 'day_close',
          source_id: `${close.id}@${now.toISOString()}`,
          reason: `Cash shortage on day close ${close.business_date.toISOString().slice(0, 10)}`,
          recorded_by_user_id: actor.userId,
        });
      }
      await tx.auditLog.create({
        data: {
          store_id: close.store_id,
          branch_id: close.branch_id,
          user_id: actor.userId,
          action: 'DAY_CLOSE_ACKNOWLEDGED',
          resource_type: 'bar_day_close',
          resource_id: close.id,
          changes: { acknowledged_amount: amount, counted_cash: num(close.counted_cash), variance, treatment, note } as any,
        },
      });
    });
    return this.serialize(await prisma.barDayClose.findUniqueOrThrow({ where: { id } }));
  }

  static async reopen(actor: Actor, id: string, branchIds: string[], reasonRaw: unknown) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager can reopen a day');
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 500) : '';
    if (reason.length < 3) throw new AppError(400, 'A reason is required to reopen a day');
    const close = await this.find(actor, id, branchIds);
    if (close.status === 'reopened') throw new AppError(409, 'This day is already reopened');

    await prisma.$transaction(async (tx) => {
      const r = await tx.barDayClose.updateMany({
        where: { id, status: { in: ['submitted', 'acknowledged'] } },
        data: {
          status: 'reopened',
          reopened_by_user_id: actor.userId,
          reopened_at: new Date(),
          reopen_reason: reason,
          acknowledged_by_user_id: null,
          acknowledged_amount: null,
          acknowledged_at: null,
          ack_note: null,
          variance_treatment: null,
        },
      });
      if (r.count !== 1) throw new AppError(409, 'This close was just changed by someone else');
      // Undo a shortage charged to the controller on the previous acknowledgement.
      if (close.status === 'acknowledged' && close.variance_treatment === 'charge_controller' && close.acknowledged_at) {
        const charge = await tx.cashierLedgerEntry.findUnique({
          where: {
            entry_type_source_type_source_id: {
              entry_type: 'ADJUSTMENT',
              source_type: 'day_close',
              source_id: `${close.id}@${close.acknowledged_at.toISOString()}`,
            },
          },
        });
        if (charge) {
          const day = await storeBusinessDay(close.store_id);
          await appendLedgerEntry(tx, {
            store_id: close.store_id,
            branch_id: close.branch_id,
            cashier_user_id: close.closed_by_user_id,
            entry_type: 'ADJUSTMENT',
            amount: -num(charge.amount),
            business_date: businessDateToDbDate(day.today),
            source_type: 'day_close_reopen',
            source_id: charge.id,
            reverses_entry_id: charge.id,
            reason: `Day reopened: ${reason}`,
            recorded_by_user_id: actor.userId,
          });
        }
      }
      await tx.auditLog.create({
        data: {
          store_id: close.store_id,
          branch_id: close.branch_id,
          user_id: actor.userId,
          action: 'DAY_CLOSE_REOPENED',
          resource_type: 'bar_day_close',
          resource_id: close.id,
          changes: { reason, previous_status: close.status } as any,
        },
      });
    });
    return this.serialize(await prisma.barDayClose.findUniqueOrThrow({ where: { id } }));
  }

  /** Manager inbox (branch scope) or a controller's own closes. */
  static async list(actor: Actor, branchIds: string[], opts: { status?: string[]; date?: unknown; mine?: boolean }) {
    const where: Prisma.BarDayCloseWhereInput = { store_id: actor.storeId ?? '__none__' };
    if (opts.mine || !isSupervisor(actor)) where.closed_by_user_id = actor.userId;
    else where.branch_id = { in: branchIds };
    if (opts.status?.length) where.status = { in: opts.status };
    if (typeof opts.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) where.business_date = businessDateToDbDate(opts.date);
    const rows = await prisma.barDayClose.findMany({ where, orderBy: [{ business_date: 'desc' }, { submitted_at: 'desc' }], take: 100 });
    return Promise.all(rows.map((r) => this.serialize(r)));
  }

  static async get(actor: Actor, id: string, branchIds: string[]) {
    return this.serialize(await this.find(actor, id, branchIds));
  }

  private static async find(actor: Actor, id: string, branchIds: string[]) {
    const c = await prisma.barDayClose.findUnique({ where: { id } });
    const visible =
      c &&
      (actor.is_super_admin || c.store_id === actor.storeId) &&
      (c.closed_by_user_id === actor.userId || (isSupervisor(actor) && branchIds.includes(c.branch_id)));
    if (!visible) throw new AppError(404, 'Day close not found');
    return c!;
  }

  private static async serialize(c: Prisma.BarDayCloseGetPayload<{}>) {
    const ids = [c.closed_by_user_id, c.acknowledged_by_user_id, c.reopened_by_user_id].filter(Boolean) as string[];
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true } });
    const nm = new Map(users.map((u) => [u.id, fullName(u)]));
    const person = (id: string | null) => (id ? { id, name: nm.get(id) ?? null } : null);
    return {
      id: c.id,
      business_date: c.business_date.toISOString().slice(0, 10),
      branch_id: c.branch_id,
      status: c.status,
      closed_by: person(c.closed_by_user_id),
      expected: { cash: num(c.expected_cash), transfer: num(c.expected_transfer), card: num(c.expected_card), other: num(c.expected_other) },
      counted_cash: num(c.counted_cash),
      variance: num(c.variance),
      variance_reason: c.variance_reason,
      notes: c.notes,
      submitted_at: c.submitted_at,
      acknowledged_by: person(c.acknowledged_by_user_id),
      acknowledged_amount: c.acknowledged_amount === null ? null : num(c.acknowledged_amount),
      acknowledged_at: c.acknowledged_at,
      ack_note: c.ack_note,
      variance_treatment: c.variance_treatment,
      reopened_by: person(c.reopened_by_user_id),
      reopened_at: c.reopened_at,
      reopen_reason: c.reopen_reason,
      snapshot: c.snapshot,
    };
  }
}

export { METHODS as DAY_CLOSE_METHODS };
