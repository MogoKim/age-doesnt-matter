-- 어드민 대시보드·인사이트 성능 개선: 복합 인덱스 추가
-- 대상 쿼리: eventName='page_view' AND isBot=false AND createdAt>=X (distinct sessionId / count)
--   getDashboardStats, getMonthlyOkrStats, getDailyTrend (admin.dashboard.ts)
--   getInsights 채널/리텐션 (admin.insights.ts)
-- 기존 (eventName,createdAt)·(isBot,createdAt) 단독 인덱스로는 isBot 필터가 인덱스를 못 타 풀스캔 발생.
-- ⚠️ EventLog가 대용량이면 인덱스 생성 중 쓰기가 잠깐 잠금될 수 있음 → 트래픽 적은 시간대 배포 권장.

CREATE INDEX IF NOT EXISTS "EventLog_eventName_isBot_createdAt_idx" ON "EventLog"("eventName", "isBot", "createdAt" DESC);
