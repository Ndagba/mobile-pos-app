-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "purchase_order_id" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "order_date" DATE,
    "expected_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_ordered" DECIMAL(15,4) NOT NULL,
    "quantity_received" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "line_total" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "received_date" DATE NOT NULL,
    "reference" TEXT,
    "receipt_hash" TEXT,
    "notes" TEXT,
    "received_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "goods_receipt_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity_received" DECIMAL(15,4) NOT NULL,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "batch_number" TEXT,
    "expiry_date" DATE,

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrder_store_id_idx" ON "PurchaseOrder"("store_id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_branch_id_idx" ON "PurchaseOrder"("branch_id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplier_id_idx" ON "PurchaseOrder"("supplier_id");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_order_date_idx" ON "PurchaseOrder"("order_date");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_store_id_po_number_key" ON "PurchaseOrder"("store_id", "po_number");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchase_order_id_idx" ON "PurchaseOrderItem"("purchase_order_id");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_product_id_idx" ON "PurchaseOrderItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_receipt_hash_key" ON "GoodsReceipt"("receipt_hash");

-- CreateIndex
CREATE INDEX "GoodsReceipt_store_id_idx" ON "GoodsReceipt"("store_id");

-- CreateIndex
CREATE INDEX "GoodsReceipt_branch_id_idx" ON "GoodsReceipt"("branch_id");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchase_order_id_idx" ON "GoodsReceipt"("purchase_order_id");

-- CreateIndex
CREATE INDEX "GoodsReceipt_received_date_idx" ON "GoodsReceipt"("received_date");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_goods_receipt_id_idx" ON "GoodsReceiptItem"("goods_receipt_id");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_purchase_order_item_id_idx" ON "GoodsReceiptItem"("purchase_order_item_id");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_product_id_idx" ON "GoodsReceiptItem"("product_id");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_purchase_order_id_idx" ON "PurchaseInvoice"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

