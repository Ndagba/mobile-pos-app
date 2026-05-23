"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_middleware_1.authMiddleware);
// Get sync status for device
router.get('/status/:deviceId', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { deviceId } = req.params;
    const syncQueue = await prisma.offlineSyncQueue.findMany({
        where: { device_id: deviceId }
    });
    const stats = {
        total: syncQueue.length,
        pending: syncQueue.filter((item) => item.status === 'pending').length,
        syncing: syncQueue.filter((item) => item.status === 'syncing').length,
        synced: syncQueue.filter((item) => item.status === 'synced').length,
        failed: syncQueue.filter((item) => item.status === 'failed').length,
        conflicts: syncQueue.filter((item) => item.status === 'conflict').length
    };
    res.json({
        status: 'success',
        data: {
            device_id: deviceId,
            sync_stats: stats,
            last_sync: syncQueue[0]?.synced_at || null,
            queue: syncQueue.map((item) => ({
                id: item.id,
                transaction_id: item.transaction_id,
                status: item.status,
                created_at: item.created_at
            }))
        }
    });
}));
// Retry failed sync
router.post('/retry/:queueId', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const queueItem = await prisma.offlineSyncQueue.findUnique({
        where: { id: req.params.queueId }
    });
    if (!queueItem) {
        throw new errorHandler_1.AppError(404, 'Queue item not found');
    }
    const updated = await prisma.offlineSyncQueue.update({
        where: { id: req.params.queueId },
        data: {
            status: 'pending',
            attempt_count: 0,
            last_error: null
        }
    });
    res.json({
        status: 'success',
        data: updated
    });
}));
// Get full sync queue
router.get('/queue', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { limit = '100', offset = '0', status: filterStatus } = req.query;
    const where = {};
    if (filterStatus) {
        where.status = filterStatus;
    }
    const [queue, total] = await Promise.all([
        prisma.offlineSyncQueue.findMany({
            where,
            take: parseInt(limit),
            skip: parseInt(offset),
            orderBy: { created_at: 'asc' }
        }),
        prisma.offlineSyncQueue.count({ where })
    ]);
    res.json({
        status: 'success',
        data: queue,
        pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total
        }
    });
}));
// Get offline transactions (not yet synced)
router.get('/offline-transactions', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const storeWhere = { is_sync_online: false };
    if (user?.storeId)
        storeWhere.store_id = user.storeId;
    const offlineTransactions = await prisma.transaction.findMany({
        where: storeWhere,
        include: { transaction_items: true },
        orderBy: { created_at: 'asc' }
    });
    res.json({
        status: 'success',
        data: offlineTransactions,
        count: offlineTransactions.length
    });
}));
exports.default = router;
//# sourceMappingURL=sync.routes.js.map