-- Add fifth user-post comment wave and retire multi-comment defaults.
ALTER TABLE "UserPostWaveQueue"
  ADD COLUMN "wave5At" TIMESTAMP(3),
  ADD COLUMN "wave5Count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "wave5Done" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "UserPostWaveQueue" ALTER COLUMN "wave2Count" SET DEFAULT 1;
ALTER TABLE "UserPostWaveQueue" ALTER COLUMN "wave3Count" SET DEFAULT 1;
ALTER TABLE "UserPostWaveQueue" ALTER COLUMN "wave4Count" SET DEFAULT 1;

CREATE INDEX "UserPostWaveQueue_wave5Done_wave5At_idx" ON "UserPostWaveQueue"("wave5Done", "wave5At");
