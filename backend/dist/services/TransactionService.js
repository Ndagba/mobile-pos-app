"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const uuid_1 = require("uuid");
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../utils/errorHandler");
const logger_1 = require("../utils/logger");
const crypto_1 = __importDefault(require("crypto"));
const prisma = new client_1.PrismaClient();
class TransactionService {
    static async createTransaction(input) {
        try {
            // Validate offline session hash uniqueness (idempotency)
            const existing = await prisma.transaction.findFirst({
                where: { offline_session_hash: input.offline_session_hash }
            });
            if (existing) {
                logger_1.logger.warn({
                    event: 'duplicate_transaction_attempt',
                    offline_session_hash: input.offline_session_hash,
                    existing_tx_id: existing.id
                });
                // Return existing transaction (idempotent)
                return TransactionService.getTransactionById(existing.id);
            }
            const transactionId = (0, uuid_1.v4)();
            const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            // Start transaction
            const transaction = await prisma.$transaction(async (tx) => {
                // Create transaction
                const createdTx = await tx.transaction.create({
                    data: {
                        id: transactionId,
                        store_id: input.store_id,
                        branch_id: input.branch_id,
                        user_id: input.user_id,
                        customer_id: input.customer_id,
                        offline_session_hash: input.offline_session_hash,
                        subtotal: input.subtotal,
                        tax_amount: input.tax_amount,
                        discount_amount: input.discount_amount,
                        total_amount: input.total_amount,
                        payment_method: input.payment_method,
                        payment_status: 'completed',
                        receipt_number: receiptNumber,
                        is_sync_online: true,
                        synced_at: new Date(),
                        status: 'completed'
                    }
                });
                // Create transaction items and update inventory
                for (const item of input.items) {
                    await tx.transactionItem.create({
                        data: {
                            id: (0, uuid_1.v4)(),
                            transaction_id: transactionId,
                            product_id: item.product_id,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            tax_amount: item.tax_amount,
                            discount_amount: item.discount_amount || 0,
                            line_total: item.line_total,
                            batch_id: item.batch_id
                        }
                    });
                    // Deduct from inventory
                    await tx.inventory.update({
                        where: { product_id: item.product_id },
                        data: {
                            quantity_on_hand: {
                                decrement: item.quantity
                            }
                        }
                    });
                }
                // Update customer stats if exists
                if (input.customer_id) {
                    await tx.customer.update({
                        where: { id: input.customer_id },
                        data: {
                            total_spent: {
                                increment: input.total_amount
                            },
                            transaction_count: {
                                increment: 1
                            },
                            last_transaction_at: new Date()
                        }
                    });
                }
                return createdTx;
            });
            logger_1.logger.info({
                event: 'transaction_created',
                transaction_id: transactionId,
                amount: input.total_amount,
                payment_method: input.payment_method
            });
            return transaction;
        }
        catch (error) {
            logger_1.logger.error({
                event: 'transaction_creation_failed',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            if (error instanceof errorHandler_1.AppError)
                throw error;
            throw new errorHandler_1.AppError(500, `Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static async batchSyncTransactions(transactions) {
        const results = [];
        const errors = [];
        for (const tx of transactions) {
            try {
                const result = await this.createTransaction(tx);
                results.push({
                    offline_session_hash: tx.offline_session_hash,
                    transaction_id: result.id,
                    status: 'synced'
                });
            }
            catch (error) {
                errors.push({
                    offline_session_hash: tx.offline_session_hash,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    status: 'failed'
                });
            }
        }
        logger_1.logger.info({
            event: 'batch_sync_completed',
            total: transactions.length,
            synced: results.length,
            failed: errors.length
        });
        return { results, errors };
    }
    static async getTransactionById(transactionId) {
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                transaction_items: {
                    include: {
                        product: {
                            select: {
                                name: true,
                                sku: true
                            }
                        }
                    }
                },
                user: {
                    select: {
                        id: true,
                        first_name: true,
                        email: true
                    }
                },
                customer: {
                    select: {
                        id: true,
                        first_name: true,
                        phone: true
                    }
                }
            }
        });
        if (!transaction) {
            throw new errorHandler_1.AppError(404, 'Transaction not found');
        }
        return transaction;
    }
    static async getStoreTransactions(storeId, limit = 50, offset = 0, filters) {
        const where = { store_id: storeId };
        if (filters?.dateFrom || filters?.dateTo) {
            where.created_at = {};
            if (filters.dateFrom)
                where.created_at.gte = filters.dateFrom;
            if (filters.dateTo)
                where.created_at.lte = filters.dateTo;
        }
        if (filters?.paymentMethod) {
            where.payment_method = filters.paymentMethod;
        }
        if (filters?.status) {
            where.status = filters.status;
        }
        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                include: {
                    user: { select: { first_name: true } },
                    customer: { select: { first_name: true, phone: true } },
                    _count: { select: { transaction_items: true } }
                },
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset
            }),
            prisma.transaction.count({ where })
        ]);
        const data = transactions.map((tx) => ({
            ...tx,
            item_count: tx._count?.transaction_items ?? 0
        }));
        return {
            data,
            pagination: {
                limit,
                offset,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }
    static async voidTransaction(transactionId, voidReason, voidedByUserId) {
        try {
            const transaction = await prisma.transaction.findUnique({
                where: { id: transactionId },
                include: { transaction_items: true }
            });
            if (!transaction) {
                throw new errorHandler_1.AppError(404, 'Transaction not found');
            }
            if (transaction.status === 'voided') {
                throw new errorHandler_1.AppError(400, 'Transaction already voided');
            }
            // Restore inventory
            await prisma.$transaction(async (tx) => {
                for (const item of transaction.transaction_items) {
                    await tx.inventory.update({
                        where: { product_id: item.product_id },
                        data: {
                            quantity_on_hand: {
                                increment: item.quantity
                            }
                        }
                    });
                }
                // Update transaction status
                await tx.transaction.update({
                    where: { id: transactionId },
                    data: {
                        status: 'voided',
                        void_reason: voidReason,
                        voided_at: new Date(),
                        voided_by: voidedByUserId
                    }
                });
            });
            // Log audit
            await prisma.auditLog.create({
                data: {
                    user_id: voidedByUserId,
                    action: 'VOID_TRANSACTION',
                    resource_type: 'transaction',
                    resource_id: transactionId,
                    changes: {
                        reason: voidReason,
                        voided_amount: transaction.total_amount
                    }
                }
            });
            logger_1.logger.info({
                event: 'transaction_voided',
                transaction_id: transactionId,
                voided_by: voidedByUserId,
                amount: transaction.total_amount
            });
            return { status: 'voided', transaction_id: transactionId };
        }
        catch (error) {
            logger_1.logger.error({
                event: 'void_transaction_failed',
                transaction_id: transactionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static async refundTransaction(transactionId, reason, refundedByUserId) {
        try {
            const transaction = await prisma.transaction.findUnique({
                where: { id: transactionId },
                include: { transaction_items: true }
            });
            if (!transaction) {
                throw new errorHandler_1.AppError(404, 'Transaction not found');
            }
            if (transaction.status === 'refunded' || transaction.status === 'voided') {
                throw new errorHandler_1.AppError(400, `Transaction already ${transaction.status}`);
            }
            await prisma.$transaction(async (tx) => {
                // Restore inventory for each item
                for (const item of transaction.transaction_items) {
                    await tx.inventory.update({
                        where: { product_id: item.product_id },
                        data: { quantity_on_hand: { increment: item.quantity } }
                    });
                }
                // Reverse customer stats so the refund doesn't inflate lifetime totals
                if (transaction.customer_id) {
                    await tx.customer.update({
                        where: { id: transaction.customer_id },
                        data: {
                            total_spent: { decrement: transaction.total_amount },
                            transaction_count: { decrement: 1 }
                        }
                    });
                }
                await tx.transaction.update({
                    where: { id: transactionId },
                    data: {
                        status: 'refunded',
                        payment_status: 'refunded',
                        void_reason: reason,
                        voided_at: new Date(),
                        voided_by: refundedByUserId
                    }
                });
            });
            await prisma.auditLog.create({
                data: {
                    user_id: refundedByUserId,
                    action: 'REFUND_TRANSACTION',
                    resource_type: 'transaction',
                    resource_id: transactionId,
                    changes: { reason, refunded_amount: transaction.total_amount }
                }
            });
            logger_1.logger.info({
                event: 'transaction_refunded',
                transaction_id: transactionId,
                refunded_by: refundedByUserId,
                amount: transaction.total_amount
            });
            return { status: 'refunded', transaction_id: transactionId };
        }
        catch (error) {
            logger_1.logger.error({
                event: 'refund_transaction_failed',
                transaction_id: transactionId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static generateOfflineSessionHash(deviceId, transactionId, timestamp) {
        const data = `${deviceId}-${transactionId}-${timestamp}`;
        return crypto_1.default.createHash('sha256').update(data).digest('hex');
    }
    static async getByOfflineHash(offlineSessionHash) {
        return prisma.transaction.findUnique({
            where: { offline_session_hash: offlineSessionHash },
            include: { transaction_items: true }
        });
    }
    static async getStoreDailySummary(storeId, date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const result = await prisma.transaction.aggregate({
            where: {
                store_id: storeId,
                created_at: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                status: 'completed'
            },
            _count: { id: true },
            _sum: { total_amount: true }
        });
        return {
            transaction_count: result._count.id,
            total_revenue: result._sum.total_amount || 0,
            average_transaction: result._count.id > 0
                ? Number(result._sum.total_amount || 0) / result._count.id
                : 0
        };
    }
    static async exportTransactions(storeId, dateFrom, dateTo, format = 'csv') {
        const transactions = await prisma.transaction.findMany({
            where: {
                store_id: storeId,
                created_at: {
                    gte: dateFrom,
                    lte: dateTo
                }
            },
            include: { transaction_items: true, user: true }
        });
        if (format === 'json') {
            return transactions;
        }
        const csv = [
            ['ID', 'Date', 'Cashier', 'Items', 'Total', 'Payment Method'],
            ...transactions.map(tx => [
                tx.id,
                tx.created_at.toISOString(),
                tx.user.first_name ?? '',
                tx.transaction_items.length,
                tx.total_amount,
                tx.payment_method
            ])
        ];
        return csv;
    }
}
exports.TransactionService = TransactionService;
//# sourceMappingURL=TransactionService.js.map