import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';

/**
 * Procurement engine (Phase 4B). Mirrors TransactionService's shape: static
 * methods, all stock mutation inside a single `prisma.$transaction`, and the
 * hermetic-mock-friendly `prisma`/`Prisma` imports.
 *
 * Receiving is the ONLY new stock-in path — each received line increments
 * `Inventory.quantity_on_hand` AND writes exactly one `purchase`
 * `InventoryMovement`, atomically. PO totals are computed server-side (unlike
 * sales, the server does not trust client totals for POs).
 */

export interface POLineInput {
  product_id: string;
  quantity_ordered: number | string;
  unit_cost: number | string;
  notes?: string;
}

export interface CreatePOInput {
  store_id: string;
  branch_id: string;
  supplier_id: string;
  po_number?: string;
  expected_date?: string | null;
  notes?: string;
  created_by_user_id?: string | null;
  items: POLineInput[];
}

export interface ReceiveLineInput {
  purchase_order_item_id: string;
  quantity_received: number | string;
  unit_cost?: number | string;
  batch_number?: string;
  expiry_date?: string | null;
}

export interface ReceiveGoodsInput {
  purchase_order_id: string;
  store_id: string;
  authorized_branch_ids: string[];
  received_date?: string | null;
  reference?: string;
  receipt_hash?: string;
  create_invoice?: boolean;
  notes?: string;
  user_id?: string | null;
  items: ReceiveLineInput[];
}

