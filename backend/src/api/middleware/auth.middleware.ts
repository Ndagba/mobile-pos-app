import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../services/AuthService';
import { AppError } from '../../utils/errorHandler';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new AppError(401, 'No authorization token provided');
    }

    const decoded = AuthService.validateToken(token);
    (req as any).user = decoded;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        status: 'error',
        message: error.message
      });
    } else {
      res.status(401).json({
        status: 'error',
        message: 'Invalid authorization token'
      });
    }
  }
};

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};
