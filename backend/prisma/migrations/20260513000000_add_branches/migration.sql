-- Migration: 20260513000000_add_branches
-- Adds multi-branch support to the POS backend.

-- ─── 1. Create Branch table ───────────────────────────────────────────────────
CREATE TABLE "Branch" (
  "id"         TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "address"    TEXT,
  "phone"      TEXT,
  "store_id"   TEXT        NOT NULL,
  "is_active"  BOOLEAN     NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Branch_store_id_idx"  ON "Branch"("store_id");
CREATE INDEX "Branch_is_active_idx" ON "Branch"("is_active");

-- ─── 2. Insert a default "Main Branch" using store_id from the first User ────
-- If no users exist yet, fall back to the literal string 'default-store'.
DO $$
DECLARE
  v_branch_id TEXT := gen_random_uuid()::TEXT;
  v_store_id  TEXT;
BEGIN
  SELECT store_id INTO v_store_id FROM "User" ORDER BY created_at ASC LIMIT 1;
  IF v_store_id IS NULL THEN
    v_store_id := 'default-store';
  END IF;

  INSERT INTO "Branch" ("id", "name", "store_id", "is_active", "created_at", "updated_at")
  VALUES (v_branch_id, 'Main Branch', v_store_id, true, now(), now());

  -- Store in a temp table so subsequent steps can reference it
  CREATE TEMP TABLE _default_branch AS SELECT v_branch_id AS id, v_store_id AS store_id;
END $$;

-- ─── 3. Add nullable branch_id columns ───────────────────────────────────────
ALTER TABLE "User"        ADD COLUMN "branch_id" TEXT;
ALTER TABLE "Category"    ADD COLUMN "branch_id" TEXT;
ALTER TABLE "Product"     ADD COLUMN "branch_id" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "branch_id" TEXT;

-- ─── 4. Back-fill all existing rows with the default branch ──────────────────
UPDATE "User"
SET "branch_id" = (SELECT id FROM _default_branch LIMIT 1)
WHERE "branch_id" IS NULL;

UPDATE "Category"
SET "branch_id" = (SELECT id FROM _default_branch LIMIT 1)
WHERE "branch_id" IS NULL;

UPDATE "Product"
SET "branch_id" = (SELECT id FROM _default_branch LIMIT 1)
WHERE "branch_id" IS NULL;

UPDATE "Transaction"
SET "branch_id" = (SELECT id FROM _default_branch LIMIT 1)
WHERE "branch_id" IS NULL;

-- ─── 5. Make branch_id NOT NULL on Category, Product, Transaction ─────────────
-- (User.branch_id stays nullable — admins may not belong to a specific branch)
ALTER TABLE "Category"    ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "Product"     ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "branch_id" SET NOT NULL;

-- ─── 6. Add FK constraints ────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD CONSTRAINT "User_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL;

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "Branch"("id");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "Branch"("id");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "Branch"("id");

-- ─── 7. Drop old global unique constraints ────────────────────────────────────
-- Category.name was globally unique; now uniqueness is per-branch.
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_name_key";

-- Product.sku was globally unique; now uniqueness is per-branch.
ALTER TABLE "Product"  DROP CONSTRAINT IF EXISTS "Product_sku_key";

-- ─── 8. Add compound unique constraints ──────────────────────────────────────
ALTER TABLE "Category" ADD CONSTRAINT "Category_name_branch_id_key" UNIQUE ("name", "branch_id");
ALTER TABLE "Product"  ADD CONSTRAINT "Product_sku_branch_id_key"   UNIQUE ("sku",  "branch_id");

-- ─── 9. Add indexes ───────────────────────────────────────────────────────────
CREATE INDEX "User_branch_id_idx"        ON "User"("branch_id");
CREATE INDEX "Category_branch_id_idx"    ON "Category"("branch_id");
CREATE INDEX "Product_branch_id_idx"     ON "Product"("branch_id");
CREATE INDEX "Transaction_branch_id_idx" ON "Transaction"("branch_id");

-- ─── Add branch_id to DailyAnalytics (nullable) ───────────────────────────────
ALTER TABLE "DailyAnalytics" ADD COLUMN "branch_id" TEXT;

-- Drop old unique and re-create with branch_id included
ALTER TABLE "DailyAnalytics" DROP CONSTRAINT IF EXISTS "DailyAnalytics_store_id_report_date_key";
ALTER TABLE "DailyAnalytics" ADD CONSTRAINT "DailyAnalytics_store_id_branch_id_report_date_key"
  UNIQUE ("store_id", "branch_id", "report_date");

-- Clean up temp table
DROP TABLE IF EXISTS _default_branch;