/** Round to 2 dp for money (mirrors the per-line rounding in TransactionService). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export class PurchaseOrderService {
  /** UI-side role gate parity: only admin/manager may write. Throws 403 otherwise. */
  static assertCanManage(role: string | undefined): void {
    if (!['admin', 'manager'].includes(role ?? '')) {
      throw new AppError(403, 'Only admins or managers can manage purchase orders');
    }
  }

  /**
   * Validates lines against the catalog and computes per-line + header totals.
   * `productMap` maps product_id → { tax_rate, item_type, name }. SERVICE items
   * are rejected (no inventory to order). Returns Prisma-ready line rows.
   */
  static computeLineTotals(
    items: POLineInput[],
    productMap: Map<string, { tax_rate: Prisma.Decimal | number; item_type: string; name: string }>
  ): {
    lineData: Array<{
      id: string;
      product_id: string;
      quantity_ordered: Prisma.Decimal;
      unit_cost: Prisma.Decimal;
      line_total: Prisma.Decimal;
      notes: string | null;
    }>;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
  } {
    let subtotal = 0;
    let taxAmount = 0;

    const lineData = items.map((line) => {
      const product = productMap.get(line.product_id);
      if (!product) throw new AppError(400, `Product ${line.product_id} not found in this branch`);
      if (product.item_type === 'SERVICE') {
        throw new AppError(400, `Cannot order stock for service "${product.name}"`);
      }
      const qty = Number(line.quantity_ordered);
      const cost = Number(line.unit_cost);
      if (!(qty > 0)) throw new AppError(400, `Quantity for "${product.name}" must be greater than 0`);
      if (!(cost >= 0)) throw new AppError(400, `Unit cost for "${product.name}" must be 0 or more`);

      const lineTotal = round2(qty * cost);
      const lineTax = round2((qty * cost * Number(product.tax_rate)) / 100);
      subtotal += lineTotal;
      taxAmount += lineTax;

      return {
        id: uuidv4(),
        product_id: line.product_id,
        quantity_ordered: new Prisma.Decimal(qty),
        unit_cost: new Prisma.Decimal(cost),
        line_total: new Prisma.Decimal(lineTotal),
        notes: line.notes?.trim() || null,
      };
    });

    subtotal = round2(subtotal);
    taxAmount = round2(taxAmount);
    return { lineData, subtotal, taxAmount, totalAmount: round2(subtotal + taxAmount) };
  }

  /** Derives header status from line roll-ups (over-receipt counts as received). */
  static deriveStatus(
    items: Array<{ quantity_ordered: Prisma.Decimal | number; quantity_received: Prisma.Decimal | number }>
  ): 'ordered' | 'partially_received' | 'received' {
    const anyReceived = items.some((i) => Number(i.quantity_received) > 0);
    const allReceived = items.every((i) => Number(i.quantity_received) >= Number(i.quantity_ordered));
    if (allReceived) return 'received';
    if (anyReceived) return 'partially_received';
    return 'ordered';
  }

  /** Adds a per-line `quantity_outstanding` for API responses. */
  static serialize(po: any) {
    const items = (po.items ?? []).map((it: any) => ({
      ...it,
      quantity_outstanding: Math.max(0, Number(it.quantity_ordered) - Number(it.quantity_received)),
    }));
    return { ...po, items };
  }

  /** A store-unique PO number: PO-YYYYMMDD-XXXX (retries on the @@unique collision). */
  static async generatePoNumber(storeId: string): Promise<string> {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      const rand = Math.floor(1000 + Math.random() * 9000);
      const candidate = `PO-${stamp}-${rand}`;
      const existing = await prisma.purchaseOrder.findFirst({
        where: { store_id: storeId, po_number: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    return `PO-${stamp}-${uuidv4().slice(0, 8)}`;
  }

  /** Creates a draft PO with server-computed totals. */
  static async createPurchaseOrder(input: CreatePOInput) {
    if (!input.supplier_id) throw new AppError(400, 'supplier_id is required');
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new AppError(400, 'At least one order line is required');
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: input.supplier_id },
      select: { store_id: true },
    });
    if (!supplier || supplier.store_id !== input.store_id) throw new AppError(404, 'Supplier not found');

    const products = await prisma.product.findMany({
      where: { id: { in: input.items.map((i) => i.product_id) }, branch_id: input.branch_id },
      select: { id: true, tax_rate: true, item_type: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const { lineData, subtotal, taxAmount, totalAmount } = PurchaseOrderService.computeLineTotals(
      input.items,
      productMap
    );

    const resolvedPoNumber = input.po_number?.trim() || (await PurchaseOrderService.generatePoNumber(input.store_id));
    if (input.po_number?.trim()) {
      const clash = await prisma.purchaseOrder.findFirst({
        where: { store_id: input.store_id, po_number: resolvedPoNumber },
        select: { id: true },
      });
      if (clash) throw new AppError(400, `PO number "${resolvedPoNumber}" already exists`);
    }

    const created = await prisma.purchaseOrder.create({
      data: {
        id: uuidv4(),
        store_id: input.store_id,
        branch_id: input.branch_id,
        supplier_id: input.supplier_id,
        po_number: resolvedPoNumber,
        status: 'draft',
        expected_date: input.expected_date ? new Date(input.expected_date) : null,
        subtotal: new Prisma.Decimal(subtotal),
        tax_amount: new Prisma.Decimal(taxAmount),
        total_amount: new Prisma.Decimal(totalAmount),
        notes: input.notes?.trim() || null,
        created_by_user_id: input.created_by_user_id || null,
        items: { create: lineData },
      },
      include: { supplier: { select: { id: true, name: true } }, items: true },
    });

    return PurchaseOrderService.serialize(created);
  }

  /**
   * Receives goods against a PO — the core stock-in transaction. Validates store
   * + authorized branch + receivable status, honours the optional idempotency
   * hash, then (atomically) creates the receipt, increments stock, writes one
   * `purchase` movement per line, bumps the running received totals, upserts an
   * optional batch, recomputes header status, and (opt-in) spawns an AP invoice.
   */
  static async receiveGoods(input: ReceiveGoodsInput) {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new AppError(400, 'At least one received line is required');
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: input.purchase_order_id },
      include: { items: true },
    });
    if (!po || po.store_id !== input.store_id) throw new AppError(404, 'Purchase order not found');
    if (!input.authorized_branch_ids.includes(po.branch_id)) throw new AppError(403, 'Access denied');
    if (!['ordered', 'partially_received'].includes(po.status)) {
      throw new AppError(400, `Cannot receive against a PO in "${po.status}" status`);
    }

    // Idempotency: return the existing receipt on a hash collision.
    if (input.receipt_hash) {
      const existing = await prisma.goodsReceipt.findUnique({
        where: { receipt_hash: input.receipt_hash },
        include: { items: true },
      });
      if (existing) return { receipt: existing, idempotent: true };
    }

    const poItemMap = new Map(po.items.map((i: any) => [i.id, i]));

    // Validate every received line up front (before touching stock).
    const lines = input.items.map((line) => {
      const poItem = poItemMap.get(line.purchase_order_item_id) as any;
      if (!poItem) throw new AppError(400, 'Received line does not belong to this purchase order');
      const qty = Number(line.quantity_received);
      if (!(qty > 0)) throw new AppError(400, 'Received quantity must be greater than 0');
      const unitCost =
        line.unit_cost !== undefined && line.unit_cost !== null ? Number(line.unit_cost) : Number(poItem.unit_cost);
      return {
        poItem,
        qty,
        unitCost,
        batch_number: line.batch_number?.trim() || null,
        expiry_date: line.expiry_date ? new Date(line.expiry_date) : null,
      };
    });

    const receiptId = uuidv4();
    const receivedDate = input.received_date ? new Date(input.received_date) : new Date();

    const receipt = await prisma.$transaction(async (tx) => {
      const gr = await tx.goodsReceipt.create({
        data: {
          id: receiptId,
          store_id: po.store_id,
          branch_id: po.branch_id,
          purchase_order_id: po.id,
          received_date: receivedDate,
          reference: input.reference?.trim() || null,
          receipt_hash: input.receipt_hash || null,
          notes: input.notes?.trim() || null,
          received_by_user_id: input.user_id || null,
        },
      });

      for (const line of lines) {
        await tx.goodsReceiptItem.create({
          data: {
            id: uuidv4(),
            goods_receipt_id: gr.id,
            purchase_order_item_id: line.poItem.id,
            product_id: line.poItem.product_id,
            quantity_received: new Prisma.Decimal(line.qty),
            unit_cost: new Prisma.Decimal(line.unitCost),
            batch_number: line.batch_number,
            expiry_date: line.expiry_date,
          },
        });

        // Increase physical stock (create the Inventory row if somehow missing).
        await tx.inventory.upsert({
          where: { product_id: line.poItem.product_id },
          update: { quantity_on_hand: { increment: line.qty } },
          create: { product_id: line.poItem.product_id, quantity_on_hand: new Prisma.Decimal(line.qty) },
        });

        // The single new stock-in ledger row — one `purchase` movement per line.
        await tx.inventoryMovement.create({
          data: {
            store_id: po.store_id,
            branch_id: po.branch_id,
            product_id: line.poItem.product_id,
            movement_type: 'purchase',
            quantity: new Prisma.Decimal(line.qty),
            reference_id: gr.id,
            notes: 'Goods received',
            user_id: input.user_id || null,
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: line.poItem.id },
          data: { quantity_received: { increment: line.qty } },
        });

        // Optional batch/lot when both batch number and expiry are supplied.
        if (line.batch_number && line.expiry_date) {
          await tx.batchTracking.upsert({
            where: {
              product_id_batch_number: { product_id: line.poItem.product_id, batch_number: line.batch_number },
            },
            update: { quantity: { increment: line.qty } },
            create: {
              product_id: line.poItem.product_id,
              batch_number: line.batch_number,
              manufactured_date: receivedDate,
              expiry_date: line.expiry_date,
              quantity: new Prisma.Decimal(line.qty),
            },
          });
        }
      }

      // Recompute header status from the fresh line roll-ups.
      const freshItems = await tx.purchaseOrderItem.findMany({
        where: { purchase_order_id: po.id },
        select: { quantity_ordered: true, quantity_received: true },
      });
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: PurchaseOrderService.deriveStatus(freshItems) },
      });

      // Opt-in AP invoice so the payable surfaces in the Suppliers ledger.
      if (input.create_invoice) {
        const amount = round2(lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0));
        await tx.purchaseInvoice.create({
          data: {
            id: uuidv4(),
            supplier_id: po.supplier_id,
            store_id: po.store_id,
            purchase_order_id: po.id,
            invoice_number: null,
            invoice_date: receivedDate,
            amount: new Prisma.Decimal(amount),
            status: 'unpaid',
            notes: `Auto-created from goods receipt ${gr.id}`,
            recorded_by_user_id: input.user_id || null,
          },
        });
      }

      return tx.goodsReceipt.findUnique({ where: { id: gr.id }, include: { items: true } });
    });

    return { receipt, idempotent: false };
  }
}
