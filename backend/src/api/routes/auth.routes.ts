import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../../services/AuthService';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

// Brute-force protection for credential endpoints only.
// Raised limits in dev so hot-reloads and retries don't cause 429s.
const isDev = process.env.NODE_ENV !== 'production';
const authRateLimitWindowMs = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10);
const authRateLimitMax = parseInt(
  process.env.AUTH_RATE_LIMIT_MAX || (isDev ? '200' : '50'),
  10
);

const credentialLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  max: authRateLimitMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many attempts. Please wait 15 minutes and try again.' },
});

// ── Username + password login ─────────────────────────────────
router.post(
  '/login',
  credentialLimiter,
  catchAsync(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new AppError(400, 'username and password are required');
    }

    const result = await AuthService.login(username, password);

    res.json({
      status: 'success',
      data: result
    });
  })
);

// ── Biometric verification ─────────────────────────────────────
router.post(
  '/biometric-verify',
  credentialLimiter,
  catchAsync(async (req: Request, res: Response) => {
    const { biometric_token_hash, device_id } = req.body;

    if (!biometric_token_hash || !device_id) {
      throw new AppError(400, 'biometric_token_hash and device_id are required');
    }

    const result = await AuthService.biometricVerify({
      biometric_token_hash,
      device_id
    });

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Refresh token
router.post(
  '/refresh-token',
  catchAsync(async (req: Request, res: Response) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      throw new AppError(400, 'refresh_token is required');
    }

    const result = await AuthService.refreshAccessToken(refresh_token);

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Get current user
router.get(
  '/me',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;

    res.json({
      status: 'success',
      data: user
    });
  })
);

// Register employee (admin only)
router.post(
  '/register',
  credentialLimiter,
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { username, email, first_name, last_name, role, store_id, branch_id, password } = req.body;
    const requesterRole = (req as any).user?.role;

    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      throw new AppError(403, 'Only admins/managers can register employees');
    }

    if (!username || !password) {
      throw new AppError(400, 'username and password are required');
    }
    if (String(password).length < 6) {
      throw new AppError(400, 'Password must be at least 6 characters');
    }

    const user = await AuthService.registerEmployee(
      username,
      email,
      first_name,
      last_name,
      role,
      store_id,
      password,
      branch_id
    );

    res.status(201).json({
      status: 'success',
      data: user,
      message: 'Employee registered successfully.'
    });
  })
);

// Update employee role (admin only)
router.patch(
  '/users/:id',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { role } = req.body;
    const requesterId: string = (req as any).user?.userId;
    const requesterRole: string = (req as any).user?.role;

    if (requesterRole !== 'admin') {
      throw new AppError(403, 'Admin access required');
    }

    if (!['admin', 'manager', 'cashier'].includes(role)) {
      throw new AppError(400, 'Invalid role — must be admin, manager, or cashier');
    }

    const updated = await AuthService.updateEmployeeRole(req.params.id, role, requesterId);

    res.json({
      status: 'success',
      data: {
        id: updated.id,
        first_name: updated.first_name,
        role: updated.role
      }
    });
  })
);

// Deactivate employee (admin only)
router.patch(
  '/users/:id/deactivate',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const requesterId: string = (req as any).user?.userId;
    const requesterRole: string = (req as any).user?.role;

    if (requesterRole !== 'admin') {
      throw new AppError(403, 'Admin access required');
    }

    if (req.params.id === requesterId) {
      throw new AppError(400, 'You cannot deactivate your own account');
    }

    await AuthService.deactivateUser(req.params.id, 'Deactivated by admin');

    res.json({
      status: 'success',
      data: { message: 'User deactivated successfully' }
    });
  })
);

// Reset a user's password (admin/manager only)
router.patch(
  '/users/:id/reset-password',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { password } = req.body;
    const requesterId: string = (req as any).user?.userId;
    const requesterRole: string = (req as any).user?.role;

    if (!password || String(password).length < 6) {
      throw new AppError(400, 'Password must be at least 6 characters');
    }

    const result = await AuthService.resetUserPassword(
      req.params.id,
      password,
      requesterId,
      requesterRole
    );

    res.json({
      status: 'success',
      data: result
    });
  })
);

// Set biometric token
router.post(
  '/set-biometric',
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { biometric_token_hash, device_id } = req.body;
    const userId = (req as any).user?.userId;

    if (!biometric_token_hash || !device_id) {
      throw new AppError(400, 'biometric_token_hash and device_id are required');
    }

    await AuthService.setBiometricToken(userId, biometric_token_hash, device_id);

    res.json({
      status: 'success',
      message: 'Biometric authentication configured'
    });
  })
);

export default router;
