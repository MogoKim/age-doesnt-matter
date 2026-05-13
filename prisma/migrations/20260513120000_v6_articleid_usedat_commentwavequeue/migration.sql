-- V6 P0-1: CafePost articleId + usedAt + CommentWaveQueue
-- 전체글보기 dedup + 큐레이션 추적 + 댓글 파동 큐

-- 1. CafePost: articleId (전체글보기 순차 번호)
ALTER TABLE "CafePost" ADD COLUMN "articleId" INTEGER;

-- 2. CafePost: usedAt (큐레이션 참조 시각, NULL = 미사용)
ALTER TABLE "CafePost" ADD COLUMN "usedAt" TIMESTAMP(3);

-- 3. unique constraint: [cafeId, articleId] — PostgreSQL은 NULL을 distinct 취급, 다중 NULL 허용
ALTER TABLE "CafePost" ADD CONSTRAINT "CafePost_cafeId_articleId_key" UNIQUE("cafeId", "articleId");

-- 4. index: usedAt IS NULL 필터링용
CREATE INDEX "CafePost_usedAt_idx" ON "CafePost"("usedAt");

-- 5. CommentWaveQueue 테이블 생성
CREATE TABLE "CommentWaveQueue" (
  "id"              TEXT NOT NULL,
  "postId"          TEXT NOT NULL,
  "cafePostId"      TEXT NOT NULL,
  "authorPersonaId" TEXT NOT NULL,
  "wave1At"         TIMESTAMP(3) NOT NULL,
  "wave2At"         TIMESTAMP(3) NOT NULL,
  "wave3At"         TIMESTAMP(3) NOT NULL,
  "wave4At"         TIMESTAMP(3) NOT NULL,
  "wave1Done"       BOOLEAN NOT NULL DEFAULT false,
  "wave2Done"       BOOLEAN NOT NULL DEFAULT false,
  "wave3Done"       BOOLEAN NOT NULL DEFAULT false,
  "wave4Done"       BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommentWaveQueue_pkey" PRIMARY KEY ("id")
);

-- 6. CommentWaveQueue indexes
CREATE INDEX "CommentWaveQueue_wave1Done_wave1At_idx" ON "CommentWaveQueue"("wave1Done", "wave1At");
CREATE INDEX "CommentWaveQueue_wave2Done_wave2At_idx" ON "CommentWaveQueue"("wave2Done", "wave2At");
CREATE INDEX "CommentWaveQueue_wave3Done_wave3At_idx" ON "CommentWaveQueue"("wave3Done", "wave3At");
CREATE INDEX "CommentWaveQueue_wave4Done_wave4At_idx" ON "CommentWaveQueue"("wave4Done", "wave4At");
CREATE INDEX "CommentWaveQueue_expiresAt_idx"         ON "CommentWaveQueue"("expiresAt");
