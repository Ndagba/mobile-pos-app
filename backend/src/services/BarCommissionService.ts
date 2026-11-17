import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { businessDateToDbDate } from '../utils/businessDate';
import { storeBusinessDay } from './BarLedgerService';

/**
 * Attendant commission (Bar/Lounge Phase 5).
 *
 * Basis (D27): rate × the Attendant's total sales in the period, taken from the
 * ledger — SALE entries plus SALE_REVERSAL entries by business date. A reversal
 * approved after a period was posted lands in a LATER period and reduces that
 * period's figure, so posted runs are never edited. A period whose reversals
 * outweigh its sales earns ₦0 (never a negative expense).
 *
 * Calculated ≠ posted ≠ paid:
 *   draft   — a preview, freely discarded
 *   posted  — figures recomputed from the ledger and frozen; ONE Expense per line
 *             (category "Cashier Commission", accrual D29). Duplicates are
 *             impossible: Expense(source_type, source_id) @unique,
 *             line.expense_id @unique, and no posted period may overlap another
 *             posted period for the same Attendant (checked under an advisory lock).
 *   paid    — recorded per line; the expense's payment method follows.
 * A posted run with nothing paid yet can be cancelled: its expenses are voided.
 *
 * Bar Controllers (D15), managers and admins never earn commission.
 */

interface Actor {
  userId: string;
  role?: string;
  storeId?: string | null;
  is_super_admin?: boolean;
}

export const COMMISSION_CATEGORY = 'Cashier Commission';
const MAX_SPAN_DAYS = 92;
const PAY_METHODS = ['cash', 'transfer', 'card', 'other'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const isSupervisor = (a: Actor) => a.role === 'admin' || a.role === 'manager' || !!a.is_super_admin;
const fullName = (u?: { first_name: string | null; last_name: string | null } | null) =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null;
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

function parseDate(raw: unknown, name: string): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new AppError(400, `${name} must be YYYY-MM-DD`);
  }
  return raw;
}

/** Commission figures per (Attendant, branch) from the ledger for a period. */
async function computeLines(
  client: Prisma.TransactionClient | typeof prisma,
  storeId: string,
  branchIds: string[],
  start: Date,
  end: Date,
  rate: number,
  onlyCashiers?: string[]
) {
  const rows = await client.cashierLedgerEntry.groupBy({
    by: ['cashier_user_id', 'branch_id', 'entry_type'],
    where: {
      store_id: storeId,
      branch_id: { in: branchIds },
      entry_type: { in: ['SALE', 'SALE_REVERSAL'] },
      business_date: { gte: start, lte: end },
      ...(onlyCashiers ? { cashier_user_id: { in: onlyCashiers } } : {}),
    },
    _sum: { amount: true },
  });
  const byKey = new Map<string, { cashier_user_id: string; branch_id: string; gross: number; reversals: number }>();
  for (const r of rows) {
    const key = `${r.cashier_user_id}|${r.branch_id}`;
    const v = byKey.get(key) ?? { cashier_user_id: r.cashier_user_id, branch_id: r.branch_id, gross: 0, reversals: 0 };
    if (r.entry_type === 'SALE') v.gross = round2(v.gross + num(r._sum.amount));
    else v.reversals = round2(v.reversals + num(r._sum.amount));
    byKey.set(key, v);
  }
  // Attendants only: cashiers who are not Bar Controllers (incl. former Attendants).
  const ids = [...new Set([...byKey.values()].map((v) => v.cashier_user_id))];
  const users = ids.length
    ? await client.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, operational_profile: true } })
    : [];
  const eligibleIds = new Set(users.filter((u) => u.role === 'cashier' && u.operational_profile !== 'bar_controller').map((u) => u.id));
  return [...byKey.values()]
    .filter((v) => eligibleIds.has(v.cashier_user_id))
    .map((v) => {
      const eligible = round2(v.gross + v.reversals);
      return { ...v, eligible, commission: round2((Math.max(0, eligible) * rate) / 100) };
    });
}

/** Posted lines for these Attendants whose period overlaps [start, end]. */
async function overlappingPosted(client: Prisma.TransactionClient | typeof prisma, storeId: string, cashierIds: string[], start: Date, end: Date) {
  if (!cashierIds.length) return [];
  return client.commissionRunLine.findMany({
    where: {
      store_id: storeId,
      cashier_user_id: { in: cashierIds },
      status: 'posted',
      period_start: { lte: end },
      period_end: { gte: start },
    },
    select: { cashier_user_id: true, period_start: true, period_end: true, commission_run_id: true },
  });
}

