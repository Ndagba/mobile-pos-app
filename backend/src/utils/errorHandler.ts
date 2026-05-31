import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const errorHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (err instanceof AppError) {
    logger.error({
      event: 'app_error',
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method
    });

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(isDevelopment && { stack: err.stack })
    });
  }

  // Prisma unique-constraint violation (P2002) — translate to a clear 409 so
  // duplicate records never surface as a generic "Internal server error".
  if ((err as any)?.code === 'P2002') {
    const target = (err as any)?.meta?.target;
    const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'value');
    logger.error({
      event: 'unique_constraint_violation',
      target,
      path: req.path,
      method: req.method
    });
    return res.status(409).json({
      status: 'error',
      message: `A record with the same ${fields} already exists.`
    });
  }

  // Unknown error
  logger.error({
    event: 'unexpected_error',
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    ...(isDevelopment && { details: err.message })
  });
};

export const catchAsync = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
