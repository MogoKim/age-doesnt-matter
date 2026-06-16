-- 전체 공지 성과 추적: Notice 테이블 + Notification 묶음(noticeId)/클릭(clickedAt) 필드

CREATE TABLE IF NOT EXISTS "Notice" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "url" TEXT NOT NULL DEFAULT '/',
  "sentBell" INTEGER NOT NULL DEFAULT 0,
  "sentPush" INTEGER NOT NULL DEFAULT 0,
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notice_createdAt_idx" ON "Notice"("createdAt" DESC);

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "noticeId" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Notification_noticeId_idx" ON "Notification"("noticeId");

-- FK (공지 삭제 시 알림의 noticeId는 NULL로). 이미 있으면 무시.
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_noticeId_fkey"
    FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
