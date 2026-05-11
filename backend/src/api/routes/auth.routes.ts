import { Router, Request, Response } from 'express';
import { AuthService } from '../../services/AuthService';
import { authMiddleware } from '../middleware/auth.middleware';
import { catchAsync, AppError } from '../../utils/errorHandler';

const router = Router();

// Biometric verification
router.post(
  '/biometric-verify',
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
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { email, first_name, last_name, role, store_id } = req.body;
    const requesterRole = (req as any).user?.role;

    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      throw new AppError(403, 'Only admins/managers can register employees');
    }

    const user = await AuthService.registerEmployee(email, first_name, last_name, role, store_id);

    res.status(201).json({
      status: 'success',
      data: user,
      message: 'Employee registered successfully. Please set biometric authentication.'
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
