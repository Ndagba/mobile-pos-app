"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// All branch routes require authentication
router.use(auth_middleware_1.authMiddleware);
// ─── GET / — List branches ────────────────────────────────────────────────────
// Admin: all branches for their store_id
// Manager / Cashier: only their own branch
router.get('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    const branchId = user?.branchId ?? null;
    let where = {};
    if (role === 'admin') {
        // Admins see all branches in their store
        if (storeId) {
            where.store_id = storeId;
        }
    }
    else {
        // Managers and cashiers only see their own branch
        if (branchId) {
            where.id = branchId;
        }
        else if (storeId) {
            // Fallback: show branches for their store if no branch_id set
            where.store_id = storeId;
        }
    }
    const branches = await prisma.branch.findMany({
        where,
        orderBy: { created_at: 'asc' }
    });
    res.json({
        status: 'success',
        data: branches
    });
}));
// ─── POST / — Create branch (admin only) ─────────────────────────────────────
router.post('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    if (role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can create branches');
    }
    if (!storeId) {
        throw new errorHandler_1.AppError(400, 'Admin must have a store_id to create a branch');
    }
    const { name, address, phone } = req.body;
    if (!name?.trim()) {
        throw new errorHandler_1.AppError(400, 'Branch name is required');
    }
    const branch = await prisma.branch.create({
        data: {
            id: (0, uuid_1.v4)(),
            name: name.trim(),
            address: address?.trim() ?? null,
            phone: phone?.trim() ?? null,
            store_id: storeId,
            is_active: true
        }
    });
    res.status(201).json({
        status: 'success',
        data: branch
    });
}));
// ─── PATCH /:id — Update branch (admin only) ─────────────────────────────────
router.patch('/:id', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    if (role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can update branches');
    }
    // Ensure the branch belongs to the admin's store
    const existing = await prisma.branch.findUnique({
        where: { id: req.params.id }
    });
    if (!existing) {
        throw new errorHandler_1.AppError(404, 'Branch not found');
    }
    if (storeId && existing.store_id !== storeId) {
        throw new errorHandler_1.AppError(403, 'You do not have permission to update this branch');
    }
    const { name, address, phone } = req.body;
    const updateData = {};
    if (name !== undefined)
        updateData.name = name.trim();
    if (address !== undefined)
        updateData.address = address?.trim() ?? null;
    if (phone !== undefined)
        updateData.phone = phone?.trim() ?? null;
    const branch = await prisma.branch.update({
        where: { id: req.params.id },
        data: updateData
    });
    res.json({
        status: 'success',
        data: branch
    });
}));
// ─── PATCH /:id/deactivate — Soft-deactivate branch (admin only) ─────────────
router.patch('/:id/deactivate', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    if (role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can deactivate branches');
    }
    const existing = await prisma.branch.findUnique({
        where: { id: req.params.id }
    });
    if (!existing) {
        throw new errorHandler_1.AppError(404, 'Branch not found');
    }
    if (storeId && existing.store_id !== storeId) {
        throw new errorHandler_1.AppError(403, 'You do not have permission to deactivate this branch');
    }
    const branch = await prisma.branch.update({
        where: { id: req.params.id },
        data: { is_active: false }
    });
    res.json({
        status: 'success',
        data: branch,
        message: 'Branch deactivated successfully'
    });
}));
// ─── GET /:id/staff — List users in this branch (admin or manager) ────────────
router.get('/:id/staff', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    if (!['admin', 'manager'].includes(role)) {
        throw new errorHandler_1.AppError(403, 'Admin or manager access required');
    }
    const branch = await prisma.branch.findUnique({
        where: { id: req.params.id }
    });
    if (!branch) {
        throw new errorHandler_1.AppError(404, 'Branch not found');
    }
    if (storeId && branch.store_id !== storeId) {
        throw new errorHandler_1.AppError(403, 'You do not have permission to view this branch');
    }
    const staff = await prisma.user.findMany({
        where: {
            branch_id: req.params.id,
            is_active: true
        },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            role: true,
            store_id: true,
            branch_id: true,
            last_login_at: true,
            created_at: true
        },
        orderBy: { role: 'asc' }
    });
    res.json({
        status: 'success',
        data: staff
    });
}));
// ─── POST /:id/staff — Assign existing user to this branch (admin only) ──────
router.post('/:id/staff', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    if (role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can assign users to branches');
    }
    const branch = await prisma.branch.findUnique({
        where: { id: req.params.id }
    });
    if (!branch) {
        throw new errorHandler_1.AppError(404, 'Branch not found');
    }
    if (storeId && branch.store_id !== storeId) {
        throw new errorHandler_1.AppError(403, 'You do not have permission to manage this branch');
    }
    const { user_id } = req.body;
    if (!user_id) {
        throw new errorHandler_1.AppError(400, 'user_id is required');
    }
    const targetUser = await prisma.user.findUnique({
        where: { id: user_id }
    });
    if (!targetUser) {
        throw new errorHandler_1.AppError(404, 'User not found');
    }
    if (!targetUser.is_active) {
        throw new errorHandler_1.AppError(400, 'Cannot assign an inactive user to a branch');
    }
    if (storeId && targetUser.store_id !== storeId) {
        throw new errorHandler_1.AppError(403, 'User does not belong to your store');
    }
    const updatedUser = await prisma.user.update({
        where: { id: user_id },
        data: { branch_id: req.params.id },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            role: true,
            store_id: true,
            branch_id: true
        }
    });
    res.json({
        status: 'success',
        data: updatedUser,
        message: 'User assigned to branch successfully'
    });
}));
// ─── DELETE /:id/staff/:userId — Remove user from branch (admin only) ─────────
router.delete('/:id/staff/:userId', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const role = user?.role;
    const storeId = user?.storeId ?? null;
    if (role !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Only admins can remove users from branches');
    }
    const branch = await prisma.branch.findUnique({
        where: { id: req.params.id }
    });
    if (!branch) {
        throw new errorHandler_1.AppError(404, 'Branch not found');
    }
    if (storeId && branch.store_id !== storeId) {
        throw new errorHandler_1.AppError(403, 'You do not have permission to manage this branch');
    }
    const targetUser = await prisma.user.findUnique({
        where: { id: req.params.userId }
    });
    if (!targetUser) {
        throw new errorHandler_1.AppError(404, 'User not found');
    }
    if (targetUser.branch_id !== req.params.id) {
        throw new errorHandler_1.AppError(400, 'User is not assigned to this branch');
    }
    const updatedUser = await prisma.user.update({
        where: { id: req.params.userId },
        data: { branch_id: null },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            role: true,
            store_id: true,
            branch_id: true
        }
    });
    res.json({
        status: 'success',
        data: updatedUser,
        message: 'User removed from branch successfully'
    });
}));
exports.default = router;
//# sourceMappingURL=branches.routes.js.map