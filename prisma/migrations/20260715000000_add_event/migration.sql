-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('VOTE', 'FEEDBACK', 'NOTICE');

-- CreateEnum
CREATE TYPE "EventTier" AS ENUM ('PRIMARY', 'SECONDARY', 'HIDDEN');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bodyPostId" TEXT,
    "voteEventId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "showBottomPopup" BOOLEAN NOT NULL DEFAULT false,
    "showHero" BOOLEAN NOT NULL DEFAULT false,
    "sendPush" BOOLEAN NOT NULL DEFAULT false,
    "sendNotification" BOOLEAN NOT NULL DEFAULT false,
    "tier" "EventTier" NOT NULL DEFAULT 'SECONDARY',
    "preset" TEXT NOT NULL DEFAULT 'coral',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_voteEventId_key" ON "Event"("voteEventId");

-- CreateIndex
CREATE INDEX "Event_isActive_showBottomPopup_startAt_endAt_idx" ON "Event"("isActive", "showBottomPopup", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Event_isActive_showHero_startAt_endAt_idx" ON "Event"("isActive", "showHero", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Event_type_startAt_idx" ON "Event"("type", "startAt");

