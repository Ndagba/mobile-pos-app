import { Router, Request, Response } from 'express';
import { TransactionService } from '../../services/TransactionService';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

router.use(authMiddleware);

// Create transaction
router.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const { items, ...transactionData } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'Transaction must have at least one item');
    }

    const transaction = await TransactionService.createTransaction({
      ...transactionData,
      user_id: (req as any).user.userId,
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
  catchAsync(async (req: Request, res: Response) => {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      throw new AppError(400, 'Invalid transaction batch format');
    }

    const result = await TransactionService.batchSyncTransactions(
      transactions.map((tx: any) => ({
        ...tx,
        user_id: (req as any).user.userId
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
    const { limit = '50', offset = '0', dateFrom, dateTo, paymentMethod, status } = req.query;

    const result = await TransactionService.getStoreTransactions(
      (req as any).user.storeId,
      parseInt(limit as string),
      parseInt(offset as string),
      {
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        paymentMethod: paymentMethod as string,
        status: status as string
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
