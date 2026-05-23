interface TransactionItemInput {
    product_id: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    discount_amount?: number;
    line_total: number;
    batch_id?: string;
}
interface CreateTransactionInput {
    store_id: string;
    branch_id: string;
    user_id: string;
    customer_id?: string;
    offline_session_hash: string;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    total_amount: number;
    payment_method: 'cash' | 'card' | 'mobile_wallet';
    items: TransactionItemInput[];
}
export declare class TransactionService {
    static createTransaction(input: CreateTransactionInput): Promise<{
        id: string;
        store_id: string;
        branch_id: string;
        created_at: Date;
        updated_at: Date;
        user_id: string;
        customer_id: string | null;
        offline_session_hash: string | null;
        is_sync_online: boolean;
        synced_at: Date | null;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        tax_amount: import("@prisma/client/runtime/library").Decimal;
        discount_amount: import("@prisma/client/runtime/library").Decimal;
        total_amount: import("@prisma/client/runtime/library").Decimal;
        payment_method: string;
        payment_status: string;
        payment_reference: string | null;
        receipt_number: string | null;
        receipt_url: string | null;
        status: string;
        void_reason: string | null;
        voided_at: Date | null;
        voided_by: string | null;
    }>;
    static batchSyncTransactions(transactions: CreateTransactionInput[]): Promise<{
        results: {
            offline_session_hash: string;
            transaction_id: string;
            status: string;
        }[];
        errors: {
            offline_session_hash: string;
            error: string;
            status: string;
        }[];
    }>;
    static getTransactionById(transactionId: string): Promise<{
        user: {
            id: string;
            email: string;
            first_name: string | null;
        };
        customer: {
            id: string;
            phone: string | null;
            first_name: string | null;
        } | null;
        transaction_items: ({
            product: {
                name: string;
                sku: string;
            };
        } & {
            id: string;
            created_at: Date;
            tax_amount: import("@prisma/client/runtime/library").Decimal;
            discount_amount: import("@prisma/client/runtime/library").Decimal;
            product_id: string;
            transaction_id: string;
            quantity: number;
            unit_price: import("@prisma/client/runtime/library").Decimal;
            line_total: import("@prisma/client/runtime/library").Decimal;
            batch_id: string | null;
        })[];
    } & {
        id: string;
        store_id: string;
        branch_id: string;
        created_at: Date;
        updated_at: Date;
        user_id: string;
        customer_id: string | null;
        offline_session_hash: string | null;
        is_sync_online: boolean;
        synced_at: Date | null;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        tax_amount: import("@prisma/client/runtime/library").Decimal;
        discount_amount: import("@prisma/client/runtime/library").Decimal;
        total_amount: import("@prisma/client/runtime/library").Decimal;
        payment_method: string;
        payment_status: string;
        payment_reference: string | null;
        receipt_number: string | null;
        receipt_url: string | null;
        status: string;
        void_reason: string | null;
        voided_at: Date | null;
        voided_by: string | null;
    }>;
    static getStoreTransactions(storeId: string, limit?: number, offset?: number, filters?: {
        dateFrom?: Date;
        dateTo?: Date;
        paymentMethod?: string;
        status?: string;
    }): Promise<{
        data: {
            item_count: number;
            user: {
                first_name: string | null;
            };
            _count: {
                transaction_items: number;
            };
            customer: {
                phone: string | null;
                first_name: string | null;
            } | null;
            id: string;
            store_id: string;
            branch_id: string;
            created_at: Date;
            updated_at: Date;
            user_id: string;
            customer_id: string | null;
            offline_session_hash: string | null;
            is_sync_online: boolean;
            synced_at: Date | null;
            subtotal: import("@prisma/client/runtime/library").Decimal;
            tax_amount: import("@prisma/client/runtime/library").Decimal;
            discount_amount: import("@prisma/client/runtime/library").Decimal;
            total_amount: import("@prisma/client/runtime/library").Decimal;
            payment_method: string;
            payment_status: string;
            payment_reference: string | null;
            receipt_number: string | null;
            receipt_url: string | null;
            status: string;
            void_reason: string | null;
            voided_at: Date | null;
            voided_by: string | null;
        }[];
        pagination: {
            limit: number;
            offset: number;
            total: number;
            pages: number;
        };
    }>;
    static voidTransaction(transactionId: string, voidReason: string, voidedByUserId: string): Promise<{
        status: string;
        transaction_id: string;
    }>;
    static refundTransaction(transactionId: string, reason: string, refundedByUserId: string): Promise<{
        status: string;
        transaction_id: string;
    }>;
    static generateOfflineSessionHash(deviceId: string, transactionId: string, timestamp: number): string;
    static getByOfflineHash(offlineSessionHash: string): Promise<({
        transaction_items: {
            id: string;
            created_at: Date;
            tax_amount: import("@prisma/client/runtime/library").Decimal;
            discount_amount: import("@prisma/client/runtime/library").Decimal;
            product_id: string;
            transaction_id: string;
            quantity: number;
            unit_price: import("@prisma/client/runtime/library").Decimal;
            line_total: import("@prisma/client/runtime/library").Decimal;
            batch_id: string | null;
        }[];
    } & {
        id: string;
        store_id: string;
        branch_id: string;
        created_at: Date;
        updated_at: Date;
        user_id: string;
        customer_id: string | null;
        offline_session_hash: string | null;
        is_sync_online: boolean;
        synced_at: Date | null;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        tax_amount: import("@prisma/client/runtime/library").Decimal;
        discount_amount: import("@prisma/client/runtime/library").Decimal;
        total_amount: import("@prisma/client/runtime/library").Decimal;
        payment_method: string;
        payment_status: string;
        payment_reference: string | null;
        receipt_number: string | null;
        receipt_url: string | null;
        status: string;
        void_reason: string | null;
        voided_at: Date | null;
        voided_by: string | null;
    }) | null>;
    static getStoreDailySummary(storeId: string, date: Date): Promise<{
        transaction_count: number;
        total_revenue: number | import("@prisma/client/runtime/library").Decimal;
        average_transaction: number;
    }>;
    static exportTransactions(storeId: string, dateFrom: Date, dateTo: Date, format?: 'csv' | 'json'): Promise<({
        user: {
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
        };
        transaction_items: {
            id: string;
            created_at: Date;
            tax_amount: import("@prisma/client/runtime/library").Decimal;
            discount_amount: import("@prisma/client/runtime/library").Decimal;
            product_id: string;
            transaction_id: string;
            quantity: number;
            unit_price: import("@prisma/client/runtime/library").Decimal;
            line_total: import("@prisma/client/runtime/library").Decimal;
            batch_id: string | null;
        }[];
    } & {
        id: string;
        store_id: string;
        branch_id: string;
        created_at: Date;
        updated_at: Date;
        user_id: string;
        customer_id: string | null;
        offline_session_hash: string | null;
        is_sync_online: boolean;
        synced_at: Date | null;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        tax_amount: import("@prisma/client/runtime/library").Decimal;
        discount_amount: import("@prisma/client/runtime/library").Decimal;
        total_amount: import("@prisma/client/runtime/library").Decimal;
        payment_method: string;
        payment_status: string;
        payment_reference: string | null;
        receipt_number: string | null;
        receipt_url: string | null;
        status: string;
        void_reason: string | null;
        voided_at: Date | null;
        voided_by: string | null;
    })[] | (string | number | import("@prisma/client/runtime/library").Decimal)[][]>;
}
export {};
//# sourceMappingURL=TransactionService.d.ts.map