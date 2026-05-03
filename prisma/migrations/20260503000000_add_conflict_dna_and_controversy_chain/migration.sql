-- AddColumn: CafePost 갈등 DNA 필드 5개
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "conflictTrigger" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "betrayalFactor" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "emotionalPeak" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "viralType" TEXT;
ALTER TABLE "CafePost" ADD COLUMN IF NOT EXISTS "commentSplit" INTEGER;

-- AddColumn: Post 논쟁 체인 추적 필드 2개
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isControversySeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "controversyChainId" TEXT;

-- AddColumn: BotLog 변주 엔진 기록 필드 1개
ALTER TABLE "BotLog" ADD COLUMN IF NOT EXISTS "variationType" TEXT;
