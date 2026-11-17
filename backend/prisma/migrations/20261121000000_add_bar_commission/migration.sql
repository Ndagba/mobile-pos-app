-- Bar / Lounge Phase 5: Attendant commission runs + Expense source link.
--
-- Strictly additive: CREATE TABLE / ADD COLUMN (nullable) / CREATE INDEX.
-- The Expense(source_type, source_id) unique index ignores NULLs, so existing
-- expenses are unaffected.

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "source_id" TEXT,
ADD COLUMN     "source_type" TEXT;

-- CreateTable
CREATE TABLE "CommissionRun" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "basis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by_user_id" TEXT NOT NULL,
    "posted_by_user_id" TEXT,
    "posted_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRunLine" (
    "id" TEXT NOT NULL,
    "commission_run_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_user_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "gross_sales" DECIMAL(15,2) NOT NULL,
    "reversals" DECIMAL(15,2) NOT NULL,
    "eligible_sales" DECIMAL(15,2) NOT NULL,
    "commission_amount" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "expense_id" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "paid_at" TIMESTAMP(3),
    "paid_method" TEXT,
    "paid_reference" TEXT,
    "paid_by_user_id" TEXT,

    CONSTRAINT "CommissionRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRun_store_id_status_idx" ON "CommissionRun"("store_id", "status");

-- CreateIndex
CREATE INDEX "CommissionRun_store_id_period_start_period_end_idx" ON "CommissionRun"("store_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionRunLine_expense_id_key" ON "CommissionRunLine"("expense_id");

-- CreateIndex
CREATE INDEX "CommissionRunLine_commission_run_id_idx" ON "CommissionRunLine"("commission_run_id");

-- CreateIndex
CREATE INDEX "CommissionRunLine_store_id_cashier_user_id_status_idx" ON "CommissionRunLine"("store_id", "cashier_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_source_type_source_id_key" ON "Expense"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "CommissionRunLine" ADD CONSTRAINT "CommissionRunLine_commission_run_id_fkey" FOREIGN KEY ("commission_run_id") REFERENCES "CommissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