export class BarCommissionService {
  static async createDraft(actor: Actor, scopeBranchIds: string[], body: { period_start?: unknown; period_end?: unknown; branch_id?: unknown }) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager can calculate commission');
    const storeId = actor.storeId!;
    const settings = await prisma.storeSetting.findUnique({
      where: { store_id: storeId },
      select: { commission_enabled: true, commission_rate: true, commission_basis: true },
    });
    const rate = num(settings?.commission_rate);
    if (!settings?.commission_enabled || rate <= 0) {
      throw new AppError(400, 'Turn commission on and set a rate in Bar / Lounge setup first', true, { code: 'COMMISSION_DISABLED' });
    }

    const day = await storeBusinessDay(storeId);
    const startS = parseDate(body.period_start, 'period_start');
    const endS = parseDate(body.period_end, 'period_end');
    if (startS > endS) throw new AppError(400, 'The period must start before it ends');
    if (endS > day.today) throw new AppError(400, 'The period cannot end in the future');
    const span = (Date.parse(endS) - Date.parse(startS)) / 86400000 + 1;
    if (span > MAX_SPAN_DAYS) throw new AppError(400, `A run can cover at most ${MAX_SPAN_DAYS} days`);

    let branchIds = scopeBranchIds;
    if (body.branch_id !== undefined && body.branch_id !== null && body.branch_id !== '') {
      if (!scopeBranchIds.includes(String(body.branch_id))) throw new AppError(403, 'You do not manage that branch');
      branchIds = [String(body.branch_id)];
    }
    const start = businessDateToDbDate(startS);
    const end = businessDateToDbDate(endS);

    const computed = await computeLines(prisma, storeId, branchIds, start, end, rate);
    const overlaps = await overlappingPosted(prisma, storeId, computed.map((c) => c.cashier_user_id), start, end);
    const blocked = new Set(overlaps.map((o) => o.cashier_user_id));
    const lines = computed.filter((c) => !blocked.has(c.cashier_user_id));
    if (!lines.length) {
      throw new AppError(
        409,
        overlaps.length ? 'Every Attendant in this period is already covered by a posted run' : 'No Attendant sales in this period',
        true,
        { code: overlaps.length ? 'ALREADY_POSTED' : 'NOTHING_TO_PAY' }
      );
    }

