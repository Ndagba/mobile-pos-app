import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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
  };
}

export class AuthService {
  static generateTokens(userId: string, email: string, role: string) {
    const accessToken = jwt.sign(
      { userId, email, role },
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
          store_id: true
        }
      });

      if (!user) {
        throw new AppError(401, 'Invalid biometric credentials');
      }

      const { accessToken, refreshToken } = this.generateTokens(user.id, user.email, user.role);

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
        user
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
          is_active: true
        }
      });

      if (!user || !user.is_active) {
        throw new AppError(401, 'User not found or inactive');
      }

      const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(
        user.id,
        user.email,
        user.role
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

  static async registerEmployee(
    email: string,
    firstName: string,
    lastName: string,
    role: 'cashier' | 'manager' | 'admin',
    storeId: string
  ) {
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'Email already registered');
    }

    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        store_id: storeId,
        is_active: true
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        role: true
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
}
