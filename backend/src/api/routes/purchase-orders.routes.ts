import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';
import { PurchaseOrderService } from '../../services/PurchaseOrderService';

const router = Router();

router.use(authMiddleware);

// ─── List purchase orders ─────────────────────────────────────
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const branchIds = await getAuthorizedBranchIds(req);
    const { status, supplier_id, search, limit = '100', offset = '0' } = req.query;

    const where: any = {
      store_id: user.storeId,
      branch_id: { in: branchIds },
    };
    if (status) where.status = status as string;
    if (supplier_id) where.supplier_id = supplier_id as string;
    if (search) where.po_number = { contains: search as string, mode: 'insensitive' };

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          items: { select: { id: true, quantity_ordered: true, quantity_received: true } },
        },
        orderBy: { created_at: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: orders,
      pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string), total },
    });
  })
);

// ─── Create purchase order (draft) ────────────────────────────
router.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    PurchaseOrderService.assertCanManage(user?.role);

    const branch_id = await getAuthorizedBranchId(req);
    if (!branch_id) throw new AppError(400, 'branch_id is required');

    const { supplier_id, po_number, expected_date, notes, items } = req.body;

    const created = await PurchaseOrderService.createPurchaseOrder({
      store_id: user.storeId,
      branch_id,
      supplier_id,
      po_number,
      expected_date,
      notes,
      created_by_user_id: user.id || null,
      items,
    });

    res.status(201).json({ status: 'success', data: created });
  })
);

// ─── Get one purchase order ───────────────────────────────────
router.get(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const branchIds = await getAuthorizedBranchIds(req);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true, sku: true, unit: true } } },
        },
        receipts: {
          orderBy: { created_at: 'desc' },
          include: { items: true },
        },
      },
    });
    if (!po || po.store_id !== user.storeId) throw new AppError(404, 'Purchase order not found');
    if (!branchIds.includes(po.branch_id)) throw new AppError(403, 'Access denied');

    res.json({ status: 'success', data: PurchaseOrderService.serialize(po) });
  })
);

// ─── Update / transition a purchase order ─────────────────────
router.patch(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    PurchaseOrderService.assertCanManage(user?.role);
    const branchIds = await getAuthorizedBranchIds(req);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { items: true, receipts: { select: { id: true } } },
    });
    if (!po || po.store_id !== user.storeId) throw new AppError(404, 'Purchase order not found');
    if (!branchIds.includes(po.branch_id)) throw new AppError(403, 'Access denied');

    const { status, notes, expected_date, items } = req.body;

    // ── Status transition (mutually exclusive with line edits) ──
    if (status !== undefined) {
      if (status === 'ordered') {
        if (po.status !== 'draft') throw new AppError(400, `Cannot submit a PO in "${po.status}" status`);
        if (po.items.length === 0) throw new AppError(400, 'Cannot submit a PO with no lines');
        const updated = await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { status: 'ordered', order_date: new Date() },
          include: { supplier: { select: { id: true, name: true } }, items: true },
        });
        return res.json({ status: 'success', data: PurchaseOrderService.serialize(updated) });
      }
      if (status === 'cancelled') {
        if (!['draft', 'ordered'].includes(po.status)) {
          throw new AppError(400, `Cannot cancel a PO in "${po.status}" status`);
        }
        if (po.receipts.length > 0) throw new AppError(400, 'Cannot cancel a PO that has receipts');
        const updated = await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { status: 'cancelled' },
          include: { supplier: { select: { id: true, name: true } }, items: true },
        });
        return res.json({ status: 'success', data: PurchaseOrderService.serialize(updated) });
      }
      throw new AppError(400, `Unsupported status transition to "${status}"`);
    }

    // ── Field / line edits ──
    const data: any = {};
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (expected_date !== undefined) data.expected_date = expected_date ? new Date(expected_date) : null;

    // Line quantity edits are only allowed while the PO is still a draft.
    if (items !== undefined) {
      if (po.status !== 'draft') {
        throw new AppError(400, 'Order lines can only be edited while the PO is a draft');
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new AppError(400, 'A purchase order needs at least one line');
      }

      const products = await prisma.product.findMany({
        where: { id: { in: items.map((i: any) => i.product_id) }, branch_id: po.branch_id },
        select: { id: true, tax_rate: true, item_type: true, name: true },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const { lineData, subtotal, taxAmount, totalAmount } = PurchaseOrderService.computeLineTotals(
        items,
        productMap
      );
      data.subtotal = new Prisma.Decimal(subtotal);
      data.tax_amount = new Prisma.Decimal(taxAmount);
      data.total_amount = new Prisma.Decimal(totalAmount);

      // Replace the draft's lines atomically.
      const updated = await prisma.$transaction(async (tx) => {
        await tx.purchaseOrderItem.deleteMany({ where: { purchase_order_id: po.id } });
        return tx.purchaseOrder.update({
          where: { id: po.id },
          data: { ...data, items: { create: lineData } },
          include: { supplier: { select: { id: true, name: true } }, items: true },
        });
      });
      return res.json({ status: 'success', data: PurchaseOrderService.serialize(updated) });
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data,
      include: { supplier: { select: { id: true, name: true } }, items: true },
    });
    res.json({ status: 'success', data: PurchaseOrderService.serialize(updated) });
  })
);

// ─── Delete a draft purchase order ────────────────────────────
router.delete(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    PurchaseOrderService.assertCanManage(user?.role);
    const branchIds = await getAuthorizedBranchIds(req);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      select: { id: true, store_id: true, branch_id: true, status: true },
    });
    if (!po || po.store_id !== user.storeId) throw new AppError(404, 'Purchase order not found');
    if (!branchIds.includes(po.branch_id)) throw new AppError(403, 'Access denied');
    if (po.status !== 'draft') throw new AppError(400, 'Only draft purchase orders can be deleted');

    await prisma.purchaseOrder.delete({ where: { id: po.id } });
    res.json({ status: 'success', message: 'Purchase order deleted' });
  })
);

// ─── Receive goods against a PO (the core stock-in transaction) ─
router.post(
  '/:id/receipts',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    PurchaseOrderService.assertCanManage(user?.role);
    const branchIds = await getAuthorizedBranchIds(req);

    const { received_date, reference, receipt_hash, create_invoice, notes, items } = req.body;

    const { receipt, idempotent } = await PurchaseOrderService.receiveGoods({
      purchase_order_id: req.params.id,
      store_id: user.storeId,
      authorized_branch_ids: branchIds,
      received_date,
      reference,
      receipt_hash,
      create_invoice,
      notes,
      user_id: user.id || null,
      items,
    });

    res.status(idempotent ? 200 : 201).json({ status: 'success', data: receipt });
  })
);

// ─── Receipt history for a PO ─────────────────────────────────
router.get(
  '/:id/receipts',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const branchIds = await getAuthorizedBranchIds(req);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      select: { id: true, store_id: true, branch_id: true },
    });
    if (!po || po.store_id !== user.storeId) throw new AppError(404, 'Purchase order not found');
    if (!branchIds.includes(po.branch_id)) throw new AppError(403, 'Access denied');

    const receipts = await prisma.goodsReceipt.findMany({
      where: { purchase_order_id: po.id },
      orderBy: { created_at: 'desc' },
      include: { items: true },
    });

    res.json({ status: 'success', data: receipts });
  })
);

export default router;
