import { Router, Request, Response } from 'express';
import { InventoryService } from '../../services/InventoryService';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

router.use(authMiddleware);

// Get inventory status
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const inventory = await InventoryService.getInventoryStatus((req as any).user.storeId);

    res.json({
      status: 'success',
      data: inventory
    });
  })
);

// Get low stock alerts
router.get(
  '/low-stock',
  catchAsync(async (req: Request, res: Response) => {
    const alerts = await InventoryService.getLowStockAlerts((req as any).user.storeId);

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

// Update stock
router.patch(
  '/:productId',
  catchAsync(async (req: Request, res: Response) => {
    const { quantity, reason } = req.body;

    if (quantity === undefined) {
      throw new AppError(400, 'quantity is required');
    }

    if (!reason) {
      throw new AppError(400, 'reason is required (e.g., "restock", "adjustment", "loss")');
    }

    const result = await InventoryService.updateStock(req.params.productId, quantity, reason);

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

export default router;
