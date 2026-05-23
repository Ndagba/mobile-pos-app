import { AuthService } from '../../src/services/AuthService';

const TEST_USER_ID = 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d';
const TEST_EMAIL = 'admin@store.com';

describe('AuthService', () => {
  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = AuthService.generateTokens(TEST_USER_ID, TEST_EMAIL, 'admin');
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const { accessToken } = AuthService.generateTokens(TEST_USER_ID, TEST_EMAIL, 'admin');
      const decoded = await AuthService.validateToken(accessToken);
      expect(decoded).toHaveProperty('userId', TEST_USER_ID);
      expect(decoded).toHaveProperty('email', TEST_EMAIL);
    });

    it('should throw on invalid token', async () => {
      await expect(AuthService.validateToken('invalid.token.here')).rejects.toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new tokens for valid refresh token', async () => {
      const { refreshToken } = AuthService.generateTokens(TEST_USER_ID, TEST_EMAIL, 'admin');
      const result = await AuthService.refreshAccessToken(refreshToken);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
    });

    it('should throw on invalid refresh token', async () => {
      await expect(AuthService.refreshAccessToken('bad_token')).rejects.toThrow();
    });
  });

  describe('resetPassword', () => {
    it('should return reset message for existing user', async () => {
      const result = await AuthService.resetPassword(TEST_EMAIL);
      expect(result).toHaveProperty('message');
    });

    it('should throw for non-existent email', async () => {
      await expect(AuthService.resetPassword('nobody@nowhere.com')).rejects.toThrow();
    });
  });

  describe('registerEmployee', () => {
    it('should throw if email already exists', async () => {
      await expect(
        AuthService.registerEmployee(TEST_EMAIL, 'Test', 'User', 'cashier', 'store_001')
      ).rejects.toThrow();
    });
  });

  describe('biometricVerify', () => {
    it('should authenticate with valid biometric credentials', async () => {
      const result = await AuthService.biometricVerify({
        biometric_token_hash: 'test_hash',
        device_id: 'test_device_setup'
      });
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result.user).toHaveProperty('email', 'admin@store.com');
    });

    it('should throw for invalid biometric credentials', async () => {
      await expect(
        AuthService.biometricVerify({
          biometric_token_hash: 'wrong_hash',
          device_id: 'wrong_device'
        })
      ).rejects.toThrow();
    });
  });

  describe('updateEmployeeRole', () => {
    beforeAll(async () => {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.user.update({
        where: { id: 'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d' },
        data: { is_active: true, role: 'admin' }
      });
      await prisma.$disconnect();
    });

    it('should update role when updater is admin', async () => {
      const newUser = await AuthService.registerEmployee(
        `role_test_${Date.now()}@example.com`,
        'Role',
        'Test',
        'cashier',
        'store_001'
      );
      const result = await AuthService.updateEmployeeRole(
        newUser.id,
        'manager',
        'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d'
      );
      expect(result).toHaveProperty('role', 'manager');
    });

    it('should throw if updater is not admin', async () => {
      const newUser = await AuthService.registerEmployee(
        `role_test2_${Date.now()}@example.com`,
        'Role',
        'Test2',
        'cashier',
        'store_001'
      );
      await expect(
        AuthService.updateEmployeeRole(
          'b5d2f8f9-cf71-4610-94f8-37d25f2eb27d',
          'cashier',
          newUser.id
        )
      ).rejects.toThrow();
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate a user', async () => {
      const newUser = await AuthService.registerEmployee(
        `test_${Date.now()}@example.com`,
        'Test',
        'User',
        'cashier',
        'store_001'
      );
      const result = await AuthService.deactivateUser(newUser.id, 'test deactivation');
      expect(result).toHaveProperty('is_active', false);
    });
  });
});