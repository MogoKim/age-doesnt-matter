-- 1. hotPromotedAt 컬럼 추가
ALTER TABLE "Post" ADD COLUMN "hotPromotedAt" TIMESTAMP(3);

-- 2. 인덱스 추가 (getAccumulatedHotPosts 쿼리 성능)
CREATE INDEX "Post_boardType_status_hotPromotedAt_idx"
  ON "Post"("boardType", "status", "hotPromotedAt" DESC);

-- 3. 기존 HOT/HALL_OF_FAME 게시글 backfill
-- 정확한 승격 시각 불명이므로 최근 활동 시각으로 근사
UPDATE "Post"
SET "hotPromotedAt" = COALESCE("lastEngagedAt", "updatedAt", "createdAt")
WHERE "promotionLevel" IN ('HOT', 'HALL_OF_FAME')
  AND "hotPromotedAt" IS NULL;

-- 4. 명예의 전당 문턱 50 → 30 하향
UPDATE "BoardConfig" SET "fameThreshold" = 30 WHERE "fameThreshold" = 50;