    const run = await prisma.$transaction(async (tx) => {
      const r = await tx.commissionRun.create({
        data: {
          store_id: storeId,
          branch_id: branchIds.length === 1 ? branchIds[0] : null,
          period_start: start,
          period_end: end,
          rate,
          basis: settings.commission_basis ?? 'total_sales',
          created_by_user_id: actor.userId,
          lines: {
            create: lines.map((l) => ({
              store_id: storeId,
              branch_id: l.branch_id,
              cashier_user_id: l.cashier_user_id,
              period_start: start,
              period_end: end,
              gross_sales: l.gross,
              reversals: l.reversals,
              eligible_sales: l.eligible,
              commission_amount: l.commission,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          store_id: storeId,
          user_id: actor.userId,
          action: 'COMMISSION_RUN_DRAFTED',
          resource_type: 'commission_run',
          resource_id: r.id,
          changes: { period_start: startS, period_end: endS, rate, lines: lines.length, skipped_already_posted: [...blocked] } as any,
        },
      });
      return r;
    });
    return { run: await this.get(actor, run.id), skipped_already_posted: [...blocked] };
  }

  static async post(actor: Actor, runId: string) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager can post commission');
    const run = await this.find(actor, runId);
    if (run.status !== 'draft') throw new AppError(409, `This run is ${run.status}`);
    const rate = num(run.rate);
    const cashierIds = run.lines.map((l) => l.cashier_user_id);
    const branchIds = [...new Set(run.lines.map((l) => l.branch_id))];

    await prisma.$transaction(async (tx) => {
      // Serialise commission posting per store so two runs can't race past the overlap check.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`commission:${run.store_id}`}))::text`;
      const claimed = await tx.commissionRun.updateMany({ where: { id: runId, status: 'draft' }, data: { status: 'posted', posted_by_user_id: actor.userId, posted_at: new Date() } });
      if (claimed.count !== 1) throw new AppError(409, 'This run was just changed by someone else');

      const overlaps = await overlappingPosted(tx, run.store_id, cashierIds, run.period_start, run.period_end);
      if (overlaps.length) {
        throw new AppError(409, 'Some Attendants are already covered by a posted run for part of this period', true, {
          code: 'ALREADY_POSTED',
          cashier_ids: [...new Set(overlaps.map((o) => o.cashier_user_id))],
        });
      }

      // Recompute from the ledger NOW: the draft was a preview.
      const fresh = await computeLines(tx, run.store_id, branchIds, run.period_start, run.period_end, rate, cashierIds);
      const freshBy = new Map(fresh.map((f) => [`${f.cashier_user_id}|${f.branch_id}`, f]));
      const names = new Map(
        (await tx.user.findMany({ where: { id: { in: cashierIds } }, select: { id: true, first_name: true, last_name: true } })).map((u) => [u.id, fullName(u)])
      );

      for (const line of run.lines) {
        const f = freshBy.get(`${line.cashier_user_id}|${line.branch_id}`) ?? { gross: 0, reversals: 0, eligible: 0, commission: 0 };
        let expenseId: string | null = null;
        if (f.commission > 0) {
          const categoryId = await this.ensureCategory(tx, line.branch_id);
          const expense = await tx.expense.create({
            data: {
              category_id: categoryId,
              branch_id: line.branch_id,
              amount: f.commission,
              description: `Commission ${rate}% on ₦${f.eligible.toLocaleString()} sales, ${dateStr(run.period_start)} to ${dateStr(run.period_end)} — ${names.get(line.cashier_user_id) ?? 'Attendant'}`,
              expenseDate: run.period_end,
              paymentMethod: 'accrued',
              referenceNumber: `COMM-${run.id.slice(0, 8).toUpperCase()}`,
              createdBy: actor.userId,
              source_type: 'commission_run_line',
              source_id: line.id,
            },
          });
          expenseId = expense.id;
        }
        await tx.commissionRunLine.update({
          where: { id: line.id },
          data: {
            status: 'posted',
            gross_sales: f.gross,
            reversals: f.reversals,
            eligible_sales: f.eligible,
            commission_amount: f.commission,
            expense_id: expenseId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          store_id: run.store_id,
          user_id: actor.userId,
          action: 'COMMISSION_RUN_POSTED',
          resource_type: 'commission_run',
          resource_id: run.id,
          changes: {
            rate,
            total: round2(fresh.reduce((a, f) => a + f.commission, 0)),
            lines: run.lines.length,
            period: [dateStr(run.period_start), dateStr(run.period_end)],
          } as any,
        },
      });
    });
    return this.get(actor, runId);
  }

  /** Discard a draft, or undo a posted run that has nothing paid yet (voids its expenses). */
  static async cancel(actor: Actor, runId: string, reasonRaw: unknown) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager can cancel commission');
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 300) : '';
    if (reason.length < 3) throw new AppError(400, 'A reason is required to cancel a commission run');
    const run = await this.find(actor, runId);
    if (run.status === 'cancelled') throw new AppError(409, 'This run is already cancelled');
    if (run.lines.some((l) => l.payment_status === 'paid')) {
      throw new AppError(409, 'Some commission in this run has been paid — it cannot be cancelled');
    }

    await prisma.$transaction(async (tx) => {
      const r = await tx.commissionRun.updateMany({
        where: { id: runId, status: { in: ['draft', 'posted'] } },
        data: { status: 'cancelled', cancelled_reason: reason },
      });
      if (r.count !== 1) throw new AppError(409, 'This run was just changed by someone else');
      const expenseIds = run.lines.map((l) => l.expense_id).filter(Boolean) as string[];
      if (expenseIds.length) await tx.expense.updateMany({ where: { id: { in: expenseIds } }, data: { status: 'voided' } });
      await tx.commissionRunLine.updateMany({ where: { commission_run_id: runId }, data: { status: 'cancelled' } });
      await tx.auditLog.create({
        data: {
          store_id: run.store_id,
          user_id: actor.userId,
          action: run.status === 'posted' ? 'COMMISSION_RUN_UNPOSTED' : 'COMMISSION_RUN_DISCARDED',
          resource_type: 'commission_run',
          resource_id: run.id,
          changes: { reason, voided_expenses: expenseIds } as any,
        },
      });
    });
    return this.get(actor, runId);
  }

  static async markPaid(actor: Actor, lineId: string, body: { method?: unknown; reference?: unknown }) {
    if (!isSupervisor(actor)) throw new AppError(403, 'Only a manager can record commission payments');
    if (!PAY_METHODS.includes(body.method as any)) throw new AppError(400, "method must be 'cash', 'transfer', 'card' or 'other'");
    const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 100) || null : null;
    const line = await prisma.commissionRunLine.findUnique({ where: { id: lineId } });
    if (!line || (!actor.is_super_admin && line.store_id !== actor.storeId)) throw new AppError(404, 'Commission line not found');
    if (line.status !== 'posted') throw new AppError(409, 'Only posted commission can be paid');
    if (num(line.commission_amount) <= 0) throw new AppError(400, 'There is nothing to pay on this line');

    await prisma.$transaction(async (tx) => {
      const r = await tx.commissionRunLine.updateMany({
        where: { id: lineId, payment_status: 'unpaid', status: 'posted' },
        data: { payment_status: 'paid', paid_at: new Date(), paid_method: body.method as string, paid_reference: reference, paid_by_user_id: actor.userId },
      });
      if (r.count !== 1) throw new AppError(409, 'This commission is already paid');
      if (line.expense_id) {
        await tx.expense.update({ where: { id: line.expense_id }, data: { paymentMethod: body.method as string, referenceNumber: reference ?? undefined } });
      }
      await tx.auditLog.create({
        data: {
          store_id: line.store_id,
          branch_id: line.branch_id,
          user_id: actor.userId,
          action: 'COMMISSION_PAID',
          resource_type: 'commission_run_line',
          resource_id: line.id,
          changes: { cashier_user_id: line.cashier_user_id, amount: num(line.commission_amount), method: body.method, reference } as any,
        },
      });
    });
    return this.get(actor, line.commission_run_id);
  }

