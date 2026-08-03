import { Router, Request, Response } from 'express';
import { TransactionService } from '../../services/TransactionService';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/featureGate.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

router.use(authMiddleware);

// Create transaction
router.post(
  '/',
  requireActiveSubscription,
  catchAsync(async (req: Request, res: Response) => {
    const { items, ...transactionData } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'Transaction must have at least one item');
    }

    const user = (req as any).user;
    const transaction = await TransactionService.createTransaction({
      ...transactionData,
      user_id: user.userId,
      // Carry branch from JWT; fall back to body value for offline-synced transactions
      branch_id: user.branchId ?? transactionData.branch_id,
      store_id: transactionData.store_id ?? user.storeId,
      items
    });

    res.status(201).json({
      status: 'success',
      data: transaction
    });
  })
);

// Batch sync offline transactions
router.post(
  '/batch',
  requireActiveSubscription,
  catchAsync(async (req: Request, res: Response) => {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      throw new AppError(400, 'Invalid transaction batch format');
    }

    const user = (req as any).user;
    const result = await TransactionService.batchSyncTransactions(
      transactions.map((tx: any) => ({
        ...tx,
        user_id: user.userId,
        // Trust the JWT for branch/store — offline-synced payloads may omit them
        branch_id: user.branchId ?? tx.branch_id,
        store_id: tx.store_id ?? user.storeId
      }))
    );

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Get transactions
router.get(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { limit = '50', offset = '0', dateFrom, dateTo, paymentMethod, status, branchId } = req.query;

    const result = await TransactionService.getStoreTransactions(
      (req as any).user.storeId,
      parseInt(limit as string),
      parseInt(offset as string),
      {
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        paymentMethod: paymentMethod as string,
        status: status as string,
        branchId: branchId && branchId !== 'null' && branchId !== 'undefined' ? branchId as string : undefined
      }
    );

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Get single transaction
router.get(
  '/:id',
  catchAsync(async (req: Request, res: Response) => {
    const transaction = await TransactionService.getTransactionById(req.params.id);

    res.json({
      status: 'success',
      data: transaction
    });
  })
);

// Refund transaction (admin-only)
router.post(
  '/:id/refund',
  catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body;
    const user = (req as any).user;

    if (user.role !== 'admin') {
      throw new AppError(403, 'Only admins can process refunds');
    }

    const result = await TransactionService.refundTransaction(
      req.params.id,
      reason || 'Customer request',
      user.userId
    );

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Void transaction
router.post(
  '/:id/void',
  catchAsync(async (req: Request, res: Response) => {
    const { voidReason } = req.body;

    if (!voidReason) {
      throw new AppError(400, 'Void reason is required');
    }

    const result = await TransactionService.voidTransaction(
      req.params.id,
      voidReason,
      (req as any).user.userId
    );

    res.json({
      status: 'success',
      data: result
    });
  })
);

export default router;
