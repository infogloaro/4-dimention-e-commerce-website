-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "invoiceNumber" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "maxQuantityPerOrder" INTEGER NOT NULL DEFAULT 10;

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");
