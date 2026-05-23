"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const errorHandler_1 = require("../utils/errorHandler");
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
class InventoryService {
    static async getInventoryStatus(storeId) {
        try {
            const inventory = await prisma.inventory.findMany({
                where: storeId
                    ? { product: { branch: { store_id: storeId } } }
                    : {},
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            sku: true,
                            category: { select: { name: true } },
                            image_url: true
                        }
                    }
                }
            });
            return inventory.map((inv) => ({
                product_id: inv.product_id,
                product_name: inv.product.name,
                sku: inv.product.sku,
                quantity_on_hand: inv.quantity_on_hand,
                quantity_reserved: inv.quantity_reserved,
                available_quantity: inv.quantity_on_hand - inv.quantity_reserved,
                low_stock_threshold: inv.low_stock_threshold,
                status: inv.quantity_on_hand - inv.quantity_reserved <= 0
                    ? 'OUT_OF_STOCK'
                    : inv.quantity_on_hand - inv.quantity_reserved <= inv.low_stock_threshold
                        ? 'LOW'
                        : 'IN_STOCK'
            }));
        }
        catch (error) {
            logger_1.logger.error({
                event: 'inventory_fetch_failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new errorHandler_1.AppError(500, 'Failed to fetch inventory');
        }
    }
    static async getLowStockAlerts(storeId, branchId) {
        try {
            // Use raw SQL to compare two columns (quantity_on_hand <= low_stock_threshold)
            // Prisma ORM can't compare two fields of the same row without a raw query.
            const lowStockItems = branchId
                // Scoped to a specific branch (manager / cashier view)
                ? await prisma.$queryRaw `
            SELECT
              i.product_id,
              i.quantity_on_hand,
              i.low_stock_threshold,
              i.reorder_point,
              p.name AS product_name,
              p.sku
            FROM "Inventory" i
            JOIN "Product" p ON i.product_id = p.id
            WHERE i.quantity_on_hand <= i.low_stock_threshold
              AND p.is_active = true
              AND p.branch_id = ${branchId}
            ORDER BY i.quantity_on_hand ASC
            LIMIT 100
          `
                : storeId
                    // No branch but we have a store — scope to all branches of this store
                    ? await prisma.$queryRaw `
            SELECT
              i.product_id,
              i.quantity_on_hand,
              i.low_stock_threshold,
              i.reorder_point,
              p.name AS product_name,
              p.sku
            FROM "Inventory" i
            JOIN "Product" p ON i.product_id = p.id
            JOIN "Branch"  b ON p.branch_id  = b.id
            WHERE i.quantity_on_hand <= i.low_stock_threshold
              AND p.is_active = true
              AND b.store_id  = ${storeId}
            ORDER BY i.quantity_on_hand ASC
            LIMIT 100
          `
                    // Super-admin / no store context — return everything (platform-level view)
                    : await prisma.$queryRaw `
            SELECT
              i.product_id,
              i.quantity_on_hand,
              i.low_stock_threshold,
              i.reorder_point,
              p.name AS product_name,
              p.sku
            FROM "Inventory" i
            JOIN "Product" p ON i.product_id = p.id
            WHERE i.quantity_on_hand <= i.low_stock_threshold
              AND p.is_active = true
            ORDER BY i.quantity_on_hand ASC
            LIMIT 100
          `;
            return lowStockItems.map((item) => ({
                product_id: item.product_id,
                product_name: item.product_name,
                sku: item.sku,
                current_quantity: Number(item.quantity_on_hand),
                low_stock_threshold: Number(item.low_stock_threshold),
                reorder_point: Number(item.reorder_point),
                alert_level: Number(item.quantity_on_hand) <= 0
                    ? 'CRITICAL'
                    : Number(item.quantity_on_hand) <= Number(item.low_stock_threshold) * 0.5
                        ? 'URGENT'
                        : 'WARNING'
            }));
        }
        catch (error) {
            logger_1.logger.error({
                event: 'low_stock_alert_fetch_failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new errorHandler_1.AppError(500, 'Failed to fetch low stock alerts');
        }
    }
    static async getExpiringBatches(daysUntilExpiry = 7) {
        try {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);
            const batches = await prisma.batchTracking.findMany({
                where: {
                    is_expired: false,
                    expiry_date: {
                        lte: expiryDate,
                        gte: new Date()
                    }
                },
                include: {
                    product: {
                        select: {
                            name: true,
                            sku: true
                        }
                    }
                },
                orderBy: { expiry_date: 'asc' }
            });
            return batches.map((batch) => ({
                batch_id: batch.id,
                product_name: batch.product.name,
                sku: batch.product.sku,
                batch_number: batch.batch_number,
                manufactured_date: batch.manufactured_date,
                expiry_date: batch.expiry_date,
                quantity: batch.quantity,
                days_until_expiry: Math.floor((batch.expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
                urgency: Math.floor((batch.expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 1
                    ? 'CRITICAL'
                    : Math.floor((batch.expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 3
                        ? 'HIGH'
                        : 'MEDIUM'
            }));
        }
        catch (error) {
            logger_1.logger.error({
                event: 'expiring_batches_fetch_failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new errorHandler_1.AppError(500, 'Failed to fetch expiring batches');
        }
    }
    static async updateStock(productId, quantity, reason) {
        try {
            const inventory = await prisma.inventory.findUnique({
                where: { product_id: productId }
            });
            if (!inventory) {
                throw new errorHandler_1.AppError(404, 'Inventory record not found');
            }
            if (Number(inventory.quantity_on_hand) + quantity < 0) {
                throw new errorHandler_1.AppError(400, 'Insufficient stock for this operation');
            }
            const updated = await prisma.inventory.update({
                where: { product_id: productId },
                data: {
                    quantity_on_hand: {
                        increment: quantity
                    },
                    last_stock_check: new Date()
                }
            });
            logger_1.logger.info({
                event: 'inventory_updated',
                product_id: productId,
                quantity_change: quantity,
                reason,
                new_quantity: updated.quantity_on_hand
            });
            return updated;
        }
        catch (error) {
            logger_1.logger.error({
                event: 'stock_update_failed',
                product_id: productId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static async updateThreshold(productId, threshold) {
        try {
            const inventory = await prisma.inventory.findUnique({
                where: { product_id: productId }
            });
            if (!inventory) {
                throw new errorHandler_1.AppError(404, 'Inventory record not found');
            }
            const updated = await prisma.inventory.update({
                where: { product_id: productId },
                data: { low_stock_threshold: BigInt(Math.round(threshold)) }
            });
            logger_1.logger.info({
                event: 'threshold_updated',
                product_id: productId,
                threshold
            });
            return updated;
        }
        catch (error) {
            logger_1.logger.error({
                event: 'threshold_update_failed',
                product_id: productId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static async createBatch(productId, batchNumber, manufacturedDate, expiryDate, quantity, warehouseLocation) {
        try {
            if (expiryDate <= manufacturedDate) {
                throw new errorHandler_1.AppError(400, 'Expiry date must be after manufactured date');
            }
            const batch = await prisma.batchTracking.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    product_id: productId,
                    batch_number: batchNumber,
                    manufactured_date: manufacturedDate,
                    expiry_date: expiryDate,
                    quantity,
                    warehouse_location: warehouseLocation,
                    is_expired: false
                }
            });
            // Update inventory
            await prisma.inventory.update({
                where: { product_id: productId },
                data: {
                    quantity_on_hand: {
                        increment: quantity
                    }
                }
            });
            logger_1.logger.info({
                event: 'batch_created',
                batch_id: batch.id,
                product_id: productId,
                quantity
            });
            return batch;
        }
        catch (error) {
            logger_1.logger.error({
                event: 'batch_creation_failed',
                product_id: productId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static async markBatchExpired(batchId) {
        try {
            const batch = await prisma.batchTracking.findUnique({
                where: { id: batchId }
            });
            if (!batch) {
                throw new errorHandler_1.AppError(404, 'Batch not found');
            }
            // Deduct from inventory
            await prisma.inventory.update({
                where: { product_id: batch.product_id },
                data: {
                    quantity_on_hand: {
                        decrement: batch.quantity
                    }
                }
            });
            // Mark batch as expired
            const updated = await prisma.batchTracking.update({
                where: { id: batchId },
                data: { is_expired: true }
            });
            logger_1.logger.info({
                event: 'batch_marked_expired',
                batch_id: batchId,
                quantity: batch.quantity
            });
            return updated;
        }
        catch (error) {
            logger_1.logger.error({
                event: 'mark_batch_expired_failed',
                batch_id: batchId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static async getInventoryTurnover(storeId, dateFrom, dateTo) {
        try {
            // Tables use quoted PascalCase names as created by Prisma migrations.
            const result = await prisma.$queryRaw `
        SELECT
          p.id,
          p.name,
          p.sku,
          SUM(ti.quantity) as total_sold,
          COUNT(DISTINCT t.id) as transaction_count,
          ROUND(SUM(ti.quantity::numeric) /
            NULLIF((SELECT avg(i.quantity_on_hand)
             FROM "Inventory" i
             WHERE i.product_id = p.id), 0)::numeric, 2) as turnover_ratio
        FROM "Product" p
        LEFT JOIN "TransactionItem" ti ON p.id = ti.product_id
        LEFT JOIN "Transaction"     t  ON ti.transaction_id = t.id
        WHERE t.created_at >= ${dateFrom}
          AND t.created_at <= ${dateTo}
          AND t.store_id = ${storeId}
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_sold DESC
      `;
            return result;
        }
        catch (error) {
            logger_1.logger.error({
                event: 'inventory_turnover_calculation_failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new errorHandler_1.AppError(500, 'Failed to calculate inventory turnover');
        }
    }
}
exports.InventoryService = InventoryService;
//# sourceMappingURL=InventoryService.js.map