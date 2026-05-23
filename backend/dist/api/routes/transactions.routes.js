"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const TransactionService_1 = require("../../services/TransactionService");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
// Create transaction
router.post('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { items, ...transactionData } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new errorHandler_1.AppError(400, 'Transaction must have at least one item');
    }
    const user = req.user;
    const transaction = await TransactionService_1.TransactionService.createTransaction({
        ...transactionData,
        user_id: user.userId,
        // Carry branch from JWT; fall back to body value for offline-synced transactions
        branch_id: user.branchId ?? transactionData.branch_id,
        store_id: transactionData.store_id ?? user.storeId,
        items
    });
    res.status(201).json({
        status: 'success',
        data: transaction
    });
}));
// Batch sync offline transactions
router.post('/batch', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions)) {
        throw new errorHandler_1.AppError(400, 'Invalid transaction batch format');
    }
    const user = req.user;
    const result = await TransactionService_1.TransactionService.batchSyncTransactions(transactions.map((tx) => ({
        ...tx,
        user_id: user.userId,
        // Trust the JWT for branch/store — offline-synced payloads may omit them
        branch_id: user.branchId ?? tx.branch_id,
        store_id: tx.store_id ?? user.storeId
    })));
    res.json({
        status: 'success',
        data: result
    });
}));
// Get transactions
router.get('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { limit = '50', offset = '0', dateFrom, dateTo, paymentMethod, status } = req.query;
    const result = await TransactionService_1.TransactionService.getStoreTransactions(req.user.storeId, parseInt(limit), parseInt(offset), {
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        paymentMethod: paymentMethod,
        status: status
    });
    res.json({
        status: 'success',
        data: result
    });
}));
// Get single transaction
router.get('/:id', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const transaction = await TransactionService_1.TransactionService.getTransactionById(req.params.id);
    res.json({
        status: 'success',
        data: transaction
    });
}));
// Refund transaction (admin-only)
router.post('/:id/refund', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { reason } = req.body;
    const user = req.user;
    if (user.role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can process refunds');
    }
    const result = await TransactionService_1.TransactionService.refundTransaction(req.params.id, reason || 'Customer request', user.userId);
    res.json({
        status: 'success',
        data: result
    });
}));
// Void transaction
router.post('/:id/void', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { voidReason } = req.body;
    if (!voidReason) {
        throw new errorHandler_1.AppError(400, 'Void reason is required');
    }
    const result = await TransactionService_1.TransactionService.voidTransaction(req.params.id, voidReason, req.user.userId);
    res.json({
        status: 'success',
        data: result
    });
}));
exports.default = router;
//# sourceMappingURL=transactions.routes.js.map