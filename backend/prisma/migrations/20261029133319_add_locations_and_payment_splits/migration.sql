-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "location_id" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "payment_splits" JSONB;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "branch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_is_active_idx" ON "Location"("is_active");

-- CreateIndex
CREATE INDEX "Location_branch_id_idx" ON "Location"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_branch_id_key" ON "Location"("name", "branch_id");

-- CreateIndex
CREATE INDEX "Product_location_id_idx" ON "Product"("location_id");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

