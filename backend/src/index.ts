import express, { Express, Request, Response, NextFunction } from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { errorHandler } from './utils/errorHandler';
import { initializeBillingCrons } from './jobs/billingCron';

// Route imports
import authRoutes from './api/routes/auth.routes';
import productRoutes from './api/routes/products.routes';
import categoryRoutes from './api/routes/categories.routes';
import transactionRoutes from './api/routes/transactions.routes';
import inventoryRoutes from './api/routes/inventory.routes';
import customerRoutes from './api/routes/customers.routes';
import analyticsRoutes from './api/routes/analytics.routes';
import syncRoutes from './api/routes/sync.routes';
import branchRoutes from './api/routes/branches.routes';
import settingsRoutes from './api/routes/settings.routes';
import storesRoutes from './api/routes/stores.routes';
import subscriptionsRoutes from './api/routes/subscriptions.routes';
import webhooksRoutes from './api/routes/webhooks.routes';
import adminSubscriptionsRoutes from './api/routes/admin-subscriptions.routes';
import supplierRoutes from './api/routes/suppliers.routes';
import stockCountRoutes from './api/routes/stock-counts.routes';
import auditRoutes from './api/routes/audit.routes';
import reportsRoutes from './api/routes/reports.routes';
import shiftsRoutes from './api/routes/shifts.routes';


// Fix BigInt serialization
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Security middleware
app.use(helmet());
app.use(cors({
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
  } else if (trustProxyEnv === 'false') {
    app.set('trust proxy', false);
  } else if (!isNaN(Number(trustProxyEnv))) {
    app.set('trust proxy', Number(trustProxyEnv));
  } else {
    app.set('trust proxy', trustProxyEnv);
  }
} else if (!isDev) {
  // Default to trusting the immediate reverse proxy in production
  app.set('trust proxy', 1);
}

// Rate limiting
// In development raise the limits so hot-reloads and rapid testing don't trigger 429s.
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const rateLimitMax = parseInt(
  process.env.RATE_LIMIT_MAX || (isDev ? '2000' : '1000'),
  10
);

app.set('trust proxy', 1);

const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-endpoint credential rate limiter is defined inside auth.routes.ts
// so it can be scoped to /login, /biometric-verify, and /register only.

app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve product image uploads static folder
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip,
      userId: (req as any).user?.id
    });
  });
  next();
});

// Health check endpoint (includes DB ping).
// Uses the shared Prisma client — instantiating a new one per request
// blows out the connection pool on shared Postgres hosts.
import { prisma as healthPrisma } from './lib/prisma';
app.get('/health', async (req: Request, res: Response) => {
  try {
    await healthPrisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', db: 'disconnected', detail: err.message });
  }
});

app.get('/diagnose', async (req, res) => {
  try {
    const txCount = await healthPrisma.transaction.count();
    const latestTx = await healthPrisma.transaction.findFirst({
      orderBy: { created_at: 'desc' },
      select: { created_at: true, status: true, total_amount: true, store_id: true, branch_id: true, receipt_number: true }
    });
    const statusCounts = await healthPrisma.$queryRaw`
      SELECT status, COUNT(*) as count FROM "Transaction" GROUP BY status
    `;
    const storeCounts = await healthPrisma.$queryRaw`
      SELECT store_id, COUNT(*) as count FROM "Transaction" GROUP BY store_id
    `;
    const txByDate = await healthPrisma.$queryRaw`
      SELECT DATE(created_at)::text as date, store_id, COUNT(*)::text as count, SUM(total_amount)::text as total
      FROM "Transaction"
      WHERE status = 'completed'
      GROUP BY DATE(created_at), store_id
      ORDER BY date DESC
      LIMIT 20
    `;
    const pgTimezone = await healthPrisma.$queryRaw`
      SHOW timezone
    `;
    const dbNow = await healthPrisma.$queryRaw`
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
  } catch (err: any) {
    res.status(500).json({ status: 'error', detail: err.message });
  }
});

// API Routes
// authLimiter is applied per-route inside the router (login / register / biometric-verify),
// not to the entire /v1/auth prefix — that would throttle /auth/me and /auth/refresh-token
// which are called on every app launch and hot-reload.
app.use('/v1/auth', authRoutes);
app.use('/v1/products', productRoutes);
app.use('/v1/categories', categoryRoutes);
app.use('/v1/transactions', transactionRoutes);
app.use('/v1/inventory', inventoryRoutes);
app.use('/v1/customers', customerRoutes);
app.use('/v1/analytics', analyticsRoutes);
app.use('/v1/sync', syncRoutes);
app.use('/v1/branches', branchRoutes);
app.use('/v1/settings', settingsRoutes);
app.use('/v1/stores', storesRoutes);
app.use('/v1/subscriptions', subscriptionsRoutes);
app.use('/v1/webhooks', webhooksRoutes);
app.use('/v1/admin', adminSubscriptionsRoutes);
app.use('/v1/suppliers', supplierRoutes);
app.use('/v1/stock-counts', stockCountRoutes);
app.use('/v1/audit', auditRoutes);
app.use('/v1/reports', reportsRoutes);
app.use('/v1/shifts', shiftsRoutes);


// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use(errorHandler);

// ── Helper: collect non-loopback IPv4 addresses ──────────────
function getLanIPs(): string[] {
  const ips: string[] = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) ips.push(info.address);
    }
  }
  return ips;
}

// Start server — explicitly bind on 0.0.0.0 so every network interface
// (Wi-Fi, Ethernet, VPN) is reachable, not just loopback.
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  const env = process.env.NODE_ENV || 'development';
  logger.info(`🚀 Server running on port ${PORT} in ${env} mode`);

  const lanIPs = getLanIPs();
  if (lanIPs.length) {
    logger.info(
      '📱 Set EXPO_PUBLIC_API_URL in mobile/.env to one of:\n' +
      lanIPs.map(ip => `   http://${ip}:${PORT}/v1`).join('\n')
    );
  } else {
    logger.info(`📱 EXPO_PUBLIC_API_URL=http://localhost:${PORT}/v1`);
  }

  // Initialize billing cron jobs
  initializeBillingCrons();

  // Fix any existing negative stock in database
  healthPrisma.inventory.updateMany({
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
      logger.info(`Auto-corrected ${res.count} inventory item(s) with negative stock to 0.`);
    }
  }).catch((err) => {
    logger.error('Failed to auto-fix negative stock on startup:', err);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Prevent crashes from unhandled rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error({
    event: 'unhandled_rejection',
    reason: reason?.message || reason
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error({
    event: 'uncaught_exception',
    message: error.message,
    stack: error.stack
  });
});

export default app;
