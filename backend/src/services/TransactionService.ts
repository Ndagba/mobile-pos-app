import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface TransactionItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount_amount?: number;
  line_total: number;
  batch_id?: string;
}

interface CreateTransactionInput {
  store_id: string;
  user_id: string;
  customer_id?: string;
  offline_session_hash: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: 'cash' | 'card' | 'mobile_wallet';
  items: TransactionItemInput[];
}

export class TransactionService {
  static async createTransaction(input: CreateTransactionInput) {
    try {
      // Validate offline session hash uniqueness (idempotency)
      const existing = await prisma.transaction.findFirst({
        where: { offline_session_hash: input.offline_session_hash }
      });

      if (existing) {
        logger.warn({
          event: 'duplicate_transaction_attempt',
          offline_session_hash: input.offline_session_hash,
          existing_tx_id: existing.id
        });
        // Return existing transaction (idempotent)
        return this.getTransactionById(existing.id);
      }

      const transactionId = uuidv4();
      const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Start transaction
      const transaction = await prisma.$transaction(async (tx) => {
        // Create transaction
        const createdTx = await tx.transaction.create({
          data: {
            id: transactionId,
            store_id: input.store_id,
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
              id: uuidv4(),
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

      logger.info({
        event: 'transaction_created',
        transaction_id: transactionId,
        amount: input.total_amount,
        payment_method: input.payment_method
      });

      return transaction;
    } catch (error) {
      logger.error({
        event: 'transaction_creation_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(500, 'Failed to create transaction');
    }
  }

  static async batchSyncTransactions(transactions: CreateTransactionInput[]) {
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
      } catch (error) {
        errors.push({
          offline_session_hash: tx.offline_session_hash,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: 'failed'
        });
      }
    }

    logger.info({
      event: 'batch_sync_completed',
      total: transactions.length,
      synced: results.length,
      failed: errors.length
    });

    return { results, errors };
  }

  static async getTransactionById(transactionId: string) {
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
      throw new AppError(404, 'Transaction not found');
    }

    return transaction;
  }

  static async getStoreTransactions(
    storeId: string,
    limit: number = 50,
    offset: number = 0,
    filters?: {
      dateFrom?: Date;
      dateTo?: Date;
      paymentMethod?: string;
      status?: string;
    }
  ) {
    const where: any = { store_id: storeId };

    if (filters?.dateFrom || filters?.dateTo) {
      where.created_at = {};
      if (filters.dateFrom) where.created_at.gte = filters.dateFrom;
      if (filters.dateTo) where.created_at.lte = filters.dateTo;
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
          customer: { select: { first_name: true, phone: true } }
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.transaction.count({ where })
    ]);

    return {
      data: transactions,
      pagination: {
        limit,
        offset,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async voidTransaction(transactionId: string, voidReason: string, voidedByUserId: string) {
    try {
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { transaction_items: true }
      });

      if (!transaction) {
        throw new AppError(404, 'Transaction not found');
      }

      if (transaction.status === 'voided') {
        throw new AppError(400, 'Transaction already voided');
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

      logger.info({
        event: 'transaction_voided',
        transaction_id: transactionId,
        voided_by: voidedByUserId,
        amount: transaction.total_amount
      });

      return { status: 'voided', transaction_id: transactionId };
    } catch (error) {
      logger.error({
        event: 'void_transaction_failed',
        transaction_id: transactionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  static generateOfflineSessionHash(
    deviceId: string,
    transactionId: string,
    timestamp: number
  ): string {
    const data = `${deviceId}-${transactionId}-${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
