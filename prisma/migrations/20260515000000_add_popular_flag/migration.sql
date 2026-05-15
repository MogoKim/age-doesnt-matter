-- AlterTable
ALTER TABLE "CafePost" ADD COLUMN "isPopular" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CafePost" ADD COLUMN "popularUpdatedAt" TIMESTAMP(3);
