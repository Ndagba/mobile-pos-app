export declare class InventoryService {
    static getInventoryStatus(storeId?: string): Promise<{
        product_id: string;
        product_name: string;
        sku: string;
        quantity_on_hand: bigint;
        quantity_reserved: bigint;
        available_quantity: bigint;
        low_stock_threshold: bigint;
        status: string;
    }[]>;
    static getLowStockAlerts(storeId?: string, branchId?: string | null): Promise<{
        product_id: any;
        product_name: any;
        sku: any;
        current_quantity: number;
        low_stock_threshold: number;
        reorder_point: number;
        alert_level: string;
    }[]>;
    static getExpiringBatches(daysUntilExpiry?: number): Promise<{
        batch_id: string;
        product_name: string;
        sku: string;
        batch_number: string;
        manufactured_date: Date;
        expiry_date: Date;
        quantity: bigint;
        days_until_expiry: number;
        urgency: string;
    }[]>;
    static updateStock(productId: string, quantity: number, reason: string): Promise<{
        id: string;
        created_at: Date;
        updated_at: Date;
        product_id: string;
        quantity_on_hand: bigint;
        quantity_reserved: bigint;
        low_stock_threshold: bigint;
        reorder_point: bigint;
        last_stock_check: Date | null;
    }>;
    static updateThreshold(productId: string, threshold: number): Promise<{
        id: string;
        created_at: Date;
        updated_at: Date;
        product_id: string;
        quantity_on_hand: bigint;
        quantity_reserved: bigint;
        low_stock_threshold: bigint;
        reorder_point: bigint;
        last_stock_check: Date | null;
    }>;
    static createBatch(productId: string, batchNumber: string, manufacturedDate: Date, expiryDate: Date, quantity: number, warehouseLocation?: string): Promise<{
        id: string;
        created_at: Date;
        product_id: string;
        quantity: bigint;
        batch_number: string;
        manufactured_date: Date;
        expiry_date: Date;
        warehouse_location: string | null;
        is_expired: boolean;
    }>;
    static markBatchExpired(batchId: string): Promise<{
        id: string;
        created_at: Date;
        product_id: string;
        quantity: bigint;
        batch_number: string;
        manufactured_date: Date;
        expiry_date: Date;
        warehouse_location: string | null;
        is_expired: boolean;
    }>;
    static getInventoryTurnover(storeId: string, dateFrom: Date, dateTo: Date): Promise<unknown>;
}
//# sourceMappingURL=InventoryService.d.ts.map