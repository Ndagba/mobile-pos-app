-- Bar / Lounge Phase 2: pending bar orders + link from the completed sale.
--
-- Strictly additive: CREATE TABLE / ADD COLUMN (nullable) / CREATE INDEX / ADD FOREIGN KEY.
-- Existing Transaction rows keep NULL sales_order_id / fulfilled_by_user_id / business_date,
-- so retail sales and every existing report are unaffected.
--
-- Production note: on a large "Transaction" table, consider creating the two new
-- Transaction indexes CONCURRENTLY by hand before running this migration.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "business_date" DATE,
ADD COLUMN     "fulfilled_by_user_id" TEXT,
ADD COLUMN     "sales_order_id" TEXT;

-- CreateTable
CREATE TABLE "BarOrder" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "client_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "initiated_by_user_id" TEXT NOT NULL,
    "accepted_by_user_id" TEXT,
    "fulfilled_by_user_id" TEXT,
    "table_label" TEXT,
    "notes" TEXT,
    "subtotal" DECIMAL(15,2) NOT NULL,
    "tax_amount" DECIMAL(15,2) NOT NULL,
    "discount_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "fulfilled_total" DECIMAL(15,2),
    "customer_payment_method" TEXT,
    "customer_payment_splits" JSONB,
    "customer_payment_ref" TEXT,
    "business_date" DATE,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "closed_reason" TEXT,
    "closed_by_user_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarOrderItem" (
    "id" TEXT NOT NULL,
    "bar_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_requested" DECIMAL(15,4) NOT NULL,
    "quantity_fulfilled" DECIMAL(15,4),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL,
    "line_total" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "BarOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BarOrder_client_ref_key" ON "BarOrder"("client_ref");

-- CreateIndex
CREATE INDEX "BarOrder_store_id_branch_id_status_idx" ON "BarOrder"("store_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "BarOrder_initiated_by_user_id_status_idx" ON "BarOrder"("initiated_by_user_id", "status");

-- CreateIndex
CREATE INDEX "BarOrder_business_date_idx" ON "BarOrder"("business_date");

-- CreateIndex
CREATE UNIQUE INDEX "BarOrder_store_id_order_number_key" ON "BarOrder"("store_id", "order_number");

-- CreateIndex
CREATE INDEX "BarOrderItem_bar_order_id_idx" ON "BarOrderItem"("bar_order_id");

-- CreateIndex
CREATE INDEX "BarOrderItem_product_id_idx" ON "BarOrderItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_sales_order_id_key" ON "Transaction"("sales_order_id");

-- CreateIndex
CREATE INDEX "Transaction_business_date_idx" ON "Transaction"("business_date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "BarOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_fulfilled_by_user_id_fkey" FOREIGN KEY ("fulfilled_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrderItem" ADD CONSTRAINT "BarOrderItem_bar_order_id_fkey" FOREIGN KEY ("bar_order_id") REFERENCES "BarOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrderItem" ADD CONSTRAINT "BarOrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

