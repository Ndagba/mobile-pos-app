"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_middleware_1.authMiddleware);
// ─── Store-isolation helpers ─────────────────────────────────
/**
 * Build the Prisma `where` fragment that scopes a customer query to the
 * requesting user's store.  Super-admins (platform operators) are unscoped.
 *
 * Uses strict equality on store_id so one tenant can never see another's
 * customers.  Run the backfill SQL (deployment notes) once after deploy so
 * existing legacy rows (store_id IS NULL) get assigned to the correct store.
 */
function customerStoreWhere(user) {
    if (user?.is_super_admin && !user?.storeId)
        return {}; // platform-level super admin
    if (!user?.storeId)
        return {};
    return { store_id: user.storeId };
}
/**
 * Throw 403 if the customer's store_id is set and does not match the caller's
 * store.  Super-admins are always allowed.
 */
async function assertCustomerAccess(customerId, user) {
    if (user?.is_super_admin && !user?.storeId)
        return;
    if (!user?.storeId)
        return;
    const c = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { store_id: true }
    });
    if (!c)
        throw new errorHandler_1.AppError(404, 'Customer not found');
    // If the customer has a store_id that doesn't match → deny
    if (c.store_id && c.store_id !== user.storeId) {
        throw new errorHandler_1.AppError(403, 'Access denied');
    }
}
// ─── Create customer ──────────────────────────────────────────
router.post('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const { phone, email, first_name, last_name, date_of_birth, credit_limit, notes, tag } = req.body;
    if (!phone && !email) {
        throw new errorHandler_1.AppError(400, 'Phone or email is required');
    }
    const customer = await prisma.customer.create({
        data: {
            id: (0, uuid_1.v4)(),
            store_id: user?.storeId ?? null, // ← tenant tag
            phone,
            email,
            first_name,
            last_name,
            date_of_birth: date_of_birth ? new Date(date_of_birth) : null,
            credit_limit: credit_limit ? parseFloat(credit_limit) : null,
            notes: notes || null,
            tag: tag || null
        }
    });
    res.status(201).json({
        status: 'success',
        data: customer
    });
}));
// ─── Get customers ────────────────────────────────────────────
router.get('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    const { limit = '50', offset = '0', search } = req.query;
    const where = { ...customerStoreWhere(user) };
    if (search) {
        where.AND = [
            {
                OR: [
                    { first_name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            }
        ];
    }
    const [customers, total] = await Promise.all([
        prisma.customer.findMany({
            where,
            take: parseInt(limit),
            skip: parseInt(offset),
            orderBy: { created_at: 'desc' }
        }),
        prisma.customer.count({ where })
    ]);
    res.json({
        status: 'success',
        data: customers,
        pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total
        }
    });
}));
// ─── Get customer by ID ───────────────────────────────────────
router.get('/:id', (0, errorHandler_1.catchAsync)(async (req, res) => {
    await assertCustomerAccess(req.params.id, req.user);
    const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
    });
    if (!customer) {
        throw new errorHandler_1.AppError(404, 'Customer not found');
    }
    res.json({
        status: 'success',
        data: customer
    });
}));
// ─── Update customer ──────────────────────────────────────────
router.patch('/:id', (0, errorHandler_1.catchAsync)(async (req, res) => {
    await assertCustomerAccess(req.params.id, req.user);
    const customer = await prisma.customer.update({
        where: { id: req.params.id },
        data: req.body
    });
    res.json({
        status: 'success',
        data: customer
    });
}));
// ─── Get customer transaction history ────────────────────────
router.get('/:id/history', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    await assertCustomerAccess(req.params.id, user);
    const { limit = '20', offset = '0' } = req.query;
    // Scope transactions to this store as well
    const txWhere = { customer_id: req.params.id };
    if (user?.storeId)
        txWhere.store_id = user.storeId;
    const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
            where: txWhere,
            include: { transaction_items: true },
            orderBy: { created_at: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset)
        }),
        prisma.transaction.count({ where: txWhere })
    ]);
    res.json({
        status: 'success',
        data: transactions,
        pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total
        }
    });
}));
// ─── Add loyalty points ───────────────────────────────────────
router.post('/:id/loyalty', (0, errorHandler_1.catchAsync)(async (req, res) => {
    await assertCustomerAccess(req.params.id, req.user);
    const { points } = req.body;
    if (!points)
        throw new errorHandler_1.AppError(400, 'points is required');
    const customer = await prisma.customer.update({
        where: { id: req.params.id },
        data: { loyalty_points: { increment: points } }
    });
    res.json({ status: 'success', data: customer });
}));
// ─── Record customer payment ──────────────────────────────────
router.post('/:id/payments', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { amount, date, notes } = req.body;
    const user = req.user;
    if (!amount || amount <= 0)
        throw new errorHandler_1.AppError(400, 'Valid amount is required');
    if (!date)
        throw new errorHandler_1.AppError(400, 'Payment date is required');
    await assertCustomerAccess(req.params.id, user);
    const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
    });
    if (!customer)
        throw new errorHandler_1.AppError(404, 'Customer not found');
    // Calculate customer's outstanding balance
    const totalPayments = await prisma.payment.aggregate({
        where: { customer_id: req.params.id },
        _sum: { amount: true }
    });
    const totalPaid = totalPayments._sum.amount ? Number(totalPayments._sum.amount) : 0;
    const outstandingBalance = Number(customer.total_spent) - totalPaid;
    if (parseFloat(amount) > outstandingBalance) {
        throw new errorHandler_1.AppError(400, `Payment amount (₦${parseFloat(amount).toLocaleString()}) exceeds outstanding balance (₦${Math.max(0, outstandingBalance).toLocaleString()})`);
    }
    const payment = await prisma.payment.create({
        data: {
            id: (0, uuid_1.v4)(),
            customer_id: req.params.id,
            amount: parseFloat(amount),
            date: new Date(date),
            notes: notes || null,
            recorded_by_user_id: user?.id
        }
    });
    res.status(201).json({ status: 'success', data: payment });
}));
// ─── Get customer payments ────────────────────────────────────
router.get('/:id/payments', (0, errorHandler_1.catchAsync)(async (req, res) => {
    await assertCustomerAccess(req.params.id, req.user);
    const { limit = '50', offset = '0' } = req.query;
    const customer = await prisma.customer.findUnique({
        where: { id: req.params.id }
    });
    if (!customer)
        throw new errorHandler_1.AppError(404, 'Customer not found');
    const [payments, total] = await Promise.all([
        prisma.payment.findMany({
            where: { customer_id: req.params.id },
            orderBy: { date: 'desc' },
            take: parseInt(limit),
            skip: parseInt(offset),
            include: {
                recorded_by_user: {
                    select: { id: true, first_name: true, last_name: true }
                }
            }
        }),
        prisma.payment.count({ where: { customer_id: req.params.id } })
    ]);
    res.json({
        status: 'success',
        data: payments,
        pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total
        }
    });
}));
// ─── Delete payment ───────────────────────────────────────────
router.delete('/:customerId/payments/:paymentId', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { customerId, paymentId } = req.params;
    await assertCustomerAccess(customerId, req.user);
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment)
        throw new errorHandler_1.AppError(404, 'Payment not found');
    if (payment.customer_id !== customerId) {
        throw new errorHandler_1.AppError(400, 'Payment does not belong to this customer');
    }
    await prisma.payment.delete({ where: { id: paymentId } });
    res.json({ status: 'success', message: 'Payment deleted successfully' });
}));
exports.default = router;
//# sourceMappingURL=customers.routes.js.map