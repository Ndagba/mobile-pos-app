import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { businessDateToDbDate } from '../utils/businessDate';
import { storeBusinessDay } from './BarLedgerService';
import { assertDayOpen } from './barDayGuard';

/**
 * Flat / damaged stock (Bar/Lounge Phase 4).
 *
 *  - Always a HOUSE LOSS (D24): never a sale, never touches the Attendant ledger,
 *    never part of commission. Naming the Attendant is for analytics only.
 *  - Recording = one DB unit: guarded stock decrement (cannot go negative) +
 *    a `damage` InventoryMovement + the DamageRecord (cost/price snapshots) + audit.
 *  - Never edited or deleted; a mistake is reversed (stock back via an
 *    `adjustment` movement). Controllers: own records, same day. Managers: any —
 *    but never inside a closed day (reopen first).
 *  - Idempotent on client_ref.
 *  - Controllers see today only (D14); managers any range.
 */

export const DAMAGE_REASONS = ['flat', 'broken', 'bad_cap', 'expired', 'other'] as const;
type Reason = (typeof DAMAGE_REASONS)[number];

interface Actor {
  userId: string;
  role?: string;
  storeId?: string | null;
  is_super_admin?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? 0 : Number(d));
const isSupervisor = (a: Actor) => a.role === 'admin' || a.role === 'manager' || !!a.is_super_admin;

const INCLUDE = {
  // names resolved separately (no relations on DamageRecord, by design: append-only log)
} as const;

export class BarDamageService {
  static async record(
    actor: Actor,
    branchId: string,
    body: { client_ref?: unknown; product_id?: unknown; quantity?: unknown; reason_code?: unknown; notes?: unknown; responsible_user_id?: unknown }
  ) {
    const storeId = actor.storeId;
    if (!storeId) throw new AppError(403, 'No store on this account');

    const clientRef = typeof body.client_ref === 'string' ? body.client_ref.trim() : '';
    if (clientRef.length < 8 || clientRef.length > 100) throw new AppError(400, 'client_ref (8–100 characters) is required');
    const replay = await prisma.damageRecord.findUnique({ where: { client_ref: clientRef } });
    if (replay) {
      if (replay.store_id !== storeId || replay.recorded_by_user_id !== actor.userId) throw new AppError(409, 'client_ref already used');
      return { record: await this.serializeOne(replay), replayed: true };
    }

    if (!DAMAGE_REASONS.includes(body.reason_code as Reason)) {
      throw new AppError(400, `reason_code must be one of ${DAMAGE_REASONS.join(', ')}`);
    }
    const reason = body.reason_code as Reason;
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) throw new AppError(400, 'Quantity must be positive');
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) || null : null;
    if (reason === 'other' && !notes) throw new AppError(400, "Add a note when the reason is 'other'");

    const productId = typeof body.product_id === 'string' ? body.product_id : '';
    const product = await prisma.product.findFirst({
      where: { id: productId, branch_id: branchId, is_active: true },
      select: { id: true, name: true, item_type: true, cost_price: true, effective_price: true },
    });
    if (!product) throw new AppError(400, 'Product not found in this branch');
    if (product.item_type !== 'PRODUCT') throw new AppError(400, 'Services have no stock to damage');

    let responsible: string | null = null;
    if (body.responsible_user_id !== undefined && body.responsible_user_id !== null && body.responsible_user_id !== '') {
      const u = await prisma.user.findUnique({ where: { id: String(body.responsible_user_id) }, select: { id: true, store_id: true } });
      if (!u || u.store_id !== storeId) throw new AppError(400, 'Unknown Attendant');
      responsible = u.id;
    }

    const day = await storeBusinessDay(storeId);
    const dateDb = businessDateToDbDate(day.today);
    await assertDayOpen(actor.userId, dateDb, { self: true, what: 'record damages' });

    const created = await prisma.$transaction(async (tx) => {
      // Guarded decrement: never below zero, even under concurrency.
      const dec = await tx.inventory.updateMany({
        where: { product_id: product.id, quantity_on_hand: { gte: quantity } },
        data: { quantity_on_hand: { decrement: quantity } },
      });
      if (dec.count !== 1) throw new AppError(400, `Not enough ${product.name} in stock to write off ${quantity}`);

      const rec = await tx.damageRecord.create({
        data: {
          store_id: storeId,
          branch_id: branchId,
          product_id: product.id,
          quantity,
          reason_code: reason,
          notes,
          responsible_user_id: responsible,
          recorded_by_user_id: actor.userId,
          unit_cost: product.cost_price,
          unit_price: product.effective_price,
          business_date: dateDb,
          client_ref: clientRef,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          store_id: storeId,
          branch_id: branchId,
          product_id: product.id,
          movement_type: 'damage',
          quantity: -quantity,
          reference_id: rec.id,
          notes: `Damage (${reason})${notes ? `: ${notes}` : ''}`,
          user_id: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          store_id: storeId,
          branch_id: branchId,
          user_id: actor.userId,
          action: 'DAMAGE_RECORDED',
          resource_type: 'damage_record',
          resource_id: rec.id,
          changes: {
            product_id: product.id,
            quantity,
            reason_code: reason,
            responsible_user_id: responsible,
            cost_value: round2(num(product.cost_price) * quantity),
          } as any,
        },
      });
      return rec;
    });
    return { record: await this.serializeOne(created), replayed: false };
  }

  static async reverse(actor: Actor, id: string, reasonRaw: unknown) {
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim().slice(0, 300) : '';
    if (reason.length < 3) throw new AppError(400, 'A reason is required to reverse a damage record');
    const rec = await prisma.damageRecord.findUnique({ where: { id } });
    if (!rec || (!actor.is_super_admin && rec.store_id !== actor.storeId)) throw new AppError(404, 'Damage record not found');
    if (rec.status !== 'recorded') throw new AppError(409, 'This damage record is already reversed');

    const day = await storeBusinessDay(rec.store_id);
    if (!isSupervisor(actor)) {
      if (rec.recorded_by_user_id !== actor.userId) throw new AppError(403, 'You can only reverse damages you recorded');
      if (rec.business_date.toISOString().slice(0, 10) !== day.today) throw new AppError(403, 'Only a manager can reverse a damage from a past day');
    }
    await assertDayOpen(rec.recorded_by_user_id, rec.business_date, {
      self: rec.recorded_by_user_id === actor.userId,
      what: 'reverse this damage',
    });

    await prisma.$transaction(async (tx) => {
      const r = await tx.damageRecord.updateMany({
        where: { id, status: 'recorded' },
        data: { status: 'reversed', reversed_by_user_id: actor.userId, reversed_at: new Date(), reversal_reason: reason },
      });
      if (r.count !== 1) throw new AppError(409, 'This damage record was just changed by someone else');
      await tx.inventory.update({
        where: { product_id: rec.product_id },
        data: { quantity_on_hand: { increment: rec.quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          store_id: rec.store_id,
          branch_id: rec.branch_id,
          product_id: rec.product_id,
          movement_type: 'adjustment',
          quantity: rec.quantity,
          reference_id: rec.id,
          notes: `Damage reversed: ${reason}`,
          user_id: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          store_id: rec.store_id,
          branch_id: rec.branch_id,
          user_id: actor.userId,
          action: 'DAMAGE_REVERSED',
          resource_type: 'damage_record',
          resource_id: rec.id,
          changes: { reason, quantity: num(rec.quantity) } as any,
        },
      });
    });
    return this.serializeOne(await prisma.damageRecord.findUniqueOrThrow({ where: { id } }));
  }

  /** Damage list + totals (house-loss values at cost and at selling price). */
  static async list(
    storeId: string,
    opts: { branchIds?: string[]; from?: string; to?: string; responsibleId?: string; productId?: string; includeReversed?: boolean }
  ) {
    const where: Prisma.DamageRecordWhereInput = { store_id: storeId };
    if (opts.branchIds) where.branch_id = { in: opts.branchIds };
    if (opts.responsibleId) where.responsible_user_id = opts.responsibleId;
    if (opts.productId) where.product_id = opts.productId;
    if (!opts.includeReversed) where.status = 'recorded';
    if (opts.from || opts.to) {
      where.business_date = {};
      if (opts.from) where.business_date.gte = businessDateToDbDate(opts.from);
      if (opts.to) where.business_date.lte = businessDateToDbDate(opts.to);
    }
    const rows = await prisma.damageRecord.findMany({ where, orderBy: { created_at: 'desc' }, take: 500 });
    const items = await this.serialize(rows);

    const totals = { count: 0, quantity: 0, cost_value: 0, retail_value: 0 };
    const byProduct = new Map<string, { product_id: string; product_name: string | null; quantity: number; cost_value: number; retail_value: number }>();
    const byReason: Record<string, number> = {};
    const byResponsible = new Map<string, { user_id: string | null; name: string | null; quantity: number; cost_value: number }>();
    for (const it of items.filter((i) => i.status === 'recorded')) {
      totals.count++;
      totals.quantity += it.quantity;
      totals.cost_value += it.cost_value;
      totals.retail_value += it.retail_value;
      const p = byProduct.get(it.product_id) ?? { product_id: it.product_id, product_name: it.product_name, quantity: 0, cost_value: 0, retail_value: 0 };
      p.quantity += it.quantity;
      p.cost_value = round2(p.cost_value + it.cost_value);
      p.retail_value = round2(p.retail_value + it.retail_value);
      byProduct.set(it.product_id, p);
      byReason[it.reason_code] = (byReason[it.reason_code] ?? 0) + it.quantity;
      const key = it.responsible?.id ?? 'house';
      const r = byResponsible.get(key) ?? { user_id: it.responsible?.id ?? null, name: it.responsible?.name ?? 'House', quantity: 0, cost_value: 0 };
      r.quantity += it.quantity;
      r.cost_value = round2(r.cost_value + it.cost_value);
      byResponsible.set(key, r);
    }
    totals.cost_value = round2(totals.cost_value);
    totals.retail_value = round2(totals.retail_value);
    return {
      items,
      totals,
      by_product: [...byProduct.values()].sort((a, b) => b.cost_value - a.cost_value),
      by_reason: byReason,
      by_responsible: [...byResponsible.values()].sort((a, b) => b.quantity - a.quantity),
    };
  }

  private static async serializeOne(r: Prisma.DamageRecordGetPayload<typeof INCLUDE>) {
    return (await this.serialize([r]))[0];
  }

  private static async serialize(rows: Prisma.DamageRecordGetPayload<typeof INCLUDE>[]) {
    const userIds = [...new Set(rows.flatMap((r) => [r.recorded_by_user_id, r.responsible_user_id].filter(Boolean) as string[]))];
    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const [users, products] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, first_name: true, last_name: true } }) : [],
      productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
    ]);
    const uname = new Map(users.map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ') || null]));
    const pname = new Map(products.map((p) => [p.id, p.name]));
    return rows.map((r) => {
      const qty = num(r.quantity);
      return {
        id: r.id,
        product_id: r.product_id,
        product_name: pname.get(r.product_id) ?? null,
        quantity: qty,
        reason_code: r.reason_code,
        notes: r.notes,
        responsible: r.responsible_user_id ? { id: r.responsible_user_id, name: uname.get(r.responsible_user_id) ?? null } : null,
        recorded_by: { id: r.recorded_by_user_id, name: uname.get(r.recorded_by_user_id) ?? null },
        unit_cost: r.unit_cost === null ? null : num(r.unit_cost),
        unit_price: num(r.unit_price),
        cost_value: round2(num(r.unit_cost) * qty),
        retail_value: round2(num(r.unit_price) * qty),
        business_date: r.business_date.toISOString().slice(0, 10),
        status: r.status,
        reversal_reason: r.reversal_reason,
        created_at: r.created_at,
      };
    });
  }
}
