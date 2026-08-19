"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./utils/errorHandler");
const billingCron_1 = require("./jobs/billingCron");
// Route imports
const auth_routes_1 = __importDefault(require("./api/routes/auth.routes"));
const products_routes_1 = __importDefault(require("./api/routes/products.routes"));
const categories_routes_1 = __importDefault(require("./api/routes/categories.routes"));
const transactions_routes_1 = __importDefault(require("./api/routes/transactions.routes"));
const inventory_routes_1 = __importDefault(require("./api/routes/inventory.routes"));
const customers_routes_1 = __importDefault(require("./api/routes/customers.routes"));
const analytics_routes_1 = __importDefault(require("./api/routes/analytics.routes"));
const sync_routes_1 = __importDefault(require("./api/routes/sync.routes"));
const branches_routes_1 = __importDefault(require("./api/routes/branches.routes"));
const settings_routes_1 = __importDefault(require("./api/routes/settings.routes"));
const stores_routes_1 = __importDefault(require("./api/routes/stores.routes"));
const subscriptions_routes_1 = __importDefault(require("./api/routes/subscriptions.routes"));
const webhooks_routes_1 = __importDefault(require("./api/routes/webhooks.routes"));
const admin_subscriptions_routes_1 = __importDefault(require("./api/routes/admin-subscriptions.routes"));
const suppliers_routes_1 = __importDefault(require("./api/routes/suppliers.routes"));
const stock_counts_routes_1 = __importDefault(require("./api/routes/stock-counts.routes"));
const audit_routes_1 = __importDefault(require("./api/routes/audit.routes"));
const reports_routes_1 = __importDefault(require("./api/routes/reports.routes"));
const shifts_routes_1 = __importDefault(require("./api/routes/shifts.routes"));
// Fix BigInt serialization
BigInt.prototype.toJSON = function () { return this.toString(); };
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    // In development allow every origin — React Native doesn't enforce CORS
    // anyway (no browser sandbox), but this prevents Postman / browser
    // test-client blocks during local development.
    origin: isDev
        ? true
        : (process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']),
    credentials: true
}));
// Enable trust proxy so rate limiting works correctly behind Nginx/Cloudflare/Docker
const trustProxyEnv = process.env.TRUST_PROXY;
if (trustProxyEnv) {
    if (trustProxyEnv === 'true') {
        app.set('trust proxy', true);
    }
    else if (trustProxyEnv === 'false') {
        app.set('trust proxy', false);
    }
    else if (!isNaN(Number(trustProxyEnv))) {
        app.set('trust proxy', Number(trustProxyEnv));
    }
    else {
        app.set('trust proxy', trustProxyEnv);
    }
}
else if (!isDev) {
    // Default to trusting the immediate reverse proxy in production
    app.set('trust proxy', 1);
}
// Rate limiting
// In development raise the limits so hot-reloads and rapid testing don't trigger 429s.
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || (isDev ? '2000' : '1000'), 10);
app.set('trust proxy', 1);
const limiter = (0, express_rate_limit_1.default)({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Per-endpoint credential rate limiter is defined inside auth.routes.ts
// so it can be scoped to /login, /biometric-verify, and /register only.
app.use(limiter);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
// Serve product image uploads static folder
const uploadsDir = path_1.default.join(__dirname, '../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express_1.default.static(uploadsDir));
// Logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger_1.logger.info({
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: duration,
            ip: req.ip,
            userId: req.user?.id
        });
    });
    next();
});
// Health check endpoint (includes DB ping).
// Uses the shared Prisma client — instantiating a new one per request
// blows out the connection pool on shared Postgres hosts.
const prisma_1 = require("./lib/prisma");
app.get('/health', async (req, res) => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    }
    catch (err) {
        res.status(500).json({ status: 'error', db: 'disconnected', detail: err.message });
    }
});
app.get('/diagnose', async (req, res) => {
    try {
        const txCount = await prisma_1.prisma.transaction.count();
        const latestTx = await prisma_1.prisma.transaction.findFirst({
            orderBy: { created_at: 'desc' },
            select: { created_at: true, status: true, total_amount: true, store_id: true, branch_id: true, receipt_number: true }
        });
        const statusCounts = await prisma_1.prisma.$queryRaw `
      SELECT status, COUNT(*) as count FROM "Transaction" GROUP BY status
    `;
        const storeCounts = await prisma_1.prisma.$queryRaw `
      SELECT store_id, COUNT(*) as count FROM "Transaction" GROUP BY store_id
    `;
        const txByDate = await prisma_1.prisma.$queryRaw `
      SELECT DATE(created_at)::text as date, store_id, COUNT(*)::text as count, SUM(total_amount)::text as total
      FROM "Transaction"
      WHERE status = 'completed'
      GROUP BY DATE(created_at), store_id
      ORDER BY date DESC
      LIMIT 20
    `;
        const pgTimezone = await prisma_1.prisma.$queryRaw `
      SHOW timezone
    `;
        const dbNow = await prisma_1.prisma.$queryRaw `
      SELECT NOW() as now
    `;
        res.json({
            status: 'ok',
            txCount,
            latestTx,
            statusCounts,
            storeCounts,
            txByDate,
            pgTimezone,
            dbNow
        });
    }
    catch (err) {
        res.status(500).json({ status: 'error', detail: err.message });
    }
});
// API Routes
// authLimiter is applied per-route inside the router (login / register / biometric-verify),
// not to the entire /v1/auth prefix — that would throttle /auth/me and /auth/refresh-token
// which are called on every app launch and hot-reload.
app.use('/v1/auth', auth_routes_1.default);
app.use('/v1/products', products_routes_1.default);
app.use('/v1/categories', categories_routes_1.default);
app.use('/v1/transactions', transactions_routes_1.default);
app.use('/v1/inventory', inventory_routes_1.default);
app.use('/v1/customers', customers_routes_1.default);
app.use('/v1/analytics', analytics_routes_1.default);
app.use('/v1/sync', sync_routes_1.default);
app.use('/v1/branches', branches_routes_1.default);
app.use('/v1/settings', settings_routes_1.default);
app.use('/v1/stores', stores_routes_1.default);
app.use('/v1/subscriptions', subscriptions_routes_1.default);
app.use('/v1/webhooks', webhooks_routes_1.default);
app.use('/v1/admin', admin_subscriptions_routes_1.default);
app.use('/v1/suppliers', suppliers_routes_1.default);
app.use('/v1/stock-counts', stock_counts_routes_1.default);
app.use('/v1/audit', audit_routes_1.default);
app.use('/v1/reports', reports_routes_1.default);
app.use('/v1/shifts', shifts_routes_1.default);
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});
// Global error handler
app.use(errorHandler_1.errorHandler);
// ── Helper: collect non-loopback IPv4 addresses ──────────────
function getLanIPs() {
    const ips = [];
    for (const iface of Object.values(os_1.default.networkInterfaces())) {
        for (const info of iface ?? []) {
            if (info.family === 'IPv4' && !info.internal)
                ips.push(info.address);
        }
    }
    return ips;
}
// Start server — explicitly bind on 0.0.0.0 so every network interface
// (Wi-Fi, Ethernet, VPN) is reachable, not just loopback.
const server = app.listen(Number(PORT), '0.0.0.0', () => {
    const env = process.env.NODE_ENV || 'development';
    logger_1.logger.info(`🚀 Server running on port ${PORT} in ${env} mode`);
    const lanIPs = getLanIPs();
    if (lanIPs.length) {
        logger_1.logger.info('📱 Set EXPO_PUBLIC_API_URL in mobile/.env to one of:\n' +
            lanIPs.map(ip => `   http://${ip}:${PORT}/v1`).join('\n'));
    }
    else {
        logger_1.logger.info(`📱 EXPO_PUBLIC_API_URL=http://localhost:${PORT}/v1`);
    }
    // Initialize billing cron jobs
    (0, billingCron_1.initializeBillingCrons)();
    // Fix any existing negative stock in database
    prisma_1.prisma.inventory.updateMany({
        where: {
            quantity_on_hand: {
                lt: 0
            }
        },
        data: {
            quantity_on_hand: 0
        }
    }).then((res) => {
        if (res.count > 0) {
            logger_1.logger.info(`Auto-corrected ${res.count} inventory item(s) with negative stock to 0.`);
        }
    }).catch((err) => {
        logger_1.logger.error('Failed to auto-fix negative stock on startup:', err);
    });
});
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
// Prevent crashes from unhandled rejections
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error({
        event: 'unhandled_rejection',
        reason: reason?.message || reason
    });
});
process.on('uncaughtException', (error) => {
    logger_1.logger.error({
        event: 'uncaught_exception',
        message: error.message,
        stack: error.stack
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map