-- CreateTable
CREATE TABLE "UserPostWaveQueue" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "wave1At" TIMESTAMP(3) NOT NULL,
    "wave2At" TIMESTAMP(3) NOT NULL,
    "wave3At" TIMESTAMP(3) NOT NULL,
    "wave4At" TIMESTAMP(3) NOT NULL,
    "wave1Count" INTEGER NOT NULL DEFAULT 1,
    "wave2Count" INTEGER NOT NULL DEFAULT 2,
    "wave3Count" INTEGER NOT NULL DEFAULT 3,
    "wave4Count" INTEGER NOT NULL DEFAULT 3,
    "wave1Done" BOOLEAN NOT NULL DEFAULT false,
    "wave2Done" BOOLEAN NOT NULL DEFAULT false,
    "wave3Done" BOOLEAN NOT NULL DEFAULT false,
    "wave4Done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPostWaveQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPostWaveQueue_wave1Done_wave1At_idx" ON "UserPostWaveQueue"("wave1Done", "wave1At");

-- CreateIndex
CREATE INDEX "UserPostWaveQueue_wave2Done_wave2At_idx" ON "UserPostWaveQueue"("wave2Done", "wave2At");

-- CreateIndex
CREATE INDEX "UserPostWaveQueue_wave3Done_wave3At_idx" ON "UserPostWaveQueue"("wave3Done", "wave3At");

-- CreateIndex
CREATE INDEX "UserPostWaveQueue_wave4Done_wave4At_idx" ON "UserPostWaveQueue"("wave4Done", "wave4At");

-- CreateIndex
CREATE INDEX "UserPostWaveQueue_expiresAt_idx" ON "UserPostWaveQueue"("expiresAt");
