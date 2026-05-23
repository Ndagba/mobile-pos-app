import jwt from 'jsonwebtoken';
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
export declare class AuthService {
    static generateTokens(userId: string, email: string, role: string, storeId?: string | null, branchId?: string | null, isSuperAdmin?: boolean): {
        accessToken: string;
        refreshToken: string;
    };
    static biometricVerify(payload: BiometricVerifyPayload): Promise<LoginResponse>;
    static refreshAccessToken(refreshToken: string): Promise<{
        access_token: string;
        refresh_token: string;
    }>;
    static validateToken(token: string): Promise<string | jwt.JwtPayload>;
    static login(username: string, password: string): Promise<{
        access_token: string;
        refresh_token: string;
        user: {
            id: string;
            email: string;
            first_name: string;
            role: string;
            store_id: string;
            branch_id: string | null;
            branch_name: string | null;
            is_super_admin: boolean;
        };
    }>;
    static registerEmployee(username: string, email: string, firstName: string, lastName: string, role: 'cashier' | 'manager' | 'admin', storeId: string, password: string, branchId?: string | null): Promise<{
        id: string;
        email: string;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
        role: string;
        branch_id: string | null;
    }>;
    static setBiometricToken(userId: string, biometricTokenHash: string, deviceId: string): Promise<void>;
    private static logAudit;
    static resetUserPassword(targetUserId: string, newPassword: string, requesterId: string, requesterRole: string): Promise<{
        message: string;
    }>;
    static updateEmployeeRole(userId: string, newRole: 'admin' | 'manager' | 'cashier', updatedByUserId: string): Promise<{
        id: string;
        email: string;
        username: string | null;
        password_hash: string | null;
        phone: string | null;
        first_name: string | null;
        last_name: string | null;
        role: string;
        is_super_admin: boolean;
        biometric_token_hash: string | null;
        device_id: string | null;
        is_active: boolean;
        store_id: string;
        branch_id: string | null;
        last_login_at: Date | null;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
    }>;
    static deactivateUser(userId: string, reason: string): Promise<{
        id: string;
        email: string;
        username: string | null;
        password_hash: string | null;
        phone: string | null;
        first_name: string | null;
        last_name: string | null;
        role: string;
        is_super_admin: boolean;
        biometric_token_hash: string | null;
        device_id: string | null;
        is_active: boolean;
        store_id: string;
        branch_id: string | null;
        last_login_at: Date | null;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date | null;
    }>;
}
export {};
//# sourceMappingURL=AuthService.d.ts.map