import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { businessDateToDbDate, getBusinessDayRange } from '../utils/businessDate';
import { storeBusinessDay } from './BarLedgerService';
import { BarDamageService } from './BarDamageService';

/**
 * Bar / Lounge management reports (planning Phase 5, workflow-design §6).
 *
 * Every report returns the SAME table shape — columns + rows + totals — so one
 * CSV writer and one mobile screen render all ten. Ranges are BUSINESS dates
 * (cutoff + timezone from store settings), never server-local calendar days.
 *
 * Sales figures come from the completed bar sales (Transaction with a
 * sales_order_id) — the same rows the existing retail reports read, so a sale
 * reversed later simply drops out of its original day. Money owed comes from the
 * Attendant ledger. Commission comes from posted runs.
 */

export type ColumnType = 'text' | 'money' | 'number' | 'date' | 'percent';
export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}
export interface ReportTable {
  report: BarReportKey;
  title: string;
  description: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null> | null;
}

export const BAR_REPORTS = {
  'daily-sales': { title: 'Daily sales', description: 'Bar sales released per business day.' },
  'sales-by-attendant': { title: 'Sales by Attendant', description: 'Released sales credited to each Attendant.' },
  fulfilment: { title: 'Bar Controller fulfilment', description: 'Orders each Bar Controller released or rejected, and how fast.' },
  remittances: { title: 'Money handed over', description: 'Every hand-over from Attendants to Bar Controllers.' },
  outstanding: { title: 'Outstanding balances', description: 'What each Attendant owes now, by how old the debt is.' },
  'payment-methods': { title: 'Payment methods', description: 'How customers paid compared with what was handed over.' },
  damages: { title: 'Damaged / flat drinks', description: 'Damaged stock written off as a house loss.' },
  commission: { title: 'Attendant commission', description: 'Posted commission and whether it has been paid.' },
  'management-remittance': { title: 'Daily handovers to management', description: 'Each Bar Controller’s day close and what the manager received.' },
  'inventory-adjustments': { title: 'Inventory adjustments', description: 'Damage and adjustment movements in the stock ledger.' },
} as const;
export type BarReportKey = keyof typeof BAR_REPORTS;

/** Bar Controllers see a daily-operations subset, for the last few days only. */
export const CONTROLLER_REPORTS: BarReportKey[] = ['daily-sales', 'sales-by-attendant', 'remittances', 'outstanding', 'payment-methods', 'management-remittance'];
export const CONTROLLER_MAX_DAYS_BACK = 7;
const MAX_RANGE_DAYS = 366;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const fullName = (u?: { first_name: string | null; last_name: string | null } | null) =>
  u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || null : null;
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateStr(d);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', transfer: 'Transfer', card: 'POS', other: 'Other', split: 'Split' };

async function names(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, string | null>();
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, first_name: true, last_name: true, is_active: true } });
  return new Map(users.map((u) => [u.id, fullName(u)]));
}

function sumCol(rows: Record<string, any>[], key: string) {
  return round2(rows.reduce((a, r) => a + (Number(r[key]) || 0), 0));
}

export class BarReportService {
  static resolveRange(
    query: { from?: unknown; to?: unknown },
    today: string,
    opts: { controller: boolean }
  ): { from: string; to: string } {
    const valid = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
    let to = valid(query.to) ?? today;
    let from = valid(query.from) ?? to;
    if (to > today) to = today;
    if (from > to) throw new AppError(400, '“from” must be on or before “to”');
    // Clamp Bar Controllers BEFORE the length check, so a long request is narrowed, not refused.
    if (opts.controller) {
      const earliest = addDays(today, -CONTROLLER_MAX_DAYS_BACK);
      if (from < earliest) from = earliest;
      if (to < earliest) to = earliest;
    }
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new AppError(400, `Reports cover at most ${MAX_RANGE_DAYS} days`);
    return { from, to };
  }

