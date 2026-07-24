-- 갱년기 톡 보드(PR-1): BoardType enum에 MENOPAUSE 추가
-- ⚠️ Supabase: enum ADD VALUE는 트랜잭션 안에서 실행 불가 → SQL Editor에서 수동 실행 필요
-- (.claude/commands/prisma-guide/references/enum-migration.md 참조)
ALTER TYPE "BoardType" ADD VALUE 'MENOPAUSE';
