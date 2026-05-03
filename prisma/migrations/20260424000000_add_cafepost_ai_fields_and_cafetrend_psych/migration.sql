-- AlterTable: CafePost에 게시판 분류 + 품질점수 + AI 심리분석 + 댓글 필드 추가
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "boardName" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "boardCategory" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "emotionTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "desireCategory" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "desireType" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "psychInsight" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "urgencyLevel" INTEGER;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "communitySignal" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "ageSignal" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "aiAnalyzed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "topComments" JSONB;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "commentCrawled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: CafePost AI 분석 인덱스
CREATE INDEX IF NOT EXISTS "CafePost_aiAnalyzed_crawledAt_idx" ON "CafePost"("aiAnalyzed", "crawledAt" DESC);
CREATE INDEX IF NOT EXISTS "CafePost_desireCategory_urgencyLevel_idx" ON "CafePost"("desireCategory", "urgencyLevel");

-- AlterTable: CafeTrend에 AI 심리분석 집계 + updatedAt 추가
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "desireMap" JSONB;
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "emotionDistribution" JSONB;
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "urgentTopics" JSONB;
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "dominantDesire" TEXT;
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "dominantEmotion" TEXT;
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "quickUpdate" JSONB;
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
