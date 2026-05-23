"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const AuthService_1 = require("../../services/AuthService");
const auth_middleware_1 = require("../middleware/auth.middleware");
const errorHandler_1 = require("../../utils/errorHandler");
const router = (0, express_1.Router)();
// Brute-force protection for credential endpoints only.
// Raised limits in dev so hot-reloads and retries don't cause 429s.
const isDev = process.env.NODE_ENV !== 'production';
const credentialLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 200 : 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', message: 'Too many attempts. Please wait 15 minutes and try again.' },
});
// ── Username + password login ─────────────────────────────────
router.post('/login', credentialLimiter, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        throw new errorHandler_1.AppError(400, 'username and password are required');
    }
    const result = await AuthService_1.AuthService.login(username, password);
    res.json({
        status: 'success',
        data: result
    });
}));
// ── Biometric verification ─────────────────────────────────────
router.post('/biometric-verify', credentialLimiter, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { biometric_token_hash, device_id } = req.body;
    if (!biometric_token_hash || !device_id) {
        throw new errorHandler_1.AppError(400, 'biometric_token_hash and device_id are required');
    }
    const result = await AuthService_1.AuthService.biometricVerify({
        biometric_token_hash,
        device_id
    });
    res.json({
        status: 'success',
        data: result
    });
}));
// Refresh token
router.post('/refresh-token', (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        throw new errorHandler_1.AppError(400, 'refresh_token is required');
    }
    const result = await AuthService_1.AuthService.refreshAccessToken(refresh_token);
    res.json({
        status: 'success',
        data: result
    });
}));
// Get current user
router.get('/me', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const user = req.user;
    res.json({
        status: 'success',
        data: user
    });
}));
// Register employee (admin only)
router.post('/register', credentialLimiter, auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { username, email, first_name, last_name, role, store_id, branch_id, password } = req.body;
    const requesterRole = req.user?.role;
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
        throw new errorHandler_1.AppError(403, 'Only admins/managers can register employees');
    }
    if (!username || !password) {
        throw new errorHandler_1.AppError(400, 'username and password are required');
    }
    if (String(password).length < 6) {
        throw new errorHandler_1.AppError(400, 'Password must be at least 6 characters');
    }
    const user = await AuthService_1.AuthService.registerEmployee(username, email, first_name, last_name, role, store_id, password, branch_id);
    res.status(201).json({
        status: 'success',
        data: user,
        message: 'Employee registered successfully.'
    });
}));
// Update employee role (admin only)
router.patch('/users/:id', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { role } = req.body;
    const requesterId = req.user?.userId;
    const requesterRole = req.user?.role;
    if (requesterRole !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Admin access required');
    }
    if (!['admin', 'manager', 'cashier'].includes(role)) {
        throw new errorHandler_1.AppError(400, 'Invalid role — must be admin, manager, or cashier');
    }
    const updated = await AuthService_1.AuthService.updateEmployeeRole(req.params.id, role, requesterId);
    res.json({
        status: 'success',
        data: {
            id: updated.id,
            first_name: updated.first_name,
            role: updated.role
        }
    });
}));
// Deactivate employee (admin only)
router.patch('/users/:id/deactivate', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const requesterId = req.user?.userId;
    const requesterRole = req.user?.role;
    if (requesterRole !== 'admin') {
        throw new errorHandler_1.AppError(403, 'Admin access required');
    }
    if (req.params.id === requesterId) {
        throw new errorHandler_1.AppError(400, 'You cannot deactivate your own account');
    }
    await AuthService_1.AuthService.deactivateUser(req.params.id, 'Deactivated by admin');
    res.json({
        status: 'success',
        data: { message: 'User deactivated successfully' }
    });
}));
// Reset a user's password (admin/manager only)
router.patch('/users/:id/reset-password', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { password } = req.body;
    const requesterId = req.user?.userId;
    const requesterRole = req.user?.role;
    if (!password || String(password).length < 6) {
        throw new errorHandler_1.AppError(400, 'Password must be at least 6 characters');
    }
    const result = await AuthService_1.AuthService.resetUserPassword(req.params.id, password, requesterId, requesterRole);
    res.json({
        status: 'success',
        data: result
    });
}));
// Set biometric token
router.post('/set-biometric', auth_middleware_1.authMiddleware, (0, errorHandler_1.catchAsync)(async (req, res) => {
    const { biometric_token_hash, device_id } = req.body;
    const userId = req.user?.userId;
    if (!biometric_token_hash || !device_id) {
        throw new errorHandler_1.AppError(400, 'biometric_token_hash and device_id are required');
    }
    await AuthService_1.AuthService.setBiometricToken(userId, biometric_token_hash, device_id);
    res.json({
        status: 'success',
        message: 'Biometric authentication configured'
    });
}));
exports.default = router;
//# sourceMappingURL=auth.routes.js.map