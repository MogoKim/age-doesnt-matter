-- trendingScore 정렬 성능 개선: 인덱스 추가
-- Best 페이지(getTrendingPosts, getDailyTrendingPosts, getWeeklyTrendingPosts)에서
-- Full Table Scan 발생 → 인덱스로 개선

CREATE INDEX IF NOT EXISTS "Post_status_trendingScore_idx" ON "Post"("status", "trendingScore" DESC);
CREATE INDEX IF NOT EXISTS "Post_boardType_status_trendingScore_idx" ON "Post"("boardType", "status", "trendingScore" DESC);
