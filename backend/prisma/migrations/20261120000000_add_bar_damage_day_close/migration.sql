-- Bar / Lounge Phase 4: damage records (house loss) + Bar Controller day close.
--
-- Strictly additive: CREATE TABLE / ADD COLUMN (nullable) / CREATE INDEX.

-- AlterTable
ALTER TABLE "BarOrder" ADD COLUMN     "day_close_id" TEXT;

-- AlterTable
ALTER TABLE "CashierRemittance" ADD COLUMN     "day_close_id" TEXT;

-- CreateTable
CREATE TABLE "DamageRecord" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "reason_code" TEXT NOT NULL,
    "notes" TEXT,
    "responsible_user_id" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "business_date" DATE NOT NULL,
    "client_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "reversed_by_user_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "day_close_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarDayClose" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "closed_by_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "snapshot" JSONB NOT NULL,
    "expected_cash" DECIMAL(15,2) NOT NULL,
    "expected_transfer" DECIMAL(15,2) NOT NULL,
    "expected_card" DECIMAL(15,2) NOT NULL,
    "expected_other" DECIMAL(15,2) NOT NULL,
    "counted_cash" DECIMAL(15,2) NOT NULL,
    "variance" DECIMAL(15,2) NOT NULL,
    "variance_reason" TEXT,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by_user_id" TEXT,
    "acknowledged_amount" DECIMAL(15,2),
    "acknowledged_at" TIMESTAMP(3),
    "ack_note" TEXT,
    "variance_treatment" TEXT,
    "reopened_by_user_id" TEXT,
    "reopened_at" TIMESTAMP(3),
    "reopen_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DamageRecord_client_ref_key" ON "DamageRecord"("client_ref");

-- CreateIndex
CREATE INDEX "DamageRecord_store_id_business_date_idx" ON "DamageRecord"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "DamageRecord_responsible_user_id_idx" ON "DamageRecord"("responsible_user_id");

-- CreateIndex
CREATE INDEX "DamageRecord_product_id_idx" ON "DamageRecord"("product_id");

-- CreateIndex
CREATE INDEX "DamageRecord_day_close_id_idx" ON "DamageRecord"("day_close_id");

-- CreateIndex
CREATE INDEX "BarDayClose_store_id_business_date_idx" ON "BarDayClose"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "BarDayClose_status_idx" ON "BarDayClose"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BarDayClose_branch_id_business_date_closed_by_user_id_key" ON "BarDayClose"("branch_id", "business_date", "closed_by_user_id");

-- CreateIndex
CREATE INDEX "BarOrder_day_close_id_idx" ON "BarOrder"("day_close_id");

-- CreateIndex
CREATE INDEX "CashierRemittance_day_close_id_idx" ON "CashierRemittance"("day_close_id");

