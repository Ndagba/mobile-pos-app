"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catchAsync = exports.errorHandler = exports.AppError = void 0;
const logger_1 = require("./logger");
class AppError extends Error {
    constructor(statusCode, message, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
const errorHandler = (err, req, res, next) => {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (err instanceof AppError) {
        logger_1.logger.error({
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
    if (err?.code === 'P2002') {
        const target = err?.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'value');
        logger_1.logger.error({
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
    logger_1.logger.error({
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
exports.errorHandler = errorHandler;
const catchAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.catchAsync = catchAsync;
//# sourceMappingURL=errorHandler.js.map