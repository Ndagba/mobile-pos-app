-- Add cost_price to the TransactionItem table.
--
-- Background: `cost_price` was added to the Prisma schema (commit f7a79f21, the
-- "Desktop Update + accumulated WIP" checkpoint) and TransactionService writes it
-- on every sale line (COGS snapshot), but no migration was ever generated for it.
-- Dev databases got the column via `prisma db push` / `migrate dev`; production,
-- migrated only through 20261102, never did -- so every sale fails with
-- "The column 'cost_price' does not exist in the current database".
--
-- Nullable + additive => safe, non-destructive, no table rewrite, no backfill.

ALTER TABLE "TransactionItem" ADD COLUMN "cost_price" DECIMAL(12,2);
