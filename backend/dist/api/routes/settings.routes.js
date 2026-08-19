"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
// Get store settings (any authenticated user)
router.get('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const storeId = req.user.storeId;
    let settings = await prisma_1.prisma.storeSetting.findUnique({
        where: { store_id: storeId }
    });
    if (!settings) {
        settings = await prisma_1.prisma.storeSetting.create({
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
    const { allow_cashier_add_customers, allow_cashier_edit_customers, customer_menu_enabled, supplier_menu_enabled } = req.body;
    const data = {};
    if (typeof allow_cashier_add_customers === 'boolean') {
        data.allow_cashier_add_customers = allow_cashier_add_customers;
    }
    if (typeof allow_cashier_edit_customers === 'boolean') {
        data.allow_cashier_edit_customers = allow_cashier_edit_customers;
    }
    if (typeof customer_menu_enabled === 'boolean') {
        data.customer_menu_enabled = customer_menu_enabled;
    }
    if (typeof supplier_menu_enabled === 'boolean') {
        data.supplier_menu_enabled = supplier_menu_enabled;
    }
    const settings = await prisma_1.prisma.storeSetting.upsert({
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