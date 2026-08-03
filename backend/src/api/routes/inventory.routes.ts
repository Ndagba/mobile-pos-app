import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { InventoryService } from '../../services/InventoryService';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();

router.use(authMiddleware);

// Get inventory status
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { cursor, limit = '30' } = req.query;
    const result = await InventoryService.getInventoryStatus(
      (req as any).user.storeId,
      cursor as string | undefined,
      parseInt(limit as string, 10)
    );

    res.json({
      status: 'success',
      data: result.items,
      nextCursor: result.nextCursor
    });
  })
);

// Get low stock alerts.
//   • Admin: an explicit ?branch_id scopes to that branch; without it the admin
//     sees the whole store ("All Branches"). The admin's own JWT branch must NOT
//     scope the result, otherwise the branch chips have no effect.
//   • Manager / cashier: always scoped to their JWT branch.
router.get(
  '/low-stock',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const branchIds = await getAuthorizedBranchIds(req);
    const alerts = await InventoryService.getLowStockAlerts(user.storeId, branchIds);

    res.json({
      status: 'success',
      data: alerts,
      count: alerts.length
    });
  })
);

// Get expiring batches
router.get(
  '/expiring',
  catchAsync(async (req: Request, res: Response) => {
    const { days = '7' } = req.query;

    const batches = await InventoryService.getExpiringBatches(parseInt(days as string));

    res.json({
      status: 'success',
      data: batches,
      count: batches.length
    });
  })
);

// ─── Bulk-update low-stock threshold for all products in the store ───
router.patch(
  '/threshold/store',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;

    if (!['admin', 'manager'].includes(user?.role)) {
      throw new AppError(403, 'Admin or manager access required');
    }

    const { threshold } = req.body;
    const parsed = Number(threshold);
    if (threshold === undefined || isNaN(parsed) || parsed < 0) {
      throw new AppError(400, 'threshold must be a non-negative number');
    }

    const thresholdBigInt = BigInt(Math.round(parsed));

    // Scope update to products owned by this store only.
    // Products are linked to branches; branches carry the store_id.
    // Raw SQL is the cleanest way to do a filtered updateMany via a join.
    const storeId: string | null = user?.storeId ?? null;

    let updatedCount = 0;
    if (storeId) {
      const result: any = await prisma.$executeRaw`
        UPDATE "Inventory"
        SET    low_stock_threshold = ${thresholdBigInt}
        WHERE  product_id IN (
          SELECT p.id
          FROM   "Product" p
          JOIN   "Branch"  b ON p.branch_id = b.id
          WHERE  b.store_id = ${storeId}
        )
      `;
      updatedCount = Number(result);
    } else {
      // Super-admin / no store context — update everything
      const result = await prisma.inventory.updateMany({
        where: {},
        data: { low_stock_threshold: thresholdBigInt },
      });
      updatedCount = result.count;
    }

    // Invalidate the cached inventory list for this store so the new
    // threshold (and any status recalculated from it) shows up immediately
    // instead of waiting out the cache TTL.
    if (storeId) {
      try {
        await redis.del(`inventory:${storeId}:first:30`);
      } catch (error) {
        // Non-fatal — the cache will still expire on its own TTL.
      }
    }

    res.json({
      status: 'success',
      message: `Low-stock threshold updated to ${parsed} for ${updatedCount} product(s)`,
      updated_count: updatedCount,
    });
  })
);

// Update stock and/or per-product low-stock threshold.
// Both fields are optional but at least one must be supplied.
//   quantity + reason  → adjust stock quantity (delta, may be negative)
//   low_stock_threshold → change the alert threshold for this product only
// Both can be sent together in a single request.
router.patch(
  '/:productId',
  catchAsync(async (req: Request, res: Response) => {
    const { quantity, reason, low_stock_threshold } = req.body;

    if (quantity === undefined && low_stock_threshold === undefined) {
      throw new AppError(400, 'quantity or low_stock_threshold is required');
    }

    if (quantity !== undefined && !reason) {
      throw new AppError(400, 'reason is required when adjusting quantity (e.g., "restock", "adjustment", "loss")');
    }

    let result: any = {};

    if (quantity !== undefined) {
      result = await InventoryService.updateStock(req.params.productId, quantity, reason);
    }

    if (low_stock_threshold !== undefined) {
      const parsed = Number(low_stock_threshold);
      if (isNaN(parsed) || parsed < 0) {
        throw new AppError(400, 'low_stock_threshold must be a non-negative number');
      }
      result = await InventoryService.updateThreshold(req.params.productId, Math.round(parsed));
    }

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Create batch
router.post(
  '/batches',
  catchAsync(async (req: Request, res: Response) => {
    const { product_id, batch_number, manufactured_date, expiry_date, quantity, warehouse_location } =
      req.body;

    if (!product_id || !batch_number || !manufactured_date || !expiry_date || !quantity) {
      throw new AppError(400, 'Missing required batch fields');
    }

    const batch = await InventoryService.createBatch(
      product_id,
      batch_number,
      new Date(manufactured_date),
      new Date(expiry_date),
      quantity,
      warehouse_location
    );

    res.status(201).json({
      status: 'success',
      data: batch
    });
  })
);

// Mark batch expired
router.post(
  '/batches/:batchId/expire',
  catchAsync(async (req: Request, res: Response) => {
    const result = await InventoryService.markBatchExpired(req.params.batchId);

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Get inventory turnover
router.get(
  '/turnover',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;

    if (!dateFrom || !dateTo) {
      throw new AppError(400, 'dateFrom and dateTo are required');
    }

    const result = await InventoryService.getInventoryTurnover(
      (req as any).user.storeId,
      new Date(dateFrom as string),
      new Date(dateTo as string)
    );

    res.json({
      status: 'success',
      data: result
    });
  })
);
// Get inventory movements (ledger)
router.get(
  '/movements',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { product_id, branch_id, dateFrom, dateTo, type, limit = '50', offset = '0' } = req.query;

    const where: any = { store_id: user.storeId };
    
    if (product_id) where.product_id = product_id as string;
    const branchIds = await getAuthorizedBranchIds(req);
    where.branch_id = { in: branchIds };
    
    if (type) where.movement_type = type as string;

    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) where.timestamp.gte = new Date(dateFrom as string);
      if (dateTo) where.timestamp.lte = new Date(dateTo as string);
    }

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          product: { select: { name: true, sku: true } },
          user: { select: { first_name: true, last_name: true } }
        },
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit as string, 10),
        skip: parseInt(offset as string, 10)
      }),
      prisma.inventoryMovement.count({ where })
    ]);

    res.json({
      status: 'success',
      data: movements.map(m => ({
        ...m,
        quantity: Number(m.quantity)
      })),
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10)
      }
    });
  })
);

export default router;