import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class InventoryService {
  static async getInventoryStatus(storeId?: string) {
    try {
      const inventory = await prisma.inventory.findMany({
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
        status:
          inv.quantity_on_hand - inv.quantity_reserved <= 0
            ? 'OUT_OF_STOCK'
            : inv.quantity_on_hand - inv.quantity_reserved <= inv.low_stock_threshold
            ? 'LOW'
            : 'IN_STOCK'
      }));
    } catch (error) {
      logger.error({
        event: 'inventory_fetch_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(500, 'Failed to fetch inventory');
    }
  }

  static async getLowStockAlerts(storeId?: string) {
    try {
      const lowStockItems = await prisma.inventory.findMany({
        where: {
          quantity_on_hand: {
            lte: prisma.inventory.fields.low_stock_threshold
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
        orderBy: { quantity_on_hand: 'asc' }
      });

      return lowStockItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product.name,
        sku: item.product.sku,
        current_quantity: item.quantity_on_hand,
        low_stock_threshold: item.low_stock_threshold,
        reorder_point: item.reorder_point,
        alert_level:
          item.quantity_on_hand <= 0
            ? 'CRITICAL'
            : item.quantity_on_hand <= item.low_stock_threshold * 0.5
            ? 'URGENT'
            : 'WARNING'
      }));
    } catch (error) {
      logger.error({
        event: 'low_stock_alert_fetch_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(500, 'Failed to fetch low stock alerts');
    }
  }

  static async getExpiringBatches(daysUntilExpiry: number = 7) {
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
        days_until_expiry: Math.floor(
          (batch.expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
        urgency:
          Math.floor((batch.expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 1
            ? 'CRITICAL'
            : Math.floor((batch.expiry_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 3
            ? 'HIGH'
            : 'MEDIUM'
      }));
    } catch (error) {
      logger.error({
        event: 'expiring_batches_fetch_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(500, 'Failed to fetch expiring batches');
    }
  }

  static async updateStock(productId: string, quantity: number, reason: string) {
    try {
      const inventory = await prisma.inventory.findUnique({
        where: { product_id: productId }
      });

      if (!inventory) {
        throw new AppError(404, 'Inventory record not found');
      }

      if (inventory.quantity_on_hand + quantity < 0) {
        throw new AppError(400, 'Insufficient stock for this operation');
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

      logger.info({
        event: 'inventory_updated',
        product_id: productId,
        quantity_change: quantity,
        reason,
        new_quantity: updated.quantity_on_hand
      });

      return updated;
    } catch (error) {
      logger.error({
        event: 'stock_update_failed',
        product_id: productId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  static async createBatch(
    productId: string,
    batchNumber: string,
    manufacturedDate: Date,
    expiryDate: Date,
    quantity: number,
    warehouseLocation?: string
  ) {
    try {
      if (expiryDate <= manufacturedDate) {
        throw new AppError(400, 'Expiry date must be after manufactured date');
      }

      const batch = await prisma.batchTracking.create({
        data: {
          id: uuidv4(),
          product_id: productId,
          batch_number,
          manufactured_date,
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

      logger.info({
        event: 'batch_created',
        batch_id: batch.id,
        product_id: productId,
        quantity
      });

      return batch;
    } catch (error) {
      logger.error({
        event: 'batch_creation_failed',
        product_id: productId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  static async markBatchExpired(batchId: string) {
    try {
      const batch = await prisma.batchTracking.findUnique({
        where: { id: batchId }
      });

      if (!batch) {
        throw new AppError(404, 'Batch not found');
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

      logger.info({
        event: 'batch_marked_expired',
        batch_id: batchId,
        quantity: batch.quantity
      });

      return updated;
    } catch (error) {
      logger.error({
        event: 'mark_batch_expired_failed',
        batch_id: batchId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  static async getInventoryTurnover(storeId: string, dateFrom: Date, dateTo: Date) {
    try {
      const result = await prisma.$queryRaw`
        SELECT
          p.id,
          p.name,
          p.sku,
          SUM(ti.quantity) as total_sold,
          COUNT(DISTINCT t.id) as transaction_count,
          ROUND(SUM(ti.quantity::numeric) /
            (SELECT avg(i.quantity_on_hand)
             FROM inventory i
             WHERE i.product_id = p.id)::numeric, 2) as turnover_ratio
        FROM products p
        LEFT JOIN transaction_items ti ON p.id = ti.product_id
        LEFT JOIN transactions t ON ti.transaction_id = t.id
        WHERE t.created_at >= ${dateFrom}
          AND t.created_at <= ${dateTo}
          AND t.store_id = ${storeId}
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_sold DESC
      `;

      return result;
    } catch (error) {
      logger.error({
        event: 'inventory_turnover_calculation_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(500, 'Failed to calculate inventory turnover');
    }
  }
}
