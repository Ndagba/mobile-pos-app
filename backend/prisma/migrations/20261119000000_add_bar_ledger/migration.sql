-- Bar / Lounge Phase 3: Attendant ledger + remittances + reversal requests.
--
-- Strictly additive: CREATE TABLE / ADD COLUMN (nullable) / CREATE INDEX.
-- Balances are never stored: outstanding = SUM(CashierLedgerEntry.amount).

-- AlterTable
ALTER TABLE "BarOrder" ADD COLUMN     "reversal_request_reason" TEXT,
ADD COLUMN     "reversal_requested_at" TIMESTAMP(3),
ADD COLUMN     "reversal_requested_by_user_id" TEXT;

-- CreateTable
CREATE TABLE "CashierLedgerEntry" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_user_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "business_date" DATE NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "reverses_entry_id" TEXT,
    "reason" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashierLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashierRemittance" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "cashier_user_id" TEXT NOT NULL,
    "received_by_user_id" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "narration" TEXT,
    "business_date" DATE NOT NULL,
    "client_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "reversed_by_user_id" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashierRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashierLedgerEntry_reverses_entry_id_key" ON "CashierLedgerEntry"("reverses_entry_id");

-- CreateIndex
CREATE INDEX "CashierLedgerEntry_store_id_cashier_user_id_business_date_idx" ON "CashierLedgerEntry"("store_id", "cashier_user_id", "business_date");

-- CreateIndex
CREATE INDEX "CashierLedgerEntry_store_id_business_date_idx" ON "CashierLedgerEntry"("store_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "CashierLedgerEntry_entry_type_source_type_source_id_key" ON "CashierLedgerEntry"("entry_type", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "CashierRemittance_client_ref_key" ON "CashierRemittance"("client_ref");

-- CreateIndex
CREATE INDEX "CashierRemittance_store_id_cashier_user_id_business_date_idx" ON "CashierRemittance"("store_id", "cashier_user_id", "business_date");

-- CreateIndex
CREATE INDEX "CashierRemittance_store_id_business_date_idx" ON "CashierRemittance"("store_id", "business_date");

-- CreateIndex
CREATE INDEX "CashierRemittance_store_id_method_reference_idx" ON "CashierRemittance"("store_id", "method", "reference");

