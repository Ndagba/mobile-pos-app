import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';
import { getAuthorizedBranchId, getAuthorizedBranchIds } from '../../utils/branchHelper';

const router = Router();

router.use(authMiddleware);

const branchWhere = (branchIds: string[], storeId: string | null): Record<string, any> => {
  return {
    store_id: storeId || undefined,
    branch_id: { in: branchIds }
  };
};

// ─── Dashboard ────────────────────────────────────────────────
router.get(
  '/dashboard',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;
    const role: string = user?.role ?? '';

    // Determine effective branch IDs
    const branchIds = await getAuthorizedBranchIds(req);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    // Build where clauses
    const locationFilter = branchWhere(branchIds, storeId);

    const todayWhere: any = { status: 'completed', created_at: { gte: todayStart }, ...locationFilter };
    const weekWhere: any  = { status: 'completed', created_at: { gte: weekStart }, ...locationFilter };

    // ── Each query gets its own .catch() so one failure never kills the whole endpoint
    const [
      transactionCount,
      revenueAgg,
      itemsAgg,
      weekRevenueAgg,
      paymentBreakdown,
      productCount,
      lowStockCount,
    ] = await Promise.all([
      prisma.transaction.count({ where: todayWhere })
        .catch(() => 0),

      // Revenue from transaction items (not transaction total, for consistency)
      prisma.$queryRaw<[{ revenue: number }]>`
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.branch_id = ANY(${branchIds})
      `
        .then(rows => ({ _sum: { total_amount: rows[0]?.revenue ?? 0 } }))
        .catch(() => ({ _sum: { total_amount: null } })),

      prisma.transactionItem.aggregate({ where: { transaction: todayWhere }, _sum: { quantity: true } })
        .catch(() => ({ _sum: { quantity: null } })),

      // Weekly revenue from transaction items
      prisma.$queryRaw<[{ revenue: number }]>`
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${weekStart}
          AND t.branch_id = ANY(${branchIds})
      `
        .then(rows => ({ _sum: { total_amount: rows[0]?.revenue ?? 0 } }))
        .catch(() => ({ _sum: { total_amount: null } })),

      // Payment breakdown by method (using line_total from items)
      prisma.$queryRaw<[{ payment_method: string, count: bigint, revenue: number }]>`
        SELECT
          t.payment_method,
          COUNT(DISTINCT t.id) AS count,
          COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.branch_id = ANY(${branchIds})
        GROUP BY t.payment_method
        ORDER BY revenue DESC
      `
        .then(rows => rows.map(r => ({ payment_method: r.payment_method, _count: { id: Number(r.count) }, _sum: { total_amount: r.revenue } })))
        .catch(() => [] as any[]),

      // Product count — scoped to authorized branches
      prisma.product.count({
        where: {
          is_active: true,
          branch_id: { in: branchIds }
        }
      }).catch(() => 0),

      // Low-stock count — scoped to authorized branches
      prisma.$queryRaw<[{ count: number }]>`
        SELECT CAST(COUNT(*) AS INT) AS count
        FROM "Inventory" i
        JOIN "Product" p ON i.product_id = p.id
        WHERE i.quantity_on_hand <= i.low_stock_threshold
          AND p.is_active = true
          AND p.branch_id = ANY(${branchIds})
      `
        .then(rows => (rows as any)[0]?.count ?? 0).catch(() => 0),
    ]);

    // ── Recent transactions
    const recentTransactions: any[] = await prisma.transaction.findMany({
      where: locationFilter,
      include: {
        user: { select: { first_name: true } },
        _count: { select: { transaction_items: true } }
      },
      orderBy: { created_at: 'desc' },
      take: 8
    }).catch(() => []);

    // ── Top products — raw SQL with branch/store filtering
    let topProducts: any[] = [];
    try {
      topProducts = await prisma.$queryRaw`
        SELECT
          p.id,
          p.name,
          p.sku,
          CAST(SUM(ti.quantity) AS INT)               AS total_sold,
          CAST(SUM(ti."line_total") AS FLOAT)         AS total_revenue
        FROM "TransactionItem" ti
        JOIN "Product"      p  ON ti."product_id"     = p.id
        JOIN "Transaction"  t  ON ti."transaction_id" = t.id
        WHERE t."created_at" >= ${todayStart}
          AND t.status = 'completed'
          AND t.branch_id = ANY(${branchIds})
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_revenue DESC
        LIMIT 5
      `;
    } catch (err: any) {
      console.error('[dashboard] top_products query failed:', err?.message ?? err);
    }

    // ── Profit calculation via raw SQL
    let totalCost = 0;
    try {
      const costRows = await prisma.$queryRaw<[{ total_cost: number }]>`
        SELECT COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0) AS total_cost
        FROM "TransactionItem" ti
        JOIN "Product" p ON p.id = ti.product_id
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.branch_id = ANY(${branchIds})
      `;
      totalCost = Number(costRows[0]?.total_cost ?? 0);
    } catch (err: any) {
      console.error('[dashboard] profit query failed:', err?.message ?? err);
    }

    const totalRevenue   = Number(revenueAgg._sum.total_amount ?? 0);
    const weekRevenue    = Number(weekRevenueAgg._sum.total_amount ?? 0);
    const totalItems     = Number(itemsAgg._sum.quantity ?? 0);
    const avgTransaction = transactionCount > 0
      ? +(totalRevenue / transactionCount).toFixed(2)
      : 0;
    const totalProfit   = +(totalRevenue - totalCost).toFixed(2);
    const profitMargin  = totalRevenue > 0
      ? +((totalProfit / totalRevenue) * 100).toFixed(2)
      : 0;

    res.json({
      status: 'success',
      data: {
        transaction_count:  transactionCount,
        total_revenue:      totalRevenue,
        avg_transaction:    avgTransaction,
        total_items_sold:   totalItems,
        weekly_revenue:     weekRevenue,
        product_count:      productCount,
        low_stock_count:    lowStockCount,
        total_profit:       totalProfit,
        profit_margin:      profitMargin,
        payment_breakdown: (paymentBreakdown as any[]).map(p => ({
          method: p.payment_method,
          count:  p._count.id,
          total:  Number(p._sum.total_amount ?? 0)
        })),
        top_products: topProducts.map(p => ({
          id:            p.id,
          name:          p.name,
          sku:           p.sku,
          total_sold:    Number(p.total_sold    ?? 0),
          total_revenue: Number(p.total_revenue ?? 0)
        })),
        recent_transactions: recentTransactions.map(t => ({
          id:             t.id,
          total_amount:   Number(t.total_amount),
          payment_method: t.payment_method,
          status:         t.status,
          created_at:     t.created_at,
          cashier:        t.user?.first_name ?? 'Unknown',
          item_count:     t._count?.transaction_items ?? 0
        }))
      }
    });
  })
);

