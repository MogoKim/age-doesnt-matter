-- Grade 등급 체계 개편: VETERAN 제거 + HONORARY 신설
-- 새 순서: SPROUT → REGULAR → WARM_NEIGHBOR → HONORARY
--
-- ⚠️ 실행 전 확인: VETERAN 유저 수
-- SELECT COUNT(*) FROM "User" WHERE grade = 'VETERAN';

-- Step 1: HONORARY 새 enum 값 추가
ALTER TYPE "Grade" ADD VALUE IF NOT EXISTS 'HONORARY';

-- Step 2: 기존 VETERAN 유저를 WARM_NEIGHBOR로 이전 (마이그레이션 후 실행)
-- 이 SQL은 Supabase SQL Editor에서 별도 실행 필요:
-- UPDATE "User" SET "grade" = 'WARM_NEIGHBOR' WHERE "grade" = 'VETERAN';
--
-- ⚠️ PostgreSQL enum 값 제거(VETERAN)는 열 재생성이 필요하므로
--    VETERAN은 DB enum에 남겨두되 앱 레이어에서 사용하지 않음.
--    실사용자가 적은 지금 단계에서 VETERAN 유저 수 확인 후 개별 처리.
