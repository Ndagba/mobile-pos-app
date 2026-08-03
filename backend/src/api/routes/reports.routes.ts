import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();
router.use(authMiddleware);

// EOD Summary Report
router.get('/eod', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const storeId = user.storeId;
  const branchIds = await getAuthorizedBranchIds(req);
  let startOfDay: Date;
  let endOfDay: Date;

  if (req.query.dateFrom && req.query.dateTo) {
    startOfDay = new Date(req.query.dateFrom as string);
    startOfDay.setHours(0, 0, 0, 0);
    endOfDay = new Date(req.query.dateTo as string);
    endOfDay.setHours(23, 59, 59, 999);
  } else {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
  }

  // Fetch payments using Prisma query builder
  const paymentsRaw = await prisma.transaction.groupBy({
    by: ['payment_method'],
    where: {
      status: 'completed',
      created_at: {
        gte: startOfDay,
        lte: endOfDay
      },
      store_id: storeId,
      branch_id: { in: branchIds }
    },
    _count: {
      id: true
    },
    _sum: {
      total_amount: true
    }
  });

  const paymentsMap: Record<string, { method: string; count: number; total: number }> = {};
  for (const p of paymentsRaw) {
    const method = p.payment_method === 'mobile_wallet' ? 'transfer' : p.payment_method;
    const count = p._count.id;
    const total = p._sum.total_amount ? Number(p._sum.total_amount) : 0;

    if (paymentsMap[method]) {
      paymentsMap[method].count += count;
      paymentsMap[method].total += total;
    } else {
      paymentsMap[method] = { method, count, total };
    }
  }
  const payments = Object.values(paymentsMap);

  // Fetch voids using Prisma aggregate
  const voidsRaw = await prisma.transaction.aggregate({
    where: {
      status: 'voided',
      created_at: {
        gte: startOfDay,
        lte: endOfDay
      },
      store_id: storeId,
      branch_id: { in: branchIds }
    },
    _count: {
      id: true
    },
    _sum: {
      total_amount: true
    }
  });

  const voids = {
    count: voidsRaw._count.id,
    total: voidsRaw._sum.total_amount ? Number(voidsRaw._sum.total_amount) : 0
  };

  res.json({
    status: 'success',
    data: {
      date: startOfDay,
      payments,
      voids
    }
  });
}));

// Void & Refund Report
router.get('/voids', catchAsync(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const storeId = user.storeId;
  const branchIds = await getAuthorizedBranchIds(req);
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : new Date();
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : new Date();
  
  if (!req.query.dateFrom) dateFrom.setDate(dateFrom.getDate() - 30);

  const where: any = {
    store_id: storeId,
    status: { in: ['voided', 'refunded'] },
    created_at: { gte: dateFrom, lte: dateTo },
    branch_id: { in: branchIds }
  };

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      user: { select: { first_name: true, last_name: true } },
      voided_by_user: { select: { first_name: true, last_name: true } }
    },
    orderBy: { created_at: 'desc' }
  });

  res.json({
    status: 'success',
    data: transactions.map(t => ({
      ...t,
      total_amount: Number(t.total_amount)
    }))
  });
}));

export default router;
