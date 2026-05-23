-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "biometric_token_hash" TEXT,
    "device_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "store_id" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "marked_price" DECIMAL(12,2) NOT NULL,
    "effective_price" DECIMAL(12,2) NOT NULL,
    "cost_price" DECIMAL(12,2),
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "image_url" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_on_hand" BIGINT NOT NULL DEFAULT 0,
    "quantity_reserved" BIGINT NOT NULL DEFAULT 0,
    "low_stock_threshold" BIGINT NOT NULL DEFAULT 10,
    "reorder_point" BIGINT NOT NULL DEFAULT 20,
    "last_stock_check" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchTracking" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "manufactured_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "quantity" BIGINT NOT NULL,
    "warehouse_location" TEXT,
    "is_expired" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "date_of_birth" DATE,
    "loyalty_points" BIGINT NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "last_transaction_at" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "offline_session_hash" TEXT,
    "is_sync_online" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3),
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "payment_reference" TEXT,
    "receipt_number" TEXT,
    "receipt_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionItem" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(15,2) NOT NULL,
    "batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineSyncQueue" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "offline_session_hash" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL DEFAULT 'create',
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3),

    CONSTRAINT "OfflineSyncQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "changes" JSONB,
    "ip_address" TEXT,
    "device_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAnalytics" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "total_transactions" INTEGER NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_items_sold" BIGINT NOT NULL DEFAULT 0,
    "avg_transaction_value" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "top_products" JSONB,
    "payment_breakdown" JSONB,
    "employee_performance" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_biometric_token_hash_key" ON "User"("biometric_token_hash");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_device_id_idx" ON "User"("device_id");

-- CreateIndex
CREATE INDEX "User_store_id_idx" ON "User"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Category_is_active_idx" ON "Category"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_category_id_idx" ON "Product"("category_id");

-- CreateIndex
CREATE INDEX "Product_is_active_idx" ON "Product"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_product_id_key" ON "Inventory"("product_id");

-- CreateIndex
CREATE INDEX "Inventory_product_id_idx" ON "Inventory"("product_id");

-- CreateIndex
CREATE INDEX "BatchTracking_expiry_date_idx" ON "BatchTracking"("expiry_date");

-- CreateIndex
CREATE INDEX "BatchTracking_is_expired_idx" ON "BatchTracking"("is_expired");

-- CreateIndex
CREATE UNIQUE INDEX "BatchTracking_product_id_batch_number_key" ON "BatchTracking"("product_id", "batch_number");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_offline_session_hash_key" ON "Transaction"("offline_session_hash");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_receipt_number_key" ON "Transaction"("receipt_number");

-- CreateIndex
CREATE INDEX "Transaction_user_id_idx" ON "Transaction"("user_id");

-- CreateIndex
CREATE INDEX "Transaction_store_id_idx" ON "Transaction"("store_id");

-- CreateIndex
CREATE INDEX "Transaction_customer_id_idx" ON "Transaction"("customer_id");

-- CreateIndex
CREATE INDEX "Transaction_offline_session_hash_idx" ON "Transaction"("offline_session_hash");

-- CreateIndex
CREATE INDEX "Transaction_is_sync_online_idx" ON "Transaction"("is_sync_online");

-- CreateIndex
CREATE INDEX "Transaction_created_at_idx" ON "Transaction"("created_at");

-- CreateIndex
CREATE INDEX "Transaction_payment_status_idx" ON "Transaction"("payment_status");

-- CreateIndex
CREATE INDEX "TransactionItem_transaction_id_idx" ON "TransactionItem"("transaction_id");

-- CreateIndex
CREATE INDEX "TransactionItem_product_id_idx" ON "TransactionItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineSyncQueue_transaction_id_key" ON "OfflineSyncQueue"("transaction_id");

-- CreateIndex
CREATE INDEX "OfflineSyncQueue_device_id_idx" ON "OfflineSyncQueue"("device_id");

-- CreateIndex
CREATE INDEX "OfflineSyncQueue_status_idx" ON "OfflineSyncQueue"("status");

-- CreateIndex
CREATE INDEX "OfflineSyncQueue_offline_session_hash_idx" ON "OfflineSyncQueue"("offline_session_hash");

-- CreateIndex
CREATE INDEX "AuditLog_user_id_idx" ON "AuditLog"("user_id");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE INDEX "AuditLog_resource_type_resource_id_idx" ON "AuditLog"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "DailyAnalytics_report_date_idx" ON "DailyAnalytics"("report_date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAnalytics_store_id_report_date_key" ON "DailyAnalytics"("store_id", "report_date");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchTracking" ADD CONSTRAINT "BatchTracking_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "BatchTracking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineSyncQueue" ADD CONSTRAINT "OfflineSyncQueue_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
