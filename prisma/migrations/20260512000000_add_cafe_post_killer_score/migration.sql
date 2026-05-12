-- AlterTable: CafePost에 화제성글 전용 품질 점수 컬럼 추가
ALTER TABLE "CafePost" ADD COLUMN "killerScore" DOUBLE PRECISION NOT NULL DEFAULT 0;
