"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_middleware_1.authMiddleware);
// ─── Helpers ──────────────────────────────────────────────────
/**
 * Build a Prisma `where` clause object for Transaction queries.
 * Priority: branchId > storeId > no filter
 */
const branchWhere = (branchId, storeId) => {
    if (branchId)
        return { branch_id: branchId };
    if (storeId)
        return { store_id: storeId };
    return {};
};
// ─── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const storeId = user?.storeId ?? null;
    const role = user?.role ?? '';
    // Determine effective branchId: JWT value takes priority; admin can override via query param
    let effectiveBranchId = user?.branchId ?? null;
    if (!effectiveBranchId && role === 'admin' && req.query.branch_id) {
        effectiveBranchId = req.query.branch_id;
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    // Build where clauses
    const locationFilter = branchWhere(effectiveBranchId, storeId);
    const todayWhere = { status: 'completed', created_at: { gte: todayStart }, ...locationFilter };
    const weekWhere = { status: 'completed', created_at: { gte: weekStart }, ...locationFilter };
    // ── Each query gets its own .catch() so one failure never kills the whole endpoint
    const [transactionCount, revenueAgg, itemsAgg, weekRevenueAgg, paymentBreakdown, productCount, lowStockCount,] = await Promise.all([
        prisma.transaction.count({ where: todayWhere })
            .catch(() => 0),
        // Revenue from transaction items (not transaction total, for consistency)
        (effectiveBranchId ? prisma.$queryRaw `
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.branch_id = ${effectiveBranchId}
      ` : storeId ? prisma.$queryRaw `
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.store_id = ${storeId}
      ` : prisma.$queryRaw `
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
      `)
            .then(rows => ({ _sum: { total_amount: rows[0]?.revenue ?? 0 } }))
            .catch(() => ({ _sum: { total_amount: null } })),
        prisma.transactionItem.aggregate({ where: { transaction: todayWhere }, _sum: { quantity: true } })
            .catch(() => ({ _sum: { quantity: null } })),
        // Weekly revenue from transaction items
        (effectiveBranchId ? prisma.$queryRaw `
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${weekStart}
          AND t.branch_id = ${effectiveBranchId}
      ` : storeId ? prisma.$queryRaw `
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${weekStart}
          AND t.store_id = ${storeId}
      ` : prisma.$queryRaw `
        SELECT COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "TransactionItem" ti
        JOIN "Transaction" t ON t.id = ti.transaction_id
        WHERE t.status = 'completed'
          AND t.created_at >= ${weekStart}
      `)
            .then(rows => ({ _sum: { total_amount: rows[0]?.revenue ?? 0 } }))
            .catch(() => ({ _sum: { total_amount: null } })),
        // Payment breakdown by method (using line_total from items)
        (effectiveBranchId ? prisma.$queryRaw `
        SELECT
          t.payment_method,
          COUNT(DISTINCT t.id) AS count,
          COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.branch_id = ${effectiveBranchId}
        GROUP BY t.payment_method
        ORDER BY revenue DESC
      ` : storeId ? prisma.$queryRaw `
        SELECT
          t.payment_method,
          COUNT(DISTINCT t.id) AS count,
          COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
          AND t.store_id = ${storeId}
        GROUP BY t.payment_method
        ORDER BY revenue DESC
      ` : prisma.$queryRaw `
        SELECT
          t.payment_method,
          COUNT(DISTINCT t.id) AS count,
          COALESCE(SUM(ti.line_total), 0) AS revenue
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${todayStart}
        GROUP BY t.payment_method
        ORDER BY revenue DESC
      `)
            .then(rows => rows.map(r => ({ payment_method: r.payment_method, _count: { id: Number(r.count) }, _sum: { total_amount: r.revenue } })))
            .catch(() => []),
        // Product count — scoped to this store/branch
        prisma.product.count({
            where: {
                is_active: true,
                ...(effectiveBranchId
                    ? { branch_id: effectiveBranchId }
                    : storeId
                        ? { branch: { store_id: storeId } }
                        : {})
            }
        }).catch(() => 0),
        // Low-stock count — scoped to this store/branch
        (effectiveBranchId
            ? prisma.$queryRaw `
            SELECT CAST(COUNT(*) AS INT) AS count
            FROM "Inventory" i
            JOIN "Product" p ON i.product_id = p.id
            WHERE i.quantity_on_hand <= i.low_stock_threshold
              AND p.is_active = true
              AND p.branch_id = ${effectiveBranchId}
          `
            : storeId
                ? prisma.$queryRaw `
              SELECT CAST(COUNT(*) AS INT) AS count
              FROM "Inventory" i
              JOIN "Product" p ON i.product_id = p.id
              JOIN "Branch"  b ON p.branch_id  = b.id
              WHERE i.quantity_on_hand <= i.low_stock_threshold
                AND p.is_active = true
                AND b.store_id  = ${storeId}
            `
                : prisma.$queryRaw `
              SELECT CAST(COUNT(*) AS INT) AS count
              FROM "Inventory" i
              JOIN "Product" p ON i.product_id = p.id
              WHERE i.quantity_on_hand <= i.low_stock_threshold
                AND p.is_active = true
            `).then(rows => rows[0]?.count ?? 0).catch(() => 0),
    ]);
    // ── Recent transactions
    const recentTransactions = await prisma.transaction.findMany({
        where: locationFilter,
        include: {
            user: { select: { first_name: true } },
            _count: { select: { transaction_items: true } }
        },
        orderBy: { created_at: 'desc' },
        take: 8
    }).catch(() => []);
    // ── Top products — raw SQL with branch/store filtering
    let topProducts = [];
    try {
        if (effectiveBranchId) {
            topProducts = await prisma.$queryRaw `
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
            AND t.branch_id = ${effectiveBranchId}
          GROUP BY p.id, p.name, p.sku
          ORDER BY total_revenue DESC
          LIMIT 5
        `;
        }
        else if (storeId) {
            topProducts = await prisma.$queryRaw `
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
            AND t.store_id = ${storeId}
          GROUP BY p.id, p.name, p.sku
          ORDER BY total_revenue DESC
          LIMIT 5
        `;
        }
        else {
            topProducts = await prisma.$queryRaw `
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
          GROUP BY p.id, p.name, p.sku
          ORDER BY total_revenue DESC
          LIMIT 5
        `;
        }
    }
    catch (err) {
        console.error('[dashboard] top_products query failed:', err?.message ?? err);
    }
    // ── Profit calculation via raw SQL
    let totalCost = 0;
    try {
        let costRows;
        if (effectiveBranchId) {
            costRows = await prisma.$queryRaw `
          SELECT COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0) AS total_cost
          FROM "TransactionItem" ti
          JOIN "Product" p ON p.id = ti.product_id
          JOIN "Transaction" t ON t.id = ti.transaction_id
          WHERE t.status = 'completed'
            AND t.created_at >= ${todayStart}
            AND t.branch_id = ${effectiveBranchId}
        `;
        }
        else if (storeId) {
            costRows = await prisma.$queryRaw `
          SELECT COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0) AS total_cost
          FROM "TransactionItem" ti
          JOIN "Product" p ON p.id = ti.product_id
          JOIN "Transaction" t ON t.id = ti.transaction_id
          WHERE t.status = 'completed'
            AND t.created_at >= ${todayStart}
            AND t.store_id = ${storeId}
        `;
        }
        else {
            costRows = await prisma.$queryRaw `
          SELECT COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0) AS total_cost
          FROM "TransactionItem" ti
          JOIN "Product" p ON p.id = ti.product_id
          JOIN "Transaction" t ON t.id = ti.transaction_id
          WHERE t.status = 'completed'
            AND t.created_at >= ${todayStart}
        `;
        }
        totalCost = Number(costRows[0]?.total_cost ?? 0);
    }
    catch (err) {
        console.error('[dashboard] profit query failed:', err?.message ?? err);
    }
    const totalRevenue = Number(revenueAgg._sum.total_amount ?? 0);
    const weekRevenue = Number(weekRevenueAgg._sum.total_amount ?? 0);
    const totalItems = Number(itemsAgg._sum.quantity ?? 0);
    const avgTransaction = transactionCount > 0
        ? +(totalRevenue / transactionCount).toFixed(2)
        : 0;
    const totalProfit = +(totalRevenue - totalCost).toFixed(2);
    const profitMargin = totalRevenue > 0
        ? +((totalProfit / totalRevenue) * 100).toFixed(2)
        : 0;
    res.json({
        status: 'success',
        data: {
            transaction_count: transactionCount,
            total_revenue: totalRevenue,
            avg_transaction: avgTransaction,
            total_items_sold: totalItems,
            weekly_revenue: weekRevenue,
            product_count: productCount,
            low_stock_count: lowStockCount,
            total_profit: totalProfit,
            profit_margin: profitMargin,
            payment_breakdown: paymentBreakdown.map(p => ({
                method: p.payment_method,
                count: p._count.id,
                total: Number(p._sum.total_amount ?? 0)
            })),
            top_products: topProducts.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                total_sold: Number(p.total_sold ?? 0),
                total_revenue: Number(p.total_revenue ?? 0)
            })),
            recent_transactions: recentTransactions.map(t => ({
                id: t.id,
                total_amount: Number(t.total_amount),
                payment_method: t.payment_method,
                status: t.status,
                created_at: t.created_at,
                cashier: t.user?.first_name ?? 'Unknown',
                item_count: t._count?.transaction_items ?? 0
            }))
        }
    });
}));
// ─── Users list (admin / manager) ────────────────────────────
router.get('/users', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    const branchId = user?.branchId ?? null;
    if (!['admin', 'manager'].includes(role)) {
        throw new errorHandler_1.AppError(403, 'Admin or manager access required');
    }
    const locationFilter = branchWhere(branchId, storeId);
    const users = await prisma.user.findMany({
        where: {
            is_active: true,
            ...locationFilter
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
}));
// ─── Sales report ─────────────────────────────────────────────
router.get('/sales', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo)
        throw new errorHandler_1.AppError(400, 'dateFrom and dateTo are required');
    const user = req.user;
    const storeId = user?.storeId ?? null;
    let branchId = user?.branchId ?? null;
    // Admin can filter by a specific branch via query param
    if (!branchId && user?.role === 'admin' && req.query.branch_id) {
        branchId = req.query.branch_id;
    }
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    // Use raw SQL so we can compute profit in a single join
    let rows;
    if (branchId) {
        rows = await prisma.$queryRaw `
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
          AND t.branch_id = ${branchId}
        GROUP BY DATE(t.created_at)
        ORDER BY date ASC
      `;
    }
    else if (storeId) {
        rows = await prisma.$queryRaw `
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
          AND t.store_id = ${storeId}
        GROUP BY DATE(t.created_at)
        ORDER BY date ASC
      `;
    }
    else {
        rows = await prisma.$queryRaw `
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
        GROUP BY DATE(t.created_at)
        ORDER BY date ASC
      `;
    }
    res.json({
        status: 'success',
        data: rows.map(row => ({
            date: row.date,
            transactions: Number(row.transactions ?? 0),
            revenue: Number(row.revenue ?? 0),
            items_sold: Number(row.items_sold ?? 0),
            total_cost: Number(row.total_cost ?? 0),
            profit: Number(row.profit ?? 0)
        }))
    });
}));
// ─── Top products (with names via raw SQL) ────────────────────
router.get('/top-products', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { period = 'daily', limit = '10' } = req.query;
    const user = req.user;
    const storeId = user?.storeId ?? null;
    let branchId = user?.branchId ?? null;
    // Admin can filter by a specific branch via query param
    if (!branchId && user?.role === 'admin' && req.query.branch_id) {
        branchId = req.query.branch_id;
    }
    const dateFrom = new Date();
    switch (period) {
        case 'weekly':
            dateFrom.setDate(dateFrom.getDate() - 7);
            dateFrom.setHours(0, 0, 0, 0);
            break;
        case 'monthly':
            dateFrom.setDate(1);
            dateFrom.setHours(0, 0, 0, 0);
            break;
        default:
            dateFrom.setHours(0, 0, 0, 0);
            break;
    }
    const dateTo = new Date();
    dateTo.setHours(23, 59, 59, 999);
    const lim = Math.min(50, Math.max(1, parseInt(limit) || 10));
    let rows;
    if (branchId) {
        rows = await prisma.$queryRaw `
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
          AND t.branch_id  = ${branchId}
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_revenue DESC
        LIMIT ${lim}
      `;
    }
    else if (storeId) {
        rows = await prisma.$queryRaw `
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
          AND t.store_id   = ${storeId}
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_revenue DESC
        LIMIT ${lim}
      `;
    }
    else {
        rows = await prisma.$queryRaw `
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
          AND t.status = 'completed'
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_revenue DESC
        LIMIT ${lim}
      `;
    }
    res.json({
        status: 'success',
        data: rows.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            total_sold: Number(p.total_sold ?? 0),
            total_revenue: Number(p.total_revenue ?? 0),
            transaction_count: Number(p.transaction_count ?? 0),
            total_cost: Number(p.total_cost ?? 0),
            profit: Number(p.profit ?? 0)
        })),
        period
    });
}));
// ─── Employee performance (with names via raw SQL) ────────────
router.get('/employee-performance', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { dateFrom, dateTo } = req.query;
    const user = req.user;
    const storeId = user?.storeId ?? null;
    let branchId = user?.branchId ?? null;
    // Admin can filter by a specific branch via query param
    if (!branchId && user?.role === 'admin' && req.query.branch_id) {
        branchId = req.query.branch_id;
    }
    const from = dateFrom
        ? new Date(dateFrom)
        : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
    const to = dateTo ? new Date(dateTo) : new Date();
    let rows;
    if (branchId) {
        rows = await prisma.$queryRaw `
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
          AND t.branch_id  = ${branchId}
          AND u.is_active  = true
        GROUP BY u.id, u.first_name, u.last_name, u.role
        ORDER BY total_revenue DESC
      `;
    }
    else if (storeId) {
        rows = await prisma.$queryRaw `
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
          AND t.store_id   = ${storeId}
          AND u.is_active  = true
        GROUP BY u.id, u.first_name, u.last_name, u.role
        ORDER BY total_revenue DESC
      `;
    }
    else {
        rows = await prisma.$queryRaw `
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
          AND u.is_active  = true
        GROUP BY u.id, u.first_name, u.last_name, u.role
        ORDER BY total_revenue DESC
      `;
    }
    res.json({
        status: 'success',
        data: rows.map(r => ({
            id: r.id,
            first_name: r.first_name ?? '',
            last_name: r.last_name ?? '',
            role: r.role,
            transaction_count: Number(r.transaction_count ?? 0),
            total_revenue: Number(r.total_revenue ?? 0),
            avg_transaction: Number(r.avg_transaction ?? 0)
        }))
    });
}));
// ─── Payment method analysis ──────────────────────────────────
router.get('/payments/methods', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo)
        throw new errorHandler_1.AppError(400, 'dateFrom and dateTo are required');
    const user = req.user;
    const storeId = user?.storeId ?? null;
    let branchId = user?.branchId ?? null;
    // Admin can filter by a specific branch via query param
    if (!branchId && user?.role === 'admin' && req.query.branch_id) {
        branchId = req.query.branch_id;
    }
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    let results;
    if (branchId) {
        results = await prisma.$queryRaw `
        SELECT
          t.payment_method,
          CAST(COUNT(DISTINCT t.id) AS INT) AS count,
          CAST(COALESCE(SUM(ti.line_total), 0) AS FLOAT) AS total_amount
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
          AND t.branch_id = ${branchId}
        GROUP BY t.payment_method
        ORDER BY total_amount DESC
      `;
    }
    else if (storeId) {
        results = await prisma.$queryRaw `
        SELECT
          t.payment_method,
          CAST(COUNT(DISTINCT t.id) AS INT) AS count,
          CAST(COALESCE(SUM(ti.line_total), 0) AS FLOAT) AS total_amount
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
          AND t.store_id = ${storeId}
        GROUP BY t.payment_method
        ORDER BY total_amount DESC
      `;
    }
    else {
        results = await prisma.$queryRaw `
        SELECT
          t.payment_method,
          CAST(COUNT(DISTINCT t.id) AS INT) AS count,
          CAST(COALESCE(SUM(ti.line_total), 0) AS FLOAT) AS total_amount
        FROM "Transaction" t
        LEFT JOIN "TransactionItem" ti ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
        GROUP BY t.payment_method
        ORDER BY total_amount DESC
      `;
    }
    res.json({
        status: 'success',
        data: results.map(r => ({
            payment_method: r.payment_method,
            count: Number(r.count ?? 0),
            total_amount: Number(r.total_amount ?? 0)
        }))
    });
}));
// ─── Customer outstanding totals ──────────────────────────────
router.get('/outstanding', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const storeId = user?.storeId ?? null;
    // Strict store scope — one tenant cannot see another's customers.
    // After the backfill SQL is run, all legacy rows will have store_id set.
    const customerWhere = { is_active: true };
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
    const paidByCustomer = new Map(payments.map(p => [p.customer_id, Number(p._sum.amount ?? 0)]));
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
}));
exports.default = router;
//# sourceMappingURL=analytics.routes.js.map