-- AlterTable: CafeTrend에 controversyTopics Json? 컬럼 추가
ALTER TABLE "CafeTrend" ADD COLUMN IF NOT EXISTS "controversyTopics" JSONB;
