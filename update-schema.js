const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'backend', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

const modelsToAdd = "\n\n// ─── Audit Features ───────────────────────────────────────────\n\nmodel StockCount {\n  id                  String    @id @default(uuid())\n  store_id            String\n  branch_id           String\n  status              String    @default(\"in_progress\") // in_progress, completed\n  started_at          DateTime  @default(now())\n  completed_at        DateTime?\n  started_by_user_id  String\n  completed_by_user_id String?\n  notes               String?\n  created_at          DateTime  @default(now())\n  updated_at          DateTime  @updatedAt\n\n  branch              Branch    @relation(fields: [branch_id], references: [id])\n  started_by          User      @relation(\"StockCountStartedBy\", fields: [started_by_user_id], references: [id])\n  completed_by        User?     @relation(\"StockCountCompletedBy\", fields: [completed_by_user_id], references: [id])\n  items               StockCountItem[]\n\n  @@index([store_id])\n  @@index([branch_id])\n  @@index([status])\n}\n\nmodel StockCountItem {\n  id                  String    @id @default(uuid())\n  stock_count_id      String\n  product_id          String\n  system_quantity     BigInt\n  physical_quantity   BigInt?\n  variance            BigInt?\n  notes               String?\n\n  stock_count         StockCount @relation(fields: [stock_count_id], references: [id], onDelete: Cascade)\n  product             Product    @relation(fields: [product_id], references: [id])\n\n  @@index([stock_count_id])\n  @@index([product_id])\n}\n\nmodel CashShift {\n  id                  String    @id @default(uuid())\n  store_id            String\n  branch_id           String\n  user_id             String\n  status              String    @default(\"open\") // open, closed\n  opening_balance     Decimal   @db.Decimal(15, 2)\n  expected_closing    Decimal?  @db.Decimal(15, 2)\n  actual_closing      Decimal?  @db.Decimal(15, 2)\n  overage_shortage    Decimal?  @db.Decimal(15, 2)\n  opened_at           DateTime  @default(now())\n  closed_at           DateTime?\n  notes               String?\n\n  user                User      @relation(\"UserShifts\", fields: [user_id], references: [id])\n  branch              Branch    @relation(fields: [branch_id], references: [id])\n\n  @@index([store_id])\n  @@index([branch_id])\n  @@index([user_id])\n  @@index([status])\n}\n\nmodel InventoryMovement {\n  id                  String    @id @default(uuid())\n  store_id            String\n  branch_id           String\n  product_id          String\n  movement_type       String    // sale, purchase, adjustment, transfer\n  quantity            BigInt    // positive for addition, negative for deduction\n  reference_id        String?   // transaction_id, invoice_id, stock_count_id\n  notes               String?\n  user_id             String?\n  timestamp           DateTime  @default(now())\n\n  product             Product   @relation(fields: [product_id], references: [id])\n  branch              Branch    @relation(fields: [branch_id], references: [id])\n  user                User?     @relation(fields: [user_id], references: [id])\n\n  @@index([store_id])\n  @@index([branch_id])\n  @@index([product_id])\n  @@index([movement_type])\n  @@index([timestamp])\n}\n";

// Append models
if (!schema.includes('model StockCount')) {
  schema += modelsToAdd;
}

// Safely add relations using exact replacements

// Branch
if (!schema.includes('stock_counts StockCount[]')) {
  schema = schema.replace(
    '  transactions Transaction[]\n\n  @@index',
    '  transactions Transaction[]\n  stock_counts StockCount[]\n  shifts       CashShift[]\n  movements    InventoryMovement[]\n\n  @@index'
  );
}

// User
if (!schema.includes('stock_counts_started    StockCount[]')) {
  schema = schema.replace(
    '  transactions            Transaction[]\n  audit_logs              AuditLog[]\n  voided_transactions     Transaction[] @relation("VoidedBy")\n  recorded_payments       Payment[]\n\n  @@index',
    '  transactions            Transaction[]\n  audit_logs              AuditLog[]\n  voided_transactions     Transaction[] @relation("VoidedBy")\n  recorded_payments       Payment[]\n  stock_counts_started    StockCount[] @relation("StockCountStartedBy")\n  stock_counts_completed  StockCount[] @relation("StockCountCompletedBy")\n  shifts                  CashShift[]  @relation("UserShifts")\n  movements               InventoryMovement[]\n\n  @@index'
  );
}

// Product
if (!schema.includes('stock_count_items StockCountItem[]')) {
  schema = schema.replace(
    '  inventory          Inventory?\n\n  @@unique',
    '  inventory          Inventory?\n  stock_count_items  StockCountItem[]\n  movements          InventoryMovement[]\n\n  @@unique'
  );
}

fs.writeFileSync(schemaPath, schema);
console.log('Schema updated successfully');
