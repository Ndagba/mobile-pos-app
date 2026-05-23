"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_middleware_1.authMiddleware);
// Every route in this file is platform-level — only super admins.
router.use((req, _res, next) => {
    const user = req.user;
    if (!user?.is_super_admin) {
        return next(new errorHandler_1.AppError(403, 'Super admin access required'));
    }
    next();
});
// List all stores, enriched with branch + user counts so the wizard list
// shows useful context at a glance.
router.get('/', (0, errorHandler_1.catchAsync)(async (_req, res) => {
    const stores = await prisma.store.findMany({ orderBy: { created_at: 'asc' } });
    const enriched = await Promise.all(stores.map(async (s) => {
        const [branch_count, user_count] = await Promise.all([
            prisma.branch.count({ where: { store_id: s.id } }),
            prisma.user.count({ where: { store_id: s.id } })
        ]);
        return { ...s, branch_count, user_count };
    }));
    res.json({ status: 'success', data: enriched });
}));
// Create a new store + its first admin user atomically.
router.post('/', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { name, address, phone, currency, admin_username, admin_password, admin_email, admin_first_name } = req.body || {};
    if (!name || !admin_username || !admin_password || !admin_email) {
        throw new errorHandler_1.AppError(400, 'name, admin_username, admin_password and admin_email are required');
    }
    if (String(admin_password).length < 6) {
        throw new errorHandler_1.AppError(400, 'Password must be at least 6 characters');
    }
    // Auto-generate the next store id by scanning existing ones for the
    // `store_NNN` pattern. Non-matching ids are ignored so custom ids
    // (e.g. created by hand earlier) don't break sequence.
    const existing = await prisma.store.findMany({ select: { id: true } });
    let nextNum = 1;
    for (const s of existing) {
        const m = s.id.match(/^store_(\d+)$/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n >= nextNum)
                nextNum = n + 1;
        }
    }
    const storeId = `store_${String(nextNum).padStart(3, '0')}`;
    const uname = String(admin_username).toLowerCase().trim();
    const mail = String(admin_email).toLowerCase().trim();
    const conflict = await prisma.user.findFirst({
        where: { OR: [{ username: uname }, { email: mail }] }
    });
    if (conflict) {
        throw new errorHandler_1.AppError(400, 'A user with that username or email already exists');
    }
    const password_hash = await bcryptjs_1.default.hash(admin_password, 10);
    const result = await prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
            data: {
                id: storeId,
                name: String(name).trim(),
                address: address ? String(address).trim() : null,
                phone: phone ? String(phone).trim() : null,
                currency: String(currency || 'NGN').toUpperCase()
            }
        });
        const user = await tx.user.create({
            data: {
                id: (0, uuid_1.v4)(),
                username: uname,
                email: mail,
                password_hash,
                first_name: admin_first_name ? String(admin_first_name).trim() : 'Admin',
                role: 'admin',
                store_id: store.id,
                is_active: true
            }
        });
        return { store, user };
    });
    res.status(201).json({
        status: 'success',
        data: {
            store: result.store,
            admin: {
                id: result.user.id,
                username: result.user.username,
                email: result.user.email,
                first_name: result.user.first_name
            }
        }
    });
}));
// Update store details / toggle active.
router.patch('/:id', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { name, address, phone, currency, is_active } = req.body || {};
    const data = {};
    if (name !== undefined)
        data.name = String(name).trim();
    if (address !== undefined)
        data.address = address ? String(address).trim() : null;
    if (phone !== undefined)
        data.phone = phone ? String(phone).trim() : null;
    if (currency !== undefined)
        data.currency = String(currency).toUpperCase();
    if (is_active !== undefined)
        data.is_active = !!is_active;
    const store = await prisma.store.update({
        where: { id: req.params.id },
        data
    });
    res.json({ status: 'success', data: store });
}));
exports.default = router;
//# sourceMappingURL=stores.routes.js.map