-- AlterTable: additive store-settings fields (store profile, tax, receipt, extra cashier permissions)
ALTER TABLE "StoreSetting" ADD COLUMN     "business_name" TEXT,
ADD COLUMN     "rc_number" TEXT,
ADD COLUMN     "store_address" TEXT,
ADD COLUMN     "tax_rate" DECIMAL(5,2),
ADD COLUMN     "receipt_footer" TEXT,
ADD COLUMN     "receipt_show_logo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allow_cashier_refund" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allow_cashier_discount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_discount_percent" INTEGER;
