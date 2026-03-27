-- AlterTable: CafePost에 미디어 필드 추가
ALTER TABLE "CafePost" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CafePost" ADD COLUMN "videoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CafePost" ADD COLUMN "thumbnailUrl" TEXT;
ALTER TABLE "CafePost" ADD COLUMN "mediaCount" INTEGER NOT NULL DEFAULT 0;
