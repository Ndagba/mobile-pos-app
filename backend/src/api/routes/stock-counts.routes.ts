import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { AuditService } from '../../services/AuditService';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();

router.use(authMiddleware);

// Create a stock count
router.post('/', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { notes } = req.body;
  const branch_id = await getAuthorizedBranchId(req);
  if (!branch_id) throw new AppError(400, 'branch_id is required');

  const count = await prisma.stockCount.create({
    data: {
      store_id: user.storeId,
      branch_id,
      started_by_user_id: user.id,
      notes
    }
  });

  // Pre-populate StockCountItem with all active products in this branch
  const products = await prisma.product.findMany({
    where: { branch_id, is_active: true }
  });

  if (products.length > 0) {
    const itemsData = await Promise.all(products.map(async p => {
      const inv = await prisma.inventory.findUnique({
        where: { product_id: p.id }
      });
      return {
        stock_count_id: count.id,
        product_id: p.id,
        system_quantity: inv ? inv.quantity_on_hand : BigInt(0),
        physical_quantity: null,
        variance: null
      };
    }));

    await prisma.stockCountItem.createMany({
      data: itemsData
    });
  }

  await AuditService.log(user.id, 'START_STOCK_COUNT', 'StockCount', count.id, { branch_id }, req);

  res.status(201).json({ status: 'success', data: count });
}));

// List stock counts
router.get('/', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const storeId = user.storeId;
  const branchIds = await getAuthorizedBranchIds(req);

  const counts = await prisma.stockCount.findMany({
    where: {
      store_id: storeId,
      branch_id: { in: branchIds }
    },
    include: {
      started_by: { select: { first_name: true, last_name: true } },
      completed_by: { select: { first_name: true, last_name: true } },
      branch: { select: { name: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  res.json({ status: 'success', data: counts });
}));

// Get specific stock count details
router.get('/:id', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const count = await prisma.stockCount.findUnique({
    where: { id: req.params.id },
    include: {
      started_by: { select: { first_name: true, last_name: true } },
      completed_by: { select: { first_name: true, last_name: true } },
      branch: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true, sku: true, barcode: true, category: { select: { name: true } } } }
        }
      }
    }
  });

  if (!count) throw new AppError(404, 'Stock count not found');

  // Convert BigInts
  const data = {
    ...count,
    items: count.items.map(i => ({
      ...i,
      system_quantity: Number(i.system_quantity),
      physical_quantity: i.physical_quantity != null ? Number(i.physical_quantity) : null,
      variance: i.variance != null ? Number(i.variance) : null
    }))
  };

  res.json({ status: 'success', data });
}));

// Update items (upsert)
router.patch('/:id/items', catchAsync(async (req: Request, res: Response) => {
  const { items } = req.body; // Array of { product_id, physical_quantity, notes }
  if (!Array.isArray(items)) throw new AppError(400, 'items must be an array');

  const countId = req.params.id;

  const results = await Promise.all(items.map(async item => {
    // Get current system quantity
    const inventory = await prisma.inventory.findUnique({ where: { product_id: item.product_id } });
    const systemQty = inventory ? inventory.quantity_on_hand : BigInt(0);

    const variance = item.physical_quantity !== undefined && item.physical_quantity !== null
      ? BigInt(item.physical_quantity) - systemQty
      : null;

    // Check if item exists
    const existing = await prisma.stockCountItem.findFirst({
      where: { stock_count_id: countId, product_id: item.product_id }
    });

    if (existing) {
      return prisma.stockCountItem.update({
        where: { id: existing.id },
        data: {
          physical_quantity: item.physical_quantity !== undefined ? BigInt(item.physical_quantity) : null,
          variance,
          notes: item.notes
        }
      });
    } else {
      return prisma.stockCountItem.create({
        data: {
          stock_count_id: countId,
          product_id: item.product_id,
          system_quantity: systemQty,
          physical_quantity: item.physical_quantity !== undefined ? BigInt(item.physical_quantity) : null,
          variance,
          notes: item.notes
        }
      });
    }
  }));

  const mapped = results.map(r => ({
    ...r,
    system_quantity: Number(r.system_quantity),
    physical_quantity: r.physical_quantity != null ? Number(r.physical_quantity) : null,
    variance: r.variance != null ? Number(r.variance) : null
  }));

  res.json({ status: 'success', data: mapped });
}));

// Accept / Complete count
router.post('/:id/accept', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const countId = req.params.id;

  const count = await prisma.stockCount.findUnique({
    where: { id: countId },
    include: { items: true }
  });

  if (!count) throw new AppError(404, 'Stock count not found');
  if (count.status === 'completed') throw new AppError(400, 'Stock count already completed');

  for (const item of count.items) {
    if (item.physical_quantity != null) {
      const variance = item.physical_quantity - item.system_quantity;
      if (variance !== BigInt(0)) {
        await prisma.inventory.update({
          where: { product_id: item.product_id },
          data: { quantity_on_hand: item.physical_quantity }
        });
        
        await prisma.inventoryMovement.create({
          data: {
            store_id: count.store_id,
            branch_id: count.branch_id,
            product_id: item.product_id,
            movement_type: 'adjustment',
            quantity: variance,
            reference_id: count.id,
            notes: 'Stock count reconciliation',
            user_id: user.id
          }
        });
      }
    }
  }

  const updatedCount = await prisma.stockCount.update({
    where: { id: countId },
    data: {
      status: 'completed',
      completed_at: new Date(),
      completed_by_user_id: user.id
    }
  });

  await AuditService.log(user.id, 'COMPLETE_STOCK_COUNT', 'StockCount', count.id, { items: count.items.length }, req);

  res.json({ status: 'success', data: updatedCount });
}));

export default router;
