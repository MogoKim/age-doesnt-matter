-- CreateEnum
CREATE TYPE "ScheduledPushStatus" AS ENUM ('PENDING', 'SENT', 'CANCELED', 'FAILED');

-- CreateTable
CREATE TABLE "ScheduledPush" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '/',
    "messageType" TEXT NOT NULL,
    "targetMode" TEXT NOT NULL,
    "targetGrade" TEXT NOT NULL DEFAULT 'ALL',
    "targetUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledPushStatus" NOT NULL DEFAULT 'PENDING',
    "sentCount" INTEGER,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledPush_status_scheduledAt_idx" ON "ScheduledPush"("status", "scheduledAt");
