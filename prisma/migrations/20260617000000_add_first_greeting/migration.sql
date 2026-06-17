-- 첫 참여 온보딩(가입인사) — 첫 가입인사 작성 이력 추적 컬럼.
-- firstGreetingAt: 첫 가입인사 글 작성 시각 (홈 B위젯 노출 판별 + 글 삭제해도 재노출 방지)
-- firstGreetingPostId: 첫 가입인사 글 ID
-- nullable ADD COLUMN이라 기존 행 영향 없음(메타데이터 변경, 락 짧음).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstGreetingAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstGreetingPostId" TEXT;
