"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const InventoryService_1 = require("../../services/InventoryService");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_middleware_1.authMiddleware);
// Get inventory status
router.get('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const inventory = await InventoryService_1.InventoryService.getInventoryStatus(req.user.storeId);
    res.json({
        status: 'success',
        data: inventory
    });
}));
// Get low stock alerts — filtered by branch for non-admin roles
router.get('/low-stock', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const branchId = user?.branchId ?? null;
    const alerts = await InventoryService_1.InventoryService.getLowStockAlerts(user.storeId, branchId);
    res.json({
        status: 'success',
        data: alerts,
        count: alerts.length
    });
}));
// Get expiring batches
router.get('/expiring', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { days = '7' } = req.query;
    const batches = await InventoryService_1.InventoryService.getExpiringBatches(parseInt(days));
    res.json({
        status: 'success',
        data: batches,
        count: batches.length
    });
}));
// ─── Bulk-update low-stock threshold for all products in the store ───
router.patch('/threshold/store', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    if (!['admin', 'manager'].includes(user?.role)) {
        throw new errorHandler_1.AppError(403, 'Admin or manager access required');
    }
    const { threshold } = req.body;
    const parsed = Number(threshold);
    if (threshold === undefined || isNaN(parsed) || parsed < 0) {
        throw new errorHandler_1.AppError(400, 'threshold must be a non-negative number');
    }
    const thresholdBigInt = BigInt(Math.round(parsed));
    // Scope update to products owned by this store only.
    // Products are linked to branches; branches carry the store_id.
    // Raw SQL is the cleanest way to do a filtered updateMany via a join.
    const storeId = user?.storeId ?? null;
    let updatedCount = 0;
    if (storeId) {
        const result = await prisma.$executeRaw `
        UPDATE "Inventory"
        SET    low_stock_threshold = ${thresholdBigInt}
        WHERE  product_id IN (
          SELECT p.id
          FROM   "Product" p
          JOIN   "Branch"  b ON p.branch_id = b.id
          WHERE  b.store_id = ${storeId}
        )
      `;
        updatedCount = Number(result);
    }
    else {
        // Super-admin / no store context — update everything
        const result = await prisma.inventory.updateMany({
            where: {},
            data: { low_stock_threshold: thresholdBigInt },
        });
        updatedCount = result.count;
    }
    res.json({
        status: 'success',
        message: `Low-stock threshold updated to ${parsed} for ${updatedCount} product(s)`,
        updated_count: updatedCount,
    });
}));
// Update stock and/or per-product low-stock threshold.
// Both fields are optional but at least one must be supplied.
//   quantity + reason  → adjust stock quantity (delta, may be negative)
//   low_stock_threshold → change the alert threshold for this product only
// Both can be sent together in a single request.
router.patch('/:productId', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { quantity, reason, low_stock_threshold } = req.body;
    if (quantity === undefined && low_stock_threshold === undefined) {
        throw new errorHandler_1.AppError(400, 'quantity or low_stock_threshold is required');
    }
    if (quantity !== undefined && !reason) {
        throw new errorHandler_1.AppError(400, 'reason is required when adjusting quantity (e.g., "restock", "adjustment", "loss")');
    }
    let result = {};
    if (quantity !== undefined) {
        result = await InventoryService_1.InventoryService.updateStock(req.params.productId, quantity, reason);
    }
    if (low_stock_threshold !== undefined) {
        const parsed = Number(low_stock_threshold);
        if (isNaN(parsed) || parsed < 0) {
            throw new errorHandler_1.AppError(400, 'low_stock_threshold must be a non-negative number');
        }
        result = await InventoryService_1.InventoryService.updateThreshold(req.params.productId, Math.round(parsed));
    }
    res.json({
        status: 'success',
        data: result
    });
}));
// Create batch
router.post('/batches', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { product_id, batch_number, manufactured_date, expiry_date, quantity, warehouse_location } = req.body;
    if (!product_id || !batch_number || !manufactured_date || !expiry_date || !quantity) {
        throw new errorHandler_1.AppError(400, 'Missing required batch fields');
    }
    const batch = await InventoryService_1.InventoryService.createBatch(product_id, batch_number, new Date(manufactured_date), new Date(expiry_date), quantity, warehouse_location);
    res.status(201).json({
        status: 'success',
        data: batch
    });
}));
// Mark batch expired
router.post('/batches/:batchId/expire', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const result = await InventoryService_1.InventoryService.markBatchExpired(req.params.batchId);
    res.json({
        status: 'success',
        data: result
    });
}));
// Get inventory turnover
router.get('/turnover', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
        throw new errorHandler_1.AppError(400, 'dateFrom and dateTo are required');
    }
    const result = await InventoryService_1.InventoryService.getInventoryTurnover(req.user.storeId, new Date(dateFrom), new Date(dateTo));
    res.json({
        status: 'success',
        data: result
    });
}));
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map