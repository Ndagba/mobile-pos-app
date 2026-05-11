import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// Dashboard metrics
router.get(
  '/dashboard',
  catchAsync(async (req: Request, res: Response) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const storeId = (req as any).user.storeId;

    const [totalTransactions, totalRevenue, totalItems, topProducts] = await Promise.all([
      prisma.transaction.count({
        where: {
          store_id: storeId,
          created_at: { gte: today },
          status: 'completed'
        }
      }),
      prisma.transaction.aggregate({
        where: {
          store_id: storeId,
          created_at: { gte: today },
          status: 'completed'
        },
        _sum: { total_amount: true }
      }),
      prisma.transactionItem.aggregate({
        where: {
          transaction: {
            store_id: storeId,
            created_at: { gte: today },
            status: 'completed'
          }
        },
        _sum: { quantity: true }
      }),
      prisma.transactionItem.groupBy({
        by: ['product_id'],
        where: {
          transaction: {
            store_id: storeId,
            created_at: { gte: today },
            status: 'completed'
          }
        },
        _sum: { line_total: true },
        _count: { id: true },
        orderBy: { _sum: { line_total: 'desc' } },
        take: 10
      })
    ]);

    res.json({
      status: 'success',
      data: {
        total_transactions: totalTransactions,
        total_revenue: totalRevenue._sum.total_amount || 0,
        total_items_sold: totalItems._sum.quantity || 0,
        top_products: topProducts
      }
    });
  })
);

// Sales report
router.get(
  '/sales',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo, granularity = 'daily' } = req.query;

    if (!dateFrom || !dateTo) {
      throw new AppError(400, 'dateFrom and dateTo are required');
    }

    const storeId = (req as any).user.storeId;

    const transactions = await prisma.transaction.findMany({
      where: {
        store_id: storeId,
        created_at: {
          gte: new Date(dateFrom as string),
          lte: new Date(dateTo as string)
        },
        status: 'completed'
      },
      include: { transaction_items: true }
    });

    // Group by date
    const grouped: any = {};
    transactions.forEach((tx) => {
      const date = tx.created_at.toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = {
          date,
          transactions: 0,
          revenue: 0,
          items_sold: 0
        };
      }
      grouped[date].transactions++;
      grouped[date].revenue += tx.total_amount;
      grouped[date].items_sold += tx.transaction_items.reduce((sum, item) => sum + item.quantity, 0);
    });

    res.json({
      status: 'success',
      data: Object.values(grouped)
    });
  })
);

// Top products
router.get(
  '/top-products',
  catchAsync(async (req: Request, res: Response) => {
    const { period = 'daily', limit = '10' } = req.query;
    const storeId = (req as any).user.storeId;

    let dateFrom = new Date();
    switch (period) {
      case 'weekly':
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case 'monthly':
        dateFrom.setMonth(dateFrom.getMonth() - 1);
        break;
      default:
        dateFrom.setDate(dateFrom.getDate() - 1);
    }

    const topProducts = await prisma.transactionItem.groupBy({
      by: ['product_id'],
      where: {
        transaction: {
          store_id: storeId,
          created_at: { gte: dateFrom },
          status: 'completed'
        }
      },
      _sum: { quantity: true, line_total: true },
      _count: { id: true },
      orderBy: { _sum: { line_total: 'desc' } },
      take: parseInt(limit as string)
    });

    res.json({
      status: 'success',
      data: topProducts,
      period
    });
  })
);

// Employee performance
router.get(
  '/employee-performance',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const storeId = (req as any).user.storeId;

    const where: any = { store_id: storeId };

    if (dateFrom && dateTo) {
      where.created_at = {
        gte: new Date(dateFrom as string),
        lte: new Date(dateTo as string)
      };
    }

    const performance = await prisma.transaction.groupBy({
      by: ['user_id'],
      where,
      _count: { id: true },
      _sum: { total_amount: true },
      orderBy: { _sum: { total_amount: 'desc' } }
    });

    res.json({
      status: 'success',
      data: performance
    });
  })
);

export default router;