  static async list(actor: Actor, opts: { status?: string[] } = {}) {
    const runs = await prisma.commissionRun.findMany({
      where: { store_id: actor.storeId ?? '__none__', ...(opts.status?.length ? { status: { in: opts.status } } : {}) },
      include: { lines: true },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return Promise.all(runs.map((r) => this.serialize(r)));
  }

  static async get(actor: Actor, runId: string) {
    return this.serialize(await this.find(actor, runId));
  }

  /** An Attendant's own posted commission (calculated / paid). */
  static async mine(actor: Actor) {
    const lines = await prisma.commissionRunLine.findMany({
      where: { store_id: actor.storeId ?? '__none__', cashier_user_id: actor.userId, status: 'posted' },
      include: { run: { select: { rate: true } } },
      orderBy: { period_end: 'desc' },
      take: 50,
    });
    return lines.map((l) => ({
      id: l.id,
      period_start: dateStr(l.period_start),
      period_end: dateStr(l.period_end),
      rate: num(l.run.rate),
      eligible_sales: num(l.eligible_sales),
      commission_amount: num(l.commission_amount),
      payment_status: l.payment_status,
      paid_at: l.paid_at,
    }));
  }

  private static async ensureCategory(tx: Prisma.TransactionClient, branchId: string) {
    const existing = await tx.expenseCategory.findFirst({
      where: { branch_id: branchId, name: { equals: COMMISSION_CATEGORY, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.expenseCategory.create({
      data: { name: COMMISSION_CATEGORY, description: 'Created by JayPOS for Attendant commission (Bar / Lounge)', branch_id: branchId },
    });
    return created.id;
  }

  private static async find(actor: Actor, runId: string) {
    const run = await prisma.commissionRun.findUnique({ where: { id: runId }, include: { lines: true } });
    if (!run || (!actor.is_super_admin && run.store_id !== actor.storeId)) throw new AppError(404, 'Commission run not found');
    return run;
  }

  private static async serialize(run: Prisma.CommissionRunGetPayload<{ include: { lines: true } }>) {
    const ids = [...new Set(run.lines.map((l) => l.cashier_user_id))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true } }) : [];
    const nm = new Map(users.map((u) => [u.id, fullName(u)]));
    const lines = run.lines
      .map((l) => ({
        id: l.id,
        cashier: { id: l.cashier_user_id, name: nm.get(l.cashier_user_id) ?? null },
        branch_id: l.branch_id,
        gross_sales: num(l.gross_sales),
        reversals: num(l.reversals),
        eligible_sales: num(l.eligible_sales),
        commission_amount: num(l.commission_amount),
        status: l.status,
        expense_id: l.expense_id,
        payment_status: l.payment_status,
        paid_at: l.paid_at,
        paid_method: l.paid_method,
        paid_reference: l.paid_reference,
      }))
      .sort((a, b) => b.commission_amount - a.commission_amount);
    return {
      id: run.id,
      status: run.status,
      period_start: dateStr(run.period_start),
      period_end: dateStr(run.period_end),
      branch_id: run.branch_id,
      rate: num(run.rate),
      basis: run.basis,
      created_by_user_id: run.created_by_user_id,
      posted_at: run.posted_at,
      cancelled_reason: run.cancelled_reason,
      totals: {
        eligible_sales: round2(lines.reduce((a, l) => a + l.eligible_sales, 0)),
        commission: round2(lines.reduce((a, l) => a + l.commission_amount, 0)),
        paid: round2(lines.filter((l) => l.payment_status === 'paid').reduce((a, l) => a + l.commission_amount, 0)),
      },
      lines,
    };
  }
}
