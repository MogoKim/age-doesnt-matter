-- CreateEnum
CREATE TYPE "NaverBlogQueueStatus" AS ENUM ('PENDING', 'READY_FOR_MANUAL', 'POSTED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "NaverBlogQueue" (
    "queueId" TEXT NOT NULL,
    "magazinePostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetTime" TIMESTAMP(3) NOT NULL,
    "status" "NaverBlogQueueStatus" NOT NULL DEFAULT 'PENDING',
    "naverBlogUrl" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "expiredReason" TEXT,
    "transformedContent" JSONB,
    "imageUrls" TEXT[],
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NaverBlogQueue_pkey" PRIMARY KEY ("queueId")
);

-- CreateIndex
CREATE INDEX "NaverBlogQueue_status_createdAt_idx" ON "NaverBlogQueue"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NaverBlogQueue_magazinePostId_idx" ON "NaverBlogQueue"("magazinePostId");
