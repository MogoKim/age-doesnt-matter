-- 마케팅 멀티채널 확장: SocialPlatform enum + SocialPost 필드 + ChannelDraft 모델

-- SocialPlatform enum 확장
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'FACEBOOK';
ALTER TYPE "SocialPlatform" ADD VALUE IF NOT EXISTS 'BAND';

-- SocialPost에 카드뉴스 필드 추가
ALTER TABLE "SocialPost" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SocialPost" ADD COLUMN "cardNewsType" TEXT;

-- ChannelDraft 테이블 (반자동 채널 마케팅 초안)
CREATE TABLE "ChannelDraft" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "targetName" TEXT NOT NULL,
  "draftText" TEXT NOT NULL,
  "linkUrl" TEXT,
  "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),

  CONSTRAINT "ChannelDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChannelDraft_channel_status_idx" ON "ChannelDraft"("channel", "status");
CREATE INDEX "ChannelDraft_createdAt_idx" ON "ChannelDraft"("createdAt" DESC);