// ─── Users list (admin / manager) ────────────────────────────
router.get(
  '/users',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const role: string = user?.role;
    const storeId: string | null = user?.storeId ?? null;
    const branchId: string | null = user?.branchId ?? null;

    if (!['admin', 'manager'].includes(role)) {
      throw new AppError(403, 'Admin or manager access required');
    }

    const users = await prisma.user.findMany({
      where: {
        is_active: true,
        store_id: storeId || undefined
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        last_login_at: true,
        created_at: true,
        _count: {
          select: {
            transactions: { where: { status: 'completed' } }
          }
        }
      },
      orderBy: { role: 'asc' }
    });

    res.json({ status: 'success', data: users });
  })
);

// ─── Sales report ─────────────────────────────────────────────
router.get(
  '/sales',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) throw new AppError(400, 'dateFrom and dateTo are required');

    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;
    const branchIds = await getAuthorizedBranchIds(req);

    const from = new Date(dateFrom as string);
    const to   = new Date(dateTo as string);

    // Use raw SQL so we can compute profit in a single join
    const rows = await prisma.$queryRaw`
      SELECT
        DATE(t.created_at)                                                     AS date,
        CAST(COUNT(DISTINCT t.id)       AS INT)                               AS transactions,
        CAST(SUM(ti.line_total)         AS FLOAT)                             AS revenue,
        CAST(SUM(ti.quantity)           AS INT)                               AS items_sold,
        CAST(SUM(ti.quantity * COALESCE(p.cost_price, 0)) AS FLOAT)          AS total_cost,
        CAST(SUM(ti.line_total) - SUM(ti.quantity * COALESCE(p.cost_price, 0)) AS FLOAT) AS profit
      FROM "Transaction" t
      LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
      LEFT JOIN "Product" p ON p.id = ti.product_id
      WHERE t.status = 'completed'
        AND t.created_at >= ${from}
        AND t.created_at <= ${to}
        AND t.branch_id = ANY(${branchIds})
      GROUP BY DATE(t.created_at)
      ORDER BY date ASC
    `;

    res.json({
      status: 'success',
      data: (rows as any[]).map(row => ({
        date:         row.date,
        transactions: Number(row.transactions ?? 0),
        revenue:      Number(row.revenue      ?? 0),
        items_sold:   Number(row.items_sold   ?? 0),
        total_cost:   Number(row.total_cost   ?? 0),
        profit:       Number(row.profit       ?? 0)
      }))
    });
  })
);

