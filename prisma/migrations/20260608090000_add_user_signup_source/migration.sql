-- 리텐션 4분면 분석용: User 가입 채널 기록 컬럼
-- 'TWA' | 'WEB' | NULL(UNKNOWN). nullable ADD COLUMN이라 기존 행 영향 없음(메타데이터 변경, 락 짧음).
-- 기록: src/app/api/events/route.ts 의 login 이벤트에서 browser_env/referrer로 1회 채움(auth 무변경).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupSource" TEXT;
