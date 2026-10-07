/*
  Warnings:

  - You are about to drop the column `couponCode` on the `Cart` table. All the data in the column will be lost.
  - You are about to drop the column `couponCode` on the `Order` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_searchText_trgm_idx";

-- DropIndex
DROP INDEX "ProductVariant_sku_trgm_idx";

-- DropIndex
DROP INDEX "SearchLog_query_trgm_idx";

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "couponCode",
ADD COLUMN     "couponCodes" TEXT[];

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "couponCode",
ADD COLUMN     "couponCodes" TEXT[];
