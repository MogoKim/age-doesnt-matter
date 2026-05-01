-- AlterTable: EventLog에 isBot, botType 필드 추가
ALTER TABLE "EventLog" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventLog" ADD COLUMN "botType" TEXT;

-- CreateIndex: isBot + createdAt 복합 인덱스 (CDO KPI 쿼리 최적화)
CREATE INDEX "EventLog_isBot_createdAt_idx" ON "EventLog"("isBot", "createdAt" DESC);
