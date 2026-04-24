-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BotType" ADD VALUE 'CEO';
ALTER TYPE "BotType" ADD VALUE 'CTO';
ALTER TYPE "BotType" ADD VALUE 'CMO';
ALTER TYPE "BotType" ADD VALUE 'CPO';
ALTER TYPE "BotType" ADD VALUE 'CDO';
ALTER TYPE "BotType" ADD VALUE 'CFO';
ALTER TYPE "BotType" ADD VALUE 'COO';
ALTER TYPE "BotType" ADD VALUE 'SEED';

-- AlterTable
ALTER TABLE "BotLog" ADD COLUMN     "action" TEXT,
ADD COLUMN     "details" TEXT,
ADD COLUMN     "executionTimeMs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "itemCount" INTEGER NOT NULL DEFAULT 0;