// ─── Top products (with names via raw SQL) ────────────────────
router.get(
  '/top-products',
  catchAsync(async (req: Request, res: Response) => {
    const { period = 'daily', limit = '10' } = req.query;
    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;
    const branchIds = await getAuthorizedBranchIds(req);

    const dateFrom = new Date();
    switch (period) {
      case 'weekly':  dateFrom.setDate(dateFrom.getDate() - 7); dateFrom.setHours(0, 0, 0, 0); break;
      case 'monthly': dateFrom.setDate(1); dateFrom.setHours(0, 0, 0, 0); break;
      default:        dateFrom.setHours(0, 0, 0, 0); break;
    }
    const dateTo = new Date();
    dateTo.setHours(23, 59, 59, 999);

    const lim = Math.min(50, Math.max(1, parseInt(limit as string) || 10));

    const rows = await prisma.$queryRaw`
      SELECT
        p.id,
        p.name,
        p.sku,
        CAST(SUM(ti.quantity)    AS INT)   AS total_sold,
        CAST(SUM(ti.line_total)  AS FLOAT) AS total_revenue,
        CAST(COUNT(DISTINCT ti.transaction_id) AS INT) AS transaction_count,
        CAST(SUM(ti.quantity * COALESCE(p.cost_price, 0)) AS FLOAT) AS total_cost,
        CAST(SUM(ti.line_total) - SUM(ti.quantity * COALESCE(p.cost_price, 0)) AS FLOAT) AS profit
      FROM "TransactionItem" ti
      JOIN "Product"     p ON ti.product_id     = p.id
      JOIN "Transaction" t ON ti.transaction_id = t.id
      WHERE t.created_at >= ${dateFrom}
        AND t.created_at <= ${dateTo}
        AND t.status     = 'completed'
        AND t.branch_id  = ANY(${branchIds})
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_revenue DESC
      LIMIT ${lim}
    `;

    res.json({
      status: 'success',
      data: (rows as any[]).map(p => ({
        id:                p.id,
        name:              p.name,
        sku:               p.sku,
        total_sold:        Number(p.total_sold        ?? 0),
        total_revenue:     Number(p.total_revenue     ?? 0),
        transaction_count: Number(p.transaction_count ?? 0),
        total_cost:        Number(p.total_cost        ?? 0),
        profit:            Number(p.profit            ?? 0)
      })),
      period
    });
  })
);

// ─── Employee performance (with names via raw SQL) ────────────
router.get(
  '/employee-performance',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;
    const branchIds = await getAuthorizedBranchIds(req);

    const from = dateFrom
      ? new Date(dateFrom as string)
      : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const to = dateTo ? new Date(dateTo as string) : new Date();

    const rows = await prisma.$queryRaw`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.role,
        CAST(COUNT(DISTINCT t.id) AS INT)    AS transaction_count,
        CAST(COALESCE(SUM(ti.line_total), 0)  AS FLOAT)  AS total_revenue,
        CASE WHEN COUNT(DISTINCT t.id) > 0
          THEN CAST(COALESCE(SUM(ti.line_total), 0) / COUNT(DISTINCT t.id) AS FLOAT)
          ELSE 0
        END AS avg_transaction
      FROM "User" u
      JOIN "Transaction" t ON t.user_id = u.id
      LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
      WHERE t.status     = 'completed'
        AND t.created_at >= ${from}
        AND t.created_at <= ${to}
        AND t.branch_id  = ANY(${branchIds})
        AND u.is_active  = true
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY total_revenue DESC
    `;

    res.json({
      status: 'success',
      data: (rows as any[]).map(r => ({
        id:                r.id,
        first_name:        r.first_name  ?? '',
        last_name:         r.last_name   ?? '',
        role:              r.role,
        transaction_count: Number(r.transaction_count ?? 0),
        total_revenue:     Number(r.total_revenue     ?? 0),
        avg_transaction:   Number(r.avg_transaction   ?? 0)
      }))
    });
  })
);

