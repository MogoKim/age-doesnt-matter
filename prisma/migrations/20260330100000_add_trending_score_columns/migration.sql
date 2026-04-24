-- AlterTable: Post에 트렌딩 시스템 컬럼 추가
ALTER TABLE "Post" ADD COLUMN "trendingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN "lastEngagedAt" TIMESTAMP(3);
