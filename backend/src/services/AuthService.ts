import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errorHandler';
import { logger } from '../utils/logger';


interface BiometricVerifyPayload {
  biometric_token_hash: string;
  device_id: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    role: string;
    store_id: string;
    branch_id: string | null;
    is_super_admin: boolean;
  };
}

export class AuthService {
  static generateTokens(
    userId: string,
    email: string,
    role: string,
    storeId?: string | null,
    branchId?: string | null,
    isSuperAdmin: boolean = false
  ) {
    const accessToken = jwt.sign(
      {
        userId,
        email,
        role,
        storeId: storeId ?? null,
        branchId: branchId ?? null,
        is_super_admin: !!isSuperAdmin
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId },
      process.env.REFRESH_TOKEN_SECRET || 'refresh-secret',
      { expiresIn: '7d' }
    );

    return { accessToken, refreshToken };
  }

  static async biometricVerify(payload: BiometricVerifyPayload): Promise<LoginResponse> {
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
        throw new AppError(401, 'Invalid biometric credentials');
      }

      const { accessToken, refreshToken } = this.generateTokens(
        user.id,
        user.email,
        user.role,
        user.store_id,
        user.branch_id,
        user.is_super_admin
      );

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

    } catch (error) {
      logger.error({
        event: 'biometric_auth_failed',
        device_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  static async refreshAccessToken(refreshToken: string) {
    try {
      const decoded: any = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET || 'refresh-secret'
      );

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
        throw new AppError(401, 'User not found or inactive');
      }

      const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(
        user.id,
        user.email,
        user.role,
        user.store_id,
        user.branch_id,
        user.is_super_admin
      );

      return {
        access_token: accessToken,
        refresh_token: newRefreshToken
      };
    } catch (error) {
      throw new AppError(401, 'Invalid or expired refresh token');
    }
  }

  static async validateToken(token: string) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'secret');
    } catch (error) {
      throw new AppError(401, 'Invalid or expired token');
    }
  }

  static async login(username: string, password: string) {
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
      throw new AppError(401, 'Invalid username or password');
    }
    if (!user.password_hash) {
      throw new AppError(401, 'No password set for this account. Ask your administrator to set one.');
    }

    const ok = await bcryptjs.compare(password, user.password_hash);
    if (!ok) {
      throw new AppError(401, 'Invalid username or password');
    }

    const { accessToken, refreshToken } = this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.store_id,
      user.branch_id,
      user.is_super_admin
    );

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

  static async registerEmployee(
    username: string,
    email: string,
    firstName: string,
    lastName: string,
    role: 'cashier' | 'manager' | 'admin',
    storeId: string,
    password: string,
    branchId?: string | null
  ) {
    const normalizedUsername = username.toLowerCase().trim();

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new AppError(409, 'Email already registered');
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username: normalizedUsername }
    });
    if (existingUsername) {
      throw new AppError(409, 'Username already taken');
    }

    const password_hash = await bcryptjs.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
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

  static async setBiometricToken(userId: string, biometricTokenHash: string, deviceId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        biometric_token_hash: biometricTokenHash,
        device_id: deviceId
      }
    });
  }

  private static async logAudit(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    changes?: any
  ) {
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

  static async resetUserPassword(
    targetUserId: string,
    newPassword: string,
    requesterId: string,
    requesterRole: string
  ) {
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      throw new AppError(403, 'Only admins/managers can reset passwords');
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new AppError(404, 'User not found');
    }

    const password_hash = await bcryptjs.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { password_hash }
    });

    await AuthService.logAudit(requesterId, 'RESET_PASSWORD', 'user', targetUserId, {});

    return { message: 'Password reset successfully' };
  }

  static async updateEmployeeRole(
    userId: string,
    newRole: 'admin' | 'manager' | 'cashier',
    updatedByUserId: string
  ) {
    const updater = await prisma.user.findUnique({
      where: { id: updatedByUserId }
    });

    if (updater?.role !== 'admin') {
      throw new AppError(403, 'Only admins can change roles');
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

  static async deactivateUser(userId: string, reason: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        is_active: false,
        deleted_at: new Date()
      }
    });
  }
}
