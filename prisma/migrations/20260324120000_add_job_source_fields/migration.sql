-- AlterTable
ALTER TABLE "JobDetail" ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JobDetail_sourceUrl_key" ON "JobDetail"("sourceUrl");

-- CreateIndex
CREATE INDEX "JobDetail_sourceUrl_idx" ON "JobDetail"("sourceUrl");