  static async run(
    report: BarReportKey,
    storeId: string,
    branchIds: string[],
    query: { from?: unknown; to?: unknown },
    opts: { controller: boolean }
  ): Promise<ReportTable> {
    if (!(report in BAR_REPORTS)) throw new AppError(404, 'Unknown report');
    if (opts.controller && !CONTROLLER_REPORTS.includes(report)) throw new AppError(403, 'This report is for managers');
    const day = await storeBusinessDay(storeId);
    const { from, to } = this.resolveRange(query, day.today, opts);
    const range = { gte: businessDateToDbDate(from), lte: businessDateToDbDate(to) };
    const base = { report, ...BAR_REPORTS[report], from, to };
    const tz = { cutoffHour: day.cutoffHour, timeZone: day.timeZone };

    switch (report) {
      case 'daily-sales': {
        const rows = await prisma.transaction.groupBy({
          by: ['business_date'],
          where: { store_id: storeId, branch_id: { in: branchIds }, sales_order_id: { not: null }, status: 'completed', business_date: range },
          _sum: { total_amount: true, tax_amount: true },
          _count: { _all: true },
          orderBy: { business_date: 'asc' },
        });
        const out = rows.map((r) => {
          const total = num(r._sum.total_amount);
          return {
            business_date: r.business_date ? dateStr(r.business_date) : null,
            orders: r._count._all,
            sales: total,
            tax: num(r._sum.tax_amount),
            average_order: r._count._all ? round2(total / r._count._all) : 0,
          };
        });
        return {
          ...base,
          columns: [
            { key: 'business_date', label: 'Business day', type: 'date' },
            { key: 'orders', label: 'Orders', type: 'number' },
            { key: 'sales', label: 'Sales', type: 'money' },
            { key: 'tax', label: 'VAT', type: 'money' },
            { key: 'average_order', label: 'Average order', type: 'money' },
          ],
          rows: out,
          totals: out.length
            ? { business_date: 'Total', orders: sumCol(out, 'orders'), sales: sumCol(out, 'sales'), tax: sumCol(out, 'tax'), average_order: sumCol(out, 'orders') ? round2(sumCol(out, 'sales') / sumCol(out, 'orders')) : 0 }
            : null,
        };
      }

      case 'sales-by-attendant': {
        const rows = await prisma.transaction.groupBy({
          by: ['user_id'],
          where: { store_id: storeId, branch_id: { in: branchIds }, sales_order_id: { not: null }, status: 'completed', business_date: range },
          _sum: { total_amount: true },
          _count: { _all: true },
        });
        const nm = await names(rows.map((r) => r.user_id));
        const grand = rows.reduce((a, r) => a + num(r._sum.total_amount), 0);
        const out = rows
          .map((r) => ({
            attendant: nm.get(r.user_id) ?? r.user_id,
            orders: r._count._all,
            sales: num(r._sum.total_amount),
            share: grand ? round2((num(r._sum.total_amount) / grand) * 100) : 0,
          }))
          .sort((a, b) => b.sales - a.sales);
        return {
          ...base,
          columns: [
            { key: 'attendant', label: 'Attendant', type: 'text' },
            { key: 'orders', label: 'Orders', type: 'number' },
            { key: 'sales', label: 'Sales', type: 'money' },
            { key: 'share', label: 'Share', type: 'percent' },
          ],
          rows: out,
          totals: out.length ? { attendant: 'Total', orders: sumCol(out, 'orders'), sales: round2(grand), share: 100 } : null,
        };
      }

      case 'fulfilment': {
        const start = getBusinessDayRange(from, tz).start;
        const end = getBusinessDayRange(to, tz).end;
        const [released, rejected] = await Promise.all([
          prisma.barOrder.findMany({
            where: { store_id: storeId, branch_id: { in: branchIds }, fulfilled_by_user_id: { not: null }, business_date: range },
            select: { fulfilled_by_user_id: true, fulfilled_total: true, total_amount: true, submitted_at: true, fulfilled_at: true, closed_reason: true, status: true },
          }),
          prisma.barOrder.findMany({
            where: { store_id: storeId, branch_id: { in: branchIds }, status: 'rejected', closed_at: { gte: start, lt: end } },
            select: { closed_by_user_id: true },
          }),
        ]);
        const by = new Map<string, { released: number; value: number; reduced: number; reversed: number; minutes: number[]; rejected: number }>();
        const get = (id: string) => by.get(id) ?? { released: 0, value: 0, reduced: 0, reversed: 0, minutes: [], rejected: 0 };
        for (const o of released) {
          const v = get(o.fulfilled_by_user_id!);
          v.released++;
          if (o.status === 'reversed') v.reversed++;
          else v.value = round2(v.value + num(o.fulfilled_total ?? o.total_amount));
          if (o.closed_reason && o.status !== 'reversed') v.reduced++;
          if (o.fulfilled_at) v.minutes.push((o.fulfilled_at.getTime() - o.submitted_at.getTime()) / 60000);
          by.set(o.fulfilled_by_user_id!, v);
        }
        for (const o of rejected) {
          if (!o.closed_by_user_id) continue;
          const v = get(o.closed_by_user_id);
          v.rejected++;
          by.set(o.closed_by_user_id, v);
        }
        const nm = await names([...by.keys()]);
        const out = [...by.entries()]
          .map(([id, v]) => ({
            controller: nm.get(id) ?? id,
            released: v.released,
            value: v.value,
            reduced: v.reduced,
            reversed: v.reversed,
            rejected: v.rejected,
            avg_minutes: v.minutes.length ? round2(v.minutes.reduce((a, b) => a + b, 0) / v.minutes.length) : null,
          }))
          .sort((a, b) => b.released - a.released);
        return {
          ...base,
          columns: [
            { key: 'controller', label: 'Bar Controller', type: 'text' },
            { key: 'released', label: 'Released', type: 'number' },
            { key: 'value', label: 'Value', type: 'money' },
            { key: 'reduced', label: 'Released short', type: 'number' },
            { key: 'reversed', label: 'Later reversed', type: 'number' },
            { key: 'rejected', label: 'Rejected', type: 'number' },
            { key: 'avg_minutes', label: 'Avg minutes to release', type: 'number' },
          ],
          rows: out,
          totals: out.length
            ? { controller: 'Total', released: sumCol(out, 'released'), value: sumCol(out, 'value'), reduced: sumCol(out, 'reduced'), reversed: sumCol(out, 'reversed'), rejected: sumCol(out, 'rejected'), avg_minutes: null }
            : null,
        };
      }

      case 'remittances': {
        const rows = await prisma.cashierRemittance.findMany({
          where: { store_id: storeId, branch_id: { in: branchIds }, business_date: range },
          orderBy: [{ business_date: 'asc' }, { created_at: 'asc' }],
          take: 5000,
        });
        const nm = await names(rows.flatMap((r) => [r.cashier_user_id, r.received_by_user_id]));
        const out = rows.map((r) => ({
          business_date: dateStr(r.business_date),
          attendant: nm.get(r.cashier_user_id) ?? r.cashier_user_id,
          received_by: nm.get(r.received_by_user_id) ?? r.received_by_user_id,
          method: METHOD_LABEL[r.method] ?? r.method,
          reference: r.reference,
          amount: r.status === 'recorded' ? num(r.amount) : 0,
          status: r.status === 'recorded' ? 'Recorded' : `Reversed: ${r.reversal_reason ?? ''}`,
        }));
        return {
          ...base,
          columns: [
            { key: 'business_date', label: 'Business day', type: 'date' },
            { key: 'attendant', label: 'Attendant', type: 'text' },
            { key: 'received_by', label: 'Received by', type: 'text' },
            { key: 'method', label: 'Method', type: 'text' },
            { key: 'reference', label: 'Reference', type: 'text' },
            { key: 'amount', label: 'Amount', type: 'money' },
            { key: 'status', label: 'Status', type: 'text' },
          ],
          rows: out,
          totals: out.length ? { business_date: 'Total', amount: sumCol(out, 'amount') } : null,
        };
      }

      case 'outstanding': {
        // As of today: FIFO — money handed over pays the OLDEST sales first.
        const people = await prisma.user.findMany({
          where: {
            store_id: storeId,
            OR: [{ operational_profile: 'bar_attendant', branch_id: { in: branchIds } }],
          },
          select: { id: true },
        });
        const withLedger = await prisma.cashierLedgerEntry.findMany({
          where: { store_id: storeId, branch_id: { in: branchIds } },
          distinct: ['cashier_user_id'],
          select: { cashier_user_id: true },
        });
        const ids = [...new Set([...people.map((p) => p.id), ...withLedger.map((w) => w.cashier_user_id)])];
        const entries = ids.length
          ? await prisma.cashierLedgerEntry.findMany({
              where: { store_id: storeId, cashier_user_id: { in: ids } },
              select: { cashier_user_id: true, amount: true, business_date: true },
              orderBy: { business_date: 'asc' },
            })
          : [];
        const users = ids.length
          ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, first_name: true, last_name: true, is_active: true } })
          : [];
        const out = users
          .map((u) => {
            const mine = entries.filter((e) => e.cashier_user_id === u.id);
            let credit = mine.filter((e) => num(e.amount) < 0).reduce((a, e) => a - num(e.amount), 0);
            const buckets = { d0_1: 0, d2_7: 0, d8_30: 0, d31: 0 };
            for (const e of mine.filter((x) => num(x.amount) > 0)) {
              let open = num(e.amount);
              const used = Math.min(open, credit);
              open -= used;
              credit -= used;
              if (open <= 0.009) continue;
              const age = daysBetween(dateStr(e.business_date), day.today);
              if (age <= 1) buckets.d0_1 += open;
              else if (age <= 7) buckets.d2_7 += open;
              else if (age <= 30) buckets.d8_30 += open;
              else buckets.d31 += open;
            }
            const outstanding = round2(mine.reduce((a, e) => a + num(e.amount), 0));
            return {
              attendant: fullName(u) ?? u.id,
              active: u.is_active ? 'Yes' : 'No — left',
              outstanding,
              d0_1: round2(buckets.d0_1),
              d2_7: round2(buckets.d2_7),
              d8_30: round2(buckets.d8_30),
              d31: round2(buckets.d31),
              credit: round2(credit),
            };
          })
          .filter((r) => Math.abs(r.outstanding) > 0.009 || r.active === 'Yes')
          .sort((a, b) => b.outstanding - a.outstanding);
        return {
          ...base,
          from: day.today,
          to: day.today,
          description: `${BAR_REPORTS.outstanding.description} As of ${day.today}; hand-overs pay the oldest sales first.`,
          columns: [
            { key: 'attendant', label: 'Attendant', type: 'text' },
            { key: 'active', label: 'Active', type: 'text' },
            { key: 'outstanding', label: 'Owes now', type: 'money' },
            { key: 'd0_1', label: 'Today / yesterday', type: 'money' },
            { key: 'd2_7', label: '2–7 days', type: 'money' },
            { key: 'd8_30', label: '8–30 days', type: 'money' },
            { key: 'd31', label: 'Over 30 days', type: 'money' },
            { key: 'credit', label: 'In credit', type: 'money' },
          ],
          rows: out,
          totals: out.length
            ? { attendant: 'Total', outstanding: sumCol(out, 'outstanding'), d0_1: sumCol(out, 'd0_1'), d2_7: sumCol(out, 'd2_7'), d8_30: sumCol(out, 'd8_30'), d31: sumCol(out, 'd31'), credit: sumCol(out, 'credit') }
            : null,
        };
      }

      case 'payment-methods': {
        const [sales, remits] = await Promise.all([
          prisma.transaction.findMany({
            where: { store_id: storeId, branch_id: { in: branchIds }, sales_order_id: { not: null }, status: 'completed', business_date: range },
            select: { payment_method: true, total_amount: true, payment_splits: true },
          }),
          prisma.cashierRemittance.groupBy({
            by: ['method'],
            where: { store_id: storeId, branch_id: { in: branchIds }, business_date: range, status: 'recorded' },
            _sum: { amount: true },
          }),
        ]);
        const declared: Record<string, number> = {};
        for (const s of sales) {
          const splits = s.payment_splits as any;
          if (s.payment_method === 'split' && splits && typeof splits === 'object') {
            for (const k of ['cash', 'transfer', 'card']) declared[k] = round2((declared[k] ?? 0) + Number(splits[k] ?? 0));
          } else {
            declared[s.payment_method] = round2((declared[s.payment_method] ?? 0) + num(s.total_amount));
          }
        }
        const received = Object.fromEntries(remits.map((r) => [r.method, num(r._sum.amount)]));
        const methods = [...new Set(['cash', 'transfer', 'card', 'other', ...Object.keys(declared), ...Object.keys(received)])];
        const out = methods
          .map((m) => ({
            method: METHOD_LABEL[m] ?? m,
            customers_paid: declared[m] ?? 0,
            handed_over: received[m] ?? 0,
            difference: round2((received[m] ?? 0) - (declared[m] ?? 0)),
          }))
          .filter((r) => r.customers_paid || r.handed_over);
        return {
          ...base,
          description: `${BAR_REPORTS['payment-methods'].description} A negative difference means less was handed over than customers paid that way (outstanding balances carry forward).`,
          columns: [
            { key: 'method', label: 'Method', type: 'text' },
            { key: 'customers_paid', label: 'Customers paid', type: 'money' },
            { key: 'handed_over', label: 'Handed over', type: 'money' },
            { key: 'difference', label: 'Difference', type: 'money' },
          ],
          rows: out,
          totals: out.length
            ? { method: 'Total', customers_paid: sumCol(out, 'customers_paid'), handed_over: sumCol(out, 'handed_over'), difference: sumCol(out, 'difference') }
            : null,
        };
      }

      case 'damages': {
        const list = await BarDamageService.list(storeId, { branchIds, from, to });
        const out = list.items.map((d) => ({
          business_date: d.business_date,
          product: d.product_name,
          quantity: d.quantity,
          reason: d.reason_code,
          attendant: d.responsible?.name ?? 'House',
          recorded_by: d.recorded_by.name,
          cost_value: d.cost_value,
          retail_value: d.retail_value,
        }));
        return {
          ...base,
          columns: [
            { key: 'business_date', label: 'Business day', type: 'date' },
            { key: 'product', label: 'Product', type: 'text' },
            { key: 'quantity', label: 'Qty', type: 'number' },
            { key: 'reason', label: 'Reason', type: 'text' },
            { key: 'attendant', label: 'Attendant involved', type: 'text' },
            { key: 'recorded_by', label: 'Recorded by', type: 'text' },
            { key: 'cost_value', label: 'Loss at cost', type: 'money' },
            { key: 'retail_value', label: 'Lost sales', type: 'money' },
          ],
          rows: out,
          totals: out.length
            ? { business_date: 'Total', quantity: list.totals.quantity, cost_value: list.totals.cost_value, retail_value: list.totals.retail_value }
            : null,
        };
      }

      case 'commission': {
        const lines = await prisma.commissionRunLine.findMany({
          where: {
            store_id: storeId,
            branch_id: { in: branchIds },
            status: 'posted',
            period_start: { lte: range.lte },
            period_end: { gte: range.gte },
          },
          include: { run: { select: { rate: true } } },
          orderBy: [{ period_end: 'asc' }],
        });
        const nm = await names(lines.map((l) => l.cashier_user_id));
        const out = lines.map((l) => ({
          period: `${dateStr(l.period_start)} – ${dateStr(l.period_end)}`,
          attendant: nm.get(l.cashier_user_id) ?? l.cashier_user_id,
          eligible_sales: num(l.eligible_sales),
          rate: num(l.run.rate),
          commission: num(l.commission_amount),
          status: l.payment_status === 'paid' ? `Paid ${l.paid_at ? dateStr(l.paid_at) : ''} (${METHOD_LABEL[l.paid_method ?? ''] ?? l.paid_method ?? ''})` : 'Not paid yet',
        }));
        const paid = round2(lines.filter((l) => l.payment_status === 'paid').reduce((a, l) => a + num(l.commission_amount), 0));
        return {
          ...base,
          description: `${BAR_REPORTS.commission.description} Runs overlapping the range. Paid so far: ₦${paid.toLocaleString()}.`,
          columns: [
            { key: 'period', label: 'Period', type: 'text' },
            { key: 'attendant', label: 'Attendant', type: 'text' },
            { key: 'eligible_sales', label: 'Total sales', type: 'money' },
            { key: 'rate', label: 'Rate %', type: 'number' },
            { key: 'commission', label: 'Commission', type: 'money' },
            { key: 'status', label: 'Payment', type: 'text' },
          ],
          rows: out,
          totals: out.length ? { period: 'Total', eligible_sales: sumCol(out, 'eligible_sales'), commission: sumCol(out, 'commission') } : null,
        };
      }

      case 'management-remittance': {
        const closes = await prisma.barDayClose.findMany({
          where: { store_id: storeId, branch_id: { in: branchIds }, business_date: range },
          orderBy: [{ business_date: 'asc' }],
        });
        const nm = await names(closes.flatMap((c) => [c.closed_by_user_id, c.acknowledged_by_user_id ?? '']));
        const out = closes.map((c) => ({
          business_date: dateStr(c.business_date),
          controller: nm.get(c.closed_by_user_id) ?? c.closed_by_user_id,
          expected_cash: num(c.expected_cash),
          transfer_pos: round2(num(c.expected_transfer) + num(c.expected_card) + num(c.expected_other)),
          counted_cash: num(c.counted_cash),
          variance: num(c.variance),
          received: c.acknowledged_amount === null ? null : num(c.acknowledged_amount),
          status:
            c.status === 'acknowledged'
              ? `Handed over to ${nm.get(c.acknowledged_by_user_id ?? '') ?? 'manager'}${c.variance_treatment === 'charge_controller' ? ' · shortage charged' : c.variance_treatment === 'absorb' ? ' · absorbed' : ''}`
              : c.status === 'reopened'
                ? 'Reopened'
                : 'Waiting for manager',
        }));
        return {
          ...base,
          columns: [
            { key: 'business_date', label: 'Business day', type: 'date' },
            { key: 'controller', label: 'Bar Controller', type: 'text' },
            { key: 'expected_cash', label: 'Cash expected', type: 'money' },
            { key: 'counted_cash', label: 'Cash counted', type: 'money' },
            { key: 'variance', label: 'Over / short', type: 'money' },
            { key: 'received', label: 'Manager received', type: 'money' },
            { key: 'transfer_pos', label: 'Transfer / POS (bank)', type: 'money' },
            { key: 'status', label: 'Status', type: 'text' },
          ],
          rows: out,
          totals: out.length
            ? { business_date: 'Total', expected_cash: sumCol(out, 'expected_cash'), counted_cash: sumCol(out, 'counted_cash'), variance: sumCol(out, 'variance'), received: sumCol(out, 'received'), transfer_pos: sumCol(out, 'transfer_pos') }
            : null,
        };
      }

      case 'inventory-adjustments': {
        const start = getBusinessDayRange(from, tz).start;
        const end = getBusinessDayRange(to, tz).end;
        const moves = await prisma.inventoryMovement.findMany({
          where: { store_id: storeId, branch_id: { in: branchIds }, movement_type: { in: ['damage', 'adjustment'] }, timestamp: { gte: start, lt: end } },
          include: { product: { select: { name: true, cost_price: true } } },
          orderBy: { timestamp: 'asc' },
          take: 5000,
        });
        const nm = await names(moves.map((m) => m.user_id ?? ''));
        const out = moves.map((m) => ({
          when: m.timestamp.toISOString().replace('T', ' ').slice(0, 16),
          product: m.product?.name ?? m.product_id,
          type: m.movement_type === 'damage' ? 'Damage' : 'Adjustment',
          quantity: num(m.quantity),
          value_at_cost: round2(num(m.quantity) * num(m.product?.cost_price)),
          by: nm.get(m.user_id ?? '') ?? null,
          note: m.notes,
        }));
        return {
          ...base,
          description: `${BAR_REPORTS['inventory-adjustments'].description} Negative quantities left stock; positive came back (reversals, voids, counts). Times are UTC.`,
          columns: [
            { key: 'when', label: 'When (UTC)', type: 'text' },
            { key: 'product', label: 'Product', type: 'text' },
            { key: 'type', label: 'Type', type: 'text' },
            { key: 'quantity', label: 'Qty', type: 'number' },
            { key: 'value_at_cost', label: 'Value at cost', type: 'money' },
            { key: 'by', label: 'By', type: 'text' },
            { key: 'note', label: 'Note', type: 'text' },
          ],
          rows: out,
          totals: out.length ? { when: 'Net', quantity: sumCol(out, 'quantity'), value_at_cost: sumCol(out, 'value_at_cost') } : null,
        };
      }
    }
    throw new AppError(404, 'Unknown report');
  }

  /** CSV (RFC 4180) for any report table, with a totals row. */
  static toCsv(t: ReportTable): string {
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
    };
    const lines = [
      `${esc(t.title)},${esc(`${t.from} to ${t.to}`)}`,
      t.columns.map((c) => esc(c.label)).join(','),
      ...t.rows.map((r) => t.columns.map((c) => esc(r[c.key])).join(',')),
    ];
    if (t.totals) lines.push(t.columns.map((c) => esc(t.totals![c.key])).join(','));
    return lines.join('\r\n') + '\r\n';
  }
}
