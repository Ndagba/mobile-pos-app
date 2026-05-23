"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const os_1 = __importDefault(require("os"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./utils/errorHandler");
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
// Rate limiting
// In development raise the limits so hot-reloads and rapid testing don't trigger 429s.
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 2000 : 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Per-endpoint credential rate limiter is defined inside auth.routes.ts
// so it can be scoped to /login, /biometric-verify, and /register only.
app.use(limiter);
// Body parser middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
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
// Health check endpoint (includes DB ping)
app.get('/health', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const p = new PrismaClient();
        await p.$queryRaw `SELECT 1`;
        await p.$disconnect();
        res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    }
    catch (err) {
        res.status(500).json({ status: 'error', db: 'disconnected', detail: err.message });
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