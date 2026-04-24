-- AlterEnum
ALTER TYPE "BotType" ADD VALUE 'CAFE_CRAWLER';

-- CreateTable
CREATE TABLE "CafePost" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "cafeName" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "category" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "topics" TEXT[],
    "sentiment" TEXT,
    "isUsable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CafePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeTrend" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'daily',
    "hotTopics" JSONB NOT NULL,
    "keywords" JSONB NOT NULL,
    "sentimentMap" JSONB NOT NULL,
    "magazineTopics" JSONB NOT NULL,
    "personaHints" JSONB,
    "totalPosts" INTEGER NOT NULL DEFAULT 0,
    "cafeSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CafeTrend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CafePost_postUrl_key" ON "CafePost"("postUrl");
CREATE INDEX "CafePost_cafeId_crawledAt_idx" ON "CafePost"("cafeId", "crawledAt" DESC);
CREATE INDEX "CafePost_crawledAt_idx" ON "CafePost"("crawledAt" DESC);
CREATE INDEX "CafePost_isUsable_crawledAt_idx" ON "CafePost"("isUsable", "crawledAt" DESC);

CREATE UNIQUE INDEX "CafeTrend_date_period_key" ON "CafeTrend"("date", "period");
CREATE INDEX "CafeTrend_date_idx" ON "CafeTrend"("date" DESC);
