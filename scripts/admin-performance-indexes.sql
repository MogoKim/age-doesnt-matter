-- 어드민 성능 최적화 인덱스 (Supabase SQL Editor에서 실행)
-- 2026-03-29

-- User.lastLoginAt 단독 인덱스 (DAU/WAU/MAU 쿼리 최적화)
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx" ON "User"("lastLoginAt" DESC);

-- Report.status 단독 인덱스 (미처리 신고 카운트)
CREATE INDEX IF NOT EXISTS "Report_status_idx" ON "Report"("status");

-- BotLog.reviewPendingCount 부분 인덱스 (봇 검수 대기 카운트)
CREATE INDEX IF NOT EXISTS "BotLog_reviewPendingCount_idx" ON "BotLog"("reviewPendingCount") WHERE "reviewPendingCount" > 0;
