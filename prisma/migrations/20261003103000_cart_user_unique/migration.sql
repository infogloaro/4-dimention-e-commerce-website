-- Replace the hand-written partial index with a Prisma-managed unique constraint (NULL userIds stay unrestricted).
DROP INDEX IF EXISTS "Cart_userId_unique_idx";
DROP INDEX IF EXISTS "Cart_userId_idx";
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
