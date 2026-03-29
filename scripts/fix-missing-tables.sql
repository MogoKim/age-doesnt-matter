-- 누락된 테이블 4개 + Enum 생성 (Supabase SQL Editor에서 실행)
-- 2026-03-29

-- ── Enum 타입 생성 (이미 있으면 무시) ──

DO $$ BEGIN
  CREATE TYPE "AdminQueueType" AS ENUM ('CONTENT_PUBLISH', 'AGENT_EVOLUTION', 'SCHEMA_CHANGE', 'BUDGET_CHANGE', 'SYSTEM_ACTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AdminQueueStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SocialPlatform" AS ENUM ('THREADS', 'X', 'INSTAGRAM', 'FACEBOOK', 'BAND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'QUEUED', 'APPROVED', 'POSTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExperimentStatus" AS ENUM ('PLANNING', 'ACTIVE', 'COMPLETED', 'ANALYZED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PopupType" AS ENUM ('BOTTOM_SHEET', 'FULLSCREEN', 'CENTER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PopupTarget" AS ENUM ('ALL', 'HOME', 'COMMUNITY', 'JOBS', 'MAGAZINE', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 1. AdminQueue 테이블 ──

CREATE TABLE IF NOT EXISTS "AdminQueue" (
  "id" TEXT NOT NULL,
  "type" "AdminQueueType" NOT NULL,
  "status" "AdminQueueStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payload" JSONB,
  "requestedBy" TEXT NOT NULL,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminQueue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminQueue_status_createdAt_idx" ON "AdminQueue"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AdminQueue_type_status_idx" ON "AdminQueue"("type", "status");
CREATE INDEX IF NOT EXISTS "AdminQueue_requestedBy_idx" ON "AdminQueue"("requestedBy");

-- ── 2. SocialExperiment 테이블 (SocialPost가 참조하므로 먼저 생성) ──

CREATE TABLE IF NOT EXISTS "SocialExperiment" (
  "id" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "hypothesis" TEXT NOT NULL,
  "variable" TEXT NOT NULL,
  "controlValue" TEXT NOT NULL,
  "testValue" TEXT NOT NULL,
  "status" "ExperimentStatus" NOT NULL DEFAULT 'PLANNING',
  "results" JSONB,
  "learnings" TEXT,
  "nextAction" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialExperiment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SocialExperiment_status_idx" ON "SocialExperiment"("status");
CREATE INDEX IF NOT EXISTS "SocialExperiment_weekNumber_idx" ON "SocialExperiment"("weekNumber");

-- ── 3. SocialPost 테이블 ──

CREATE TABLE IF NOT EXISTS "SocialPost" (
  "id" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "experimentId" TEXT,
  "contentType" TEXT NOT NULL,
  "tone" TEXT,
  "personaId" TEXT,
  "promotionLevel" TEXT NOT NULL DEFAULT 'PURE',
  "postText" TEXT NOT NULL,
  "hashtags" TEXT[],
  "sourcePostId" TEXT,
  "platformPostId" TEXT,
  "postingSlot" TEXT,
  "linkUrl" TEXT,
  "imageUrls" TEXT[],
  "cardNewsType" TEXT,
  "metrics" JSONB,
  "metricsUpdatedAt" TIMESTAMP(3),
  "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "postedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_experimentId_fkey"
  FOREIGN KEY ("experimentId") REFERENCES "SocialExperiment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "SocialPost_platform_createdAt_idx" ON "SocialPost"("platform", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SocialPost_experimentId_idx" ON "SocialPost"("experimentId");

-- ── 4. Popup 테이블 ──

CREATE TABLE IF NOT EXISTS "Popup" (
  "id" TEXT NOT NULL,
  "type" "PopupType" NOT NULL,
  "target" "PopupTarget" NOT NULL DEFAULT 'ALL',
  "targetPaths" TEXT[],
  "title" TEXT,
  "content" TEXT,
  "imageUrl" TEXT,
  "linkUrl" TEXT,
  "buttonText" TEXT DEFAULT '확인',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "showOncePerDay" BOOLEAN NOT NULL DEFAULT false,
  "hideForDays" INTEGER,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Popup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Popup_isActive_startDate_endDate_idx" ON "Popup"("isActive", "startDate", "endDate");
CREATE INDEX IF NOT EXISTS "Popup_type_idx" ON "Popup"("type");