// ─── Payment method analysis ──────────────────────────────────
router.get(
  '/payments/methods',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) throw new AppError(400, 'dateFrom and dateTo are required');

    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;
    const branchIds = await getAuthorizedBranchIds(req);

    const from = new Date(dateFrom as string);
    const to = new Date(dateTo as string);

    const results = await prisma.$queryRaw`
      SELECT
        t.payment_method,
        CAST(COUNT(DISTINCT t.id) AS INT) AS count,
        CAST(COALESCE(SUM(ti.line_total), 0) AS FLOAT) AS total_amount
      FROM "Transaction" t
      LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
      WHERE t.status = 'completed'
        AND t.created_at >= ${from}
        AND t.created_at <= ${to}
        AND t.branch_id = ANY(${branchIds})
      GROUP BY t.payment_method
      ORDER BY total_amount DESC
    `;

    res.json({
      status: 'success',
      data: (results as any[]).map(r => ({
        payment_method: r.payment_method,
        _count: { id: Number(r.count ?? 0) },
        _sum: { total_amount: Number(r.total_amount ?? 0) }
      }))
    });
  })

);

// ─── Customer outstanding totals ──────────────────────────────
router.get(
  '/outstanding',
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;

    // Strict store scope — one tenant cannot see another's customers.
    // After the backfill SQL is run, all legacy rows will have store_id set.
    const customerWhere: any = { is_active: true };
    if (storeId) {
      customerWhere.store_id = storeId;
    }

    const [customers, payments] = await Promise.all([
      prisma.customer.findMany({
        where: customerWhere,
        select: { id: true, total_spent: true }
      }),
      prisma.payment.groupBy({
        by: ['customer_id'],
        _sum: { amount: true }
      })
    ]);

    const paidByCustomer = new Map(
      payments.map(p => [p.customer_id, Number(p._sum.amount ?? 0)])
    );

    let totalOutstanding = 0;
    let customersWithBalance = 0;
    for (const c of customers) {
      const owed = Number(c.total_spent ?? 0) - (paidByCustomer.get(c.id) ?? 0);
      if (owed > 0) {
        totalOutstanding += owed;
        customersWithBalance += 1;
      }
    }

    res.json({
      status: 'success',
      data: {
        total_outstanding: totalOutstanding,
        customers_with_balance: customersWithBalance
      }
    });
  })
);

// ─── Discount analytics ───────────────────────────────────────
router.get(
  '/discounts',
  catchAsync(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const user = (req as any).user;
    const storeId: string | null = user?.storeId ?? null;
    const branchIds = await getAuthorizedBranchIds(req);

    const from = dateFrom ? new Date(dateFrom as string) : new Date(0);
    const to = dateTo ? new Date(dateTo as string) : new Date();

    const rows = await prisma.$queryRaw`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        CAST(COUNT(t.id) AS INT) AS discount_count,
        CAST(SUM(t.discount_amount) AS FLOAT) AS total_discount,
        CAST(SUM(t.total_amount) AS FLOAT) AS total_revenue
      FROM "Transaction" t
      JOIN "User" u ON t.user_id = u.id
      WHERE t.status = 'completed'
        AND t.discount_amount > 0
        AND t.created_at >= ${from}
        AND t.created_at <= ${to}
        AND t.branch_id = ANY(${branchIds})
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY total_discount DESC
    `;

    res.json({
      status: 'success',
      data: (rows as any[]).map(r => ({
        user_id: r.id,
        cashier_name: `${r.first_name} ${r.last_name}`.trim(),
        discount_count: Number(r.discount_count ?? 0),
        total_discount: Number(r.total_discount ?? 0),
        associated_revenue: Number(r.total_revenue ?? 0)
      }))
    });
  })
);

export default router;
