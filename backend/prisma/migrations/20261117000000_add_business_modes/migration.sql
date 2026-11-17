-- Bar / Lounge business modes — Phase 1 foundation.
--
-- Strictly additive: ADD COLUMN (with constant defaults or NULL) + CREATE INDEX.
-- Every existing store becomes `retail`; every existing user keeps a NULL
-- operational_profile; StoreSetting rows get the defaults below. No backfill,
-- no rewrite. On Postgres >= 11 constant-default ADD COLUMN is metadata-only.

-- Store: business mode
ALTER TABLE "Store" ADD COLUMN "business_mode" TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE "Store" ADD COLUMN "business_mode_set_at" TIMESTAMP(3);

-- User: operational profile (bar_controller | bar_attendant | NULL)
ALTER TABLE "User" ADD COLUMN "operational_profile" TEXT;
CREATE INDEX "User_store_id_operational_profile_idx" ON "User"("store_id", "operational_profile");

-- StoreSetting: bar + commission configuration
ALTER TABLE "StoreSetting" ADD COLUMN "bar_business_day_cutoff_hour" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "StoreSetting" ADD COLUMN "bar_timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos';
ALTER TABLE "StoreSetting" ADD COLUMN "bar_attendant_discount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSetting" ADD COLUMN "bar_allow_backdated_remittance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSetting" ADD COLUMN "bar_require_payment_declaration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSetting" ADD COLUMN "commission_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreSetting" ADD COLUMN "commission_rate" DECIMAL(5,2);
ALTER TABLE "StoreSetting" ADD COLUMN "commission_basis" TEXT NOT NULL DEFAULT 'total_sales';
