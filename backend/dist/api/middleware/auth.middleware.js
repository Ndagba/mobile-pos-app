"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleMiddleware = exports.authMiddleware = void 0;
const AuthService_1 = require("../../services/AuthService");
const errorHandler_1 = require("../../utils/errorHandler");
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new errorHandler_1.AppError(401, 'No authorization token provided');
        }
        const decoded = await AuthService_1.AuthService.validateToken(token);
        req.user = decoded;
        next();
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            res.status(error.statusCode).json({
                status: 'error',
                message: error.message
            });
        }
        else {
            res.status(401).json({
                status: 'error',
                message: 'Invalid authorization token'
            });
        }
    }
};
exports.authMiddleware = authMiddleware;
const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        const userRole = req.user?.role;
        if (!userRole || !allowedRoles.includes(userRole)) {
            return res.status(403).json({
                status: 'error',
                message: 'Insufficient permissions'
            });
        }
        next();
    };
};
exports.roleMiddleware = roleMiddleware;
//# sourceMappingURL=auth.middleware.js.map