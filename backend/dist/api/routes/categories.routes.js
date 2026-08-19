"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const uuid_1 = require("uuid");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const branchHelper_1 = require("../../utils/branchHelper");
const router = (0, express_1.Router)();
// GET /v1/categories — list active categories for the user's branch (authenticated)
router.get('/', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const branchId = user?.branchId ?? null;
    const storeId = user?.storeId ?? null;
    const where = { is_active: true };
    // Branch filtering
    const branchIds = await (0, branchHelper_1.getAuthorizedBranchIds)(req);
    where.branch_id = { in: branchIds };
    const categories = await prisma_1.prisma.category.findMany({
        where,
        orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
        include: {
            _count: { select: { products: { where: { is_active: true } } } }
        }
    });
    res.json({
        status: 'success',
        data: categories
    });
}));
// GET /v1/categories/:id
router.get('/:id', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const category = await prisma_1.prisma.category.findUnique({
        where: { id: req.params.id },
        include: { products: { where: { is_active: true } } }
    });
    if (!category)
        throw new errorHandler_1.AppError(404, 'Category not found');
    res.json({ status: 'success', data: category });
}));
// POST /v1/categories — create (admin or manager)
router.post('/', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    if (!['admin', 'manager'].includes(role)) {
        throw new errorHandler_1.AppError(403, 'Only admins or managers can create categories');
    }
    // Determine branchId. An admin is a store-level role and explicitly chooses
    // the target branch in the UI, so an admin's body.branch_id MUST win over
    // their own JWT branch — otherwise every category lands on the admin's home
    // branch regardless of what they selected. Managers/cashiers are pinned to
    // their JWT branch.
    let branchId = role === 'admin'
        ? (req.body.branch_id ?? user?.branchId ?? null)
        : (user?.branchId ?? req.body.branch_id ?? null);
    if (!branchId && user?.storeId) {
        const activeBranches = await prisma_1.prisma.branch.findMany({
            where: { store_id: user.storeId, is_active: true }
        });
        if (activeBranches.length === 1) {
            branchId = activeBranches[0].id;
        }
    }
    if (!branchId) {
        throw new errorHandler_1.AppError(400, 'branch_id is required (assign the user to a branch or pass branch_id in request body)');
    }
    const { name, description, display_order } = req.body;
    if (!name?.trim()) {
        throw new errorHandler_1.AppError(400, 'Category name is required');
    }
    // Check for duplicate name within the same branch
    const existing = await prisma_1.prisma.category.findFirst({
        where: { name: name.trim(), branch_id: branchId }
    });
    if (existing) {
        throw new errorHandler_1.AppError(409, `Category "${name.trim()}" already exists in this branch`);
    }
    const category = await prisma_1.prisma.category.create({
        data: {
            id: (0, uuid_1.v4)(),
            name: name.trim(),
            description: description?.trim() || null,
            display_order: display_order ?? null,
            branch_id: branchId
        }
    });
    res.status(201).json({ status: 'success', data: category });
}));
// PATCH /v1/categories/:id — update (admin or manager)
router.patch('/:id', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const role = req.user?.role;
    if (!['admin', 'manager'].includes(role)) {
        throw new errorHandler_1.AppError(403, 'Only admins or managers can update categories');
    }
    const { name, description, display_order, is_active } = req.body;
    const category = await prisma_1.prisma.category.update({
        where: { id: req.params.id },
        data: {
            ...(name && { name: name.trim() }),
            ...(description !== undefined && { description: description?.trim() || null }),
            ...(display_order !== undefined && { display_order }),
            ...(is_active !== undefined && { is_active })
        }
    });
    res.json({ status: 'success', data: category });
}));
// DELETE /v1/categories/:id — soft delete (admin only)
router.delete('/:id', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const role = req.user?.role;
    if (role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can delete categories');
    }
    await prisma_1.prisma.category.update({
        where: { id: req.params.id },
        data: { is_active: false }
    });
    res.json({ status: 'success', message: 'Category deactivated' });
}));
exports.default = router;
//# sourceMappingURL=categories.routes.js.map