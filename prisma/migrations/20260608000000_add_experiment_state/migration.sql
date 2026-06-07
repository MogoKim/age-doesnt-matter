-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'EXPERIMENT';

-- CreateTable
CREATE TABLE "ExperimentState" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "owner" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "note" TEXT,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentState_experimentId_key" ON "ExperimentState"("experimentId");
