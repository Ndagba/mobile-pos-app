import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Get sync status for device
router.get(
  '/status/:deviceId',
  catchAsync(async (req: Request, res: Response) => {
    const { deviceId } = req.params;

    const syncQueue = await prisma.offlineSyncQueue.findMany({
      where: { device_id: deviceId }
    });

    const stats = {
      total: syncQueue.length,
      pending: syncQueue.filter((item) => item.status === 'pending').length,
      syncing: syncQueue.filter((item) => item.status === 'syncing').length,
      synced: syncQueue.filter((item) => item.status === 'synced').length,
      failed: syncQueue.filter((item) => item.status === 'failed').length,
      conflicts: syncQueue.filter((item) => item.status === 'conflict').length
    };

    res.json({
      status: 'success',
      data: {
        device_id: deviceId,
        sync_stats: stats,
        last_sync: syncQueue[0]?.synced_at || null,
        queue: syncQueue.map((item) => ({
          id: item.id,
          transaction_id: item.transaction_id,
          status: item.status,
          created_at: item.created_at
        }))
      }
    });
  })
);

// Retry failed sync
router.post(
  '/retry/:queueId',
  catchAsync(async (req: Request, res: Response) => {
    const queueItem = await prisma.offlineSyncQueue.findUnique({
      where: { id: req.params.queueId }
    });

    if (!queueItem) {
      throw new AppError(404, 'Queue item not found');
    }

    const updated = await prisma.offlineSyncQueue.update({
      where: { id: req.params.queueId },
      data: {
        status: 'pending',
        attempt_count: 0,
        last_error: null
      }
    });

    res.json({
      status: 'success',
      data: updated
    });
  })
);

// Get full sync queue
router.get(
  '/queue',
  catchAsync(async (req: Request, res: Response) => {
    const { limit = '100', offset = '0', status: filterStatus } = req.query;

    const where: any = {};

    if (filterStatus) {
      where.status = filterStatus;
    }

    const [queue, total] = await Promise.all([
      prisma.offlineSyncQueue.findMany({
        where,
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        orderBy: { created_at: 'asc' }
      }),
      prisma.offlineSyncQueue.count({ where })
    ]);

    res.json({
      status: 'success',
      data: queue,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total
      }
    });
  })
);

// Get offline transactions (not yet synced)
router.get(
  '/offline-transactions',
  catchAsync(async (req: Request, res: Response) => {
    const offlineTransactions = await prisma.transaction.findMany({
      where: { is_sync_online: false },
      include: { transaction_items: true },
      orderBy: { created_at: 'asc' }
    });

    res.json({
      status: 'success',
      data: offlineTransactions,
      count: offlineTransactions.length
    });
  })
);

export default router;
