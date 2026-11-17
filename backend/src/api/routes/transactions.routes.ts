import { Router, Request, Response } from 'express';
import { TransactionService } from '../../services/TransactionService';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireActiveSubscription } from '../middleware/featureGate.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { prisma } from '../../lib/prisma';
import {
  canAccessTransaction,
  canVoidTransaction,
  isSameStore,
  scopedListUserId
} from '../../utils/transactionAccess';

const router = Router();

/**
 * Load the minimal ownership fields of a sale and 404 if the caller may not see it
 * (wrong store, or a cashier asking for someone else's sale). Phase 0 / risk R2.
 */
async function loadAccessibleTransaction(
  req: Request,
  check: typeof canAccessTransaction = canAccessTransaction
) {
  const user = (req as any).user;
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    select: { id: true, store_id: true, user_id: true }
  });
  if (!tx || !check(user, tx)) {
    throw new AppError(404, 'Transaction not found');
  }
  return tx;
}

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
    const user = (req as any).user;

    const result = await TransactionService.getStoreTransactions(
      user.storeId,
      parseInt(limit as string),
      parseInt(offset as string),
      {
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        paymentMethod: paymentMethod as string,
        status: status as string,
        branchId: branchId && branchId !== 'null' && branchId !== 'undefined' ? branchId as string : undefined,
        // Cashiers only ever see their own sales (risk R1, decision D1).
        userId: scopedListUserId(user, req.query.userId ? (req.query.userId as string) : undefined),
        search: req.query.search ? (req.query.search as string) : undefined,
        includeItems: req.query.includeItems === 'true',
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
    await loadAccessibleTransaction(req);
    const transaction = await TransactionService.getTransactionById(req.params.id);

    res.json({
      status: 'success',
      data: transaction
    });
  })
);

// Refund transaction (admin/manager, or cashier when allow_cashier_refund is on)
router.post(
  '/:id/refund',
  catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body;
    const user = (req as any).user;

    // Admins and managers may always refund; a cashier may refund only when the
    // store setting `allow_cashier_refund` is enabled.
    if (user.role !== 'admin' && user.role !== 'manager') {
      const setting = await prisma.storeSetting.findUnique({
        where: { store_id: user.storeId }
      });
      if (!setting?.allow_cashier_refund) {
        throw new AppError(403, 'You are not allowed to process refunds');
      }
    }

    // Tenant check (risk R2). A permitted cashier may still refund a colleague's sale
    // in the same store, exactly as before.
    await loadAccessibleTransaction(req, isSameStore);

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

// Void transaction (admin / manager only — risk R3, decision D1)
router.post(
  '/:id/void',
  catchAsync(async (req: Request, res: Response) => {
    const { voidReason } = req.body;
    const user = (req as any).user;

    if (!canVoidTransaction(user)) {
      throw new AppError(403, 'Only managers and admins can void transactions');
    }

    if (!voidReason) {
      throw new AppError(400, 'Void reason is required');
    }

    await loadAccessibleTransaction(req);

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
