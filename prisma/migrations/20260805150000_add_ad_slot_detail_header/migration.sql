-- 상세 상단 띠배너(DETAIL_HEADER) 구좌 — AdSlot enum에 값 1개 추가
--
-- ⚠️ PostgreSQL/Supabase: enum ADD VALUE는 트랜잭션 안에서 실행할 수 없다.
--    prisma migrate deploy가 트랜잭션으로 감싸면 실패하므로,
--    Supabase SQL Editor에서 아래 한 줄을 수동으로 먼저 실행한다.
--    (.claude/commands/prisma-guide/references/enum-migration.md 참조)
--
-- IF NOT EXISTS를 붙여 재실행해도 안전하게 만든다 — 수동 실행 후
-- 이 파일이 다시 적용돼도 오류로 배포가 멈추지 않는다.
ALTER TYPE "AdSlot" ADD VALUE IF NOT EXISTS 'DETAIL_HEADER';
