"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_middleware_1.authMiddleware);
// Get store settings (any authenticated user)
router.get('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const storeId = req.user.storeId;
    let settings = await prisma.storeSetting.findUnique({
        where: { store_id: storeId }
    });
    if (!settings) {
        settings = await prisma.storeSetting.create({
            data: { store_id: storeId }
        });
    }
    res.json({
        status: 'success',
        data: settings
    });
}));
// Update store settings (manager/admin only)
router.patch('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const storeId = req.user.storeId;
    const role = req.user.role;
    if (role !== 'admin' && role !== 'manager') {
        throw new errorHandler_1.AppError(403, 'Only managers and admins can change store settings');
    }
    const { allow_cashier_add_customers, allow_cashier_edit_customers } = req.body;
    const data = {};
    if (typeof allow_cashier_add_customers === 'boolean') {
        data.allow_cashier_add_customers = allow_cashier_add_customers;
    }
    if (typeof allow_cashier_edit_customers === 'boolean') {
        data.allow_cashier_edit_customers = allow_cashier_edit_customers;
    }
    const settings = await prisma.storeSetting.upsert({
        where: { store_id: storeId },
        update: data,
        create: { store_id: storeId, ...data }
    });
    res.json({
        status: 'success',
        data: settings
    });
}));
exports.default = router;
//# sourceMappingURL=settings.routes.js.map