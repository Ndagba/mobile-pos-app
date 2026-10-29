-- Phase 1: Product/service catalog classification and decimal inventory.
-- Existing products remain PRODUCT. PostgreSQL casts preserve existing integers
-- exactly (for example 10 becomes 10.0000).

ALTER TABLE "Product"
  ADD COLUMN "item_type" TEXT NOT NULL DEFAULT 'PRODUCT';

ALTER TABLE "Inventory"
  ALTER COLUMN "quantity_on_hand" TYPE DECIMAL(15,4) USING "quantity_on_hand"::DECIMAL(15,4),
  ALTER COLUMN "quantity_reserved" TYPE DECIMAL(15,4) USING "quantity_reserved"::DECIMAL(15,4),
  ALTER COLUMN "low_stock_threshold" TYPE DECIMAL(15,4) USING "low_stock_threshold"::DECIMAL(15,4),
  ALTER COLUMN "reorder_point" TYPE DECIMAL(15,4) USING "reorder_point"::DECIMAL(15,4);

ALTER TABLE "BatchTracking"
  ALTER COLUMN "quantity" TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);

ALTER TABLE "TransactionItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);

ALTER TABLE "StockCountItem"
  ALTER COLUMN "system_quantity" TYPE DECIMAL(15,4) USING "system_quantity"::DECIMAL(15,4),
  ALTER COLUMN "physical_quantity" TYPE DECIMAL(15,4) USING "physical_quantity"::DECIMAL(15,4),
  ALTER COLUMN "variance" TYPE DECIMAL(15,4) USING "variance"::DECIMAL(15,4);

ALTER TABLE "InventoryMovement"
  ALTER COLUMN "quantity" TYPE DECIMAL(15,4) USING "quantity"::DECIMAL(15,4);
