"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../utils/errorHandler");
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
class AuthService {
    static generateTokens(userId, email, role, storeId, branchId, isSuperAdmin = false) {
        const accessToken = jsonwebtoken_1.default.sign({
            userId,
            email,
            role,
            storeId: storeId ?? null,
            branchId: branchId ?? null,
            is_super_admin: !!isSuperAdmin
        }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });
        const refreshToken = jsonwebtoken_1.default.sign({ userId }, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret', { expiresIn: '7d' });
        return { accessToken, refreshToken };
    }
    static async biometricVerify(payload) {
        const { biometric_token_hash, device_id } = payload;
        try {
            const user = await prisma.user.findFirst({
                where: {
                    biometric_token_hash,
                    device_id,
                    is_active: true
                },
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    role: true,
                    store_id: true,
                    branch_id: true,
                    is_super_admin: true
                }
            });
            if (!user) {
                throw new errorHandler_1.AppError(401, 'Invalid biometric credentials');
            }
            const { accessToken, refreshToken } = this.generateTokens(user.id, user.email, user.role, user.store_id, user.branch_id, user.is_super_admin);
            // Update last login
            await prisma.user.update({
                where: { id: user.id },
                data: { last_login_at: new Date() }
            });
            // Log audit
            await this.logAudit(user.id, 'LOGIN', 'user', user.id, {
                device_id,
                method: 'biometric'
            });
            return {
                access_token: accessToken,
                refresh_token: refreshToken,
                user: {
                    id: user.id,
                    email: user.email,
                    first_name: user.first_name ?? '',
                    role: user.role,
                    store_id: user.store_id,
                    branch_id: user.branch_id ?? null,
                    is_super_admin: user.is_super_admin
                }
            };
        }
        catch (error) {
            logger_1.logger.error({
                event: 'biometric_auth_failed',
                device_id,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }
    static async refreshAccessToken(refreshToken) {
        try {
            const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh-secret');
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: {
                    id: true,
                    email: true,
                    first_name: true,
                    role: true,
                    store_id: true,
                    branch_id: true,
                    is_active: true,
                    is_super_admin: true
                }
            });
            if (!user || !user.is_active) {
                throw new errorHandler_1.AppError(401, 'User not found or inactive');
            }
            const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user.id, user.email, user.role, user.store_id, user.branch_id, user.is_super_admin);
            return {
                access_token: accessToken,
                refresh_token: newRefreshToken
            };
        }
        catch (error) {
            throw new errorHandler_1.AppError(401, 'Invalid or expired refresh token');
        }
    }
    static async validateToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'secret');
        }
        catch (error) {
            throw new errorHandler_1.AppError(401, 'Invalid or expired token');
        }
    }
    static async login(username, password) {
        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase().trim() },
            select: {
                id: true,
                email: true,
                first_name: true,
                role: true,
                store_id: true,
                branch_id: true,
                is_active: true,
                is_super_admin: true,
                password_hash: true,
                branch: { select: { name: true } }
            }
        });
        if (!user || !user.is_active) {
            throw new errorHandler_1.AppError(401, 'Invalid username or password');
        }
        if (!user.password_hash) {
            throw new errorHandler_1.AppError(401, 'No password set for this account. Ask your administrator to set one.');
        }
        const ok = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!ok) {
            throw new errorHandler_1.AppError(401, 'Invalid username or password');
        }
        const { accessToken, refreshToken } = this.generateTokens(user.id, user.email, user.role, user.store_id, user.branch_id, user.is_super_admin);
        await prisma.user.update({
            where: { id: user.id },
            data: { last_login_at: new Date() }
        });
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name ?? '',
                role: user.role,
                store_id: user.store_id,
                branch_id: user.branch_id ?? null,
                branch_name: user.branch?.name ?? null,
                is_super_admin: user.is_super_admin
            }
        };
    }
    static async registerEmployee(username, email, firstName, lastName, role, storeId, password, branchId) {
        const normalizedUsername = username.toLowerCase().trim();
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
            throw new errorHandler_1.AppError(409, 'Email already registered');
        }
        const existingUsername = await prisma.user.findUnique({
            where: { username: normalizedUsername }
        });
        if (existingUsername) {
            throw new errorHandler_1.AppError(409, 'Username already taken');
        }
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                id: (0, uuid_1.v4)(),
                email,
                username: normalizedUsername,
                password_hash,
                first_name: firstName,
                last_name: lastName,
                role,
                store_id: storeId,
                branch_id: branchId ?? null,
                is_active: true
            },
            select: {
                id: true,
                email: true,
                username: true,
                first_name: true,
                last_name: true,
                role: true,
                branch_id: true
            }
        });
        return user;
    }
    static async setBiometricToken(userId, biometricTokenHash, deviceId) {
        await prisma.user.update({
            where: { id: userId },
            data: {
                biometric_token_hash: biometricTokenHash,
                device_id: deviceId
            }
        });
    }
    static async logAudit(userId, action, resourceType, resourceId, changes) {
        await prisma.auditLog.create({
            data: {
                user_id: userId,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                changes: changes || {}
            }
        });
    }
    static async resetUserPassword(targetUserId, newPassword, requesterId, requesterRole) {
        if (requesterRole !== 'admin' && requesterRole !== 'manager') {
            throw new errorHandler_1.AppError(403, 'Only admins/managers can reset passwords');
        }
        const target = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!target) {
            throw new errorHandler_1.AppError(404, 'User not found');
        }
        const password_hash = await bcryptjs_1.default.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: targetUserId },
            data: { password_hash }
        });
        await AuthService.logAudit(requesterId, 'RESET_PASSWORD', 'user', targetUserId, {});
        return { message: 'Password reset successfully' };
    }
    static async updateEmployeeRole(userId, newRole, updatedByUserId) {
        const updater = await prisma.user.findUnique({
            where: { id: updatedByUserId }
        });
        if (updater?.role !== 'admin') {
            throw new errorHandler_1.AppError(403, 'Only admins can change roles');
        }
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { role: newRole }
        });
        await AuthService.logAudit(updatedByUserId, 'UPDATE_USER_ROLE', 'user', userId, {
            old_role: updater?.role,
            new_role: newRole
        });
        return updated;
    }
    static async deactivateUser(userId, reason) {
        return prisma.user.update({
            where: { id: userId },
            data: {
                is_active: false,
                deleted_at: new Date()
            }
        });
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map