-- CreateTable
CREATE TABLE "AppHandoffToken" (
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppHandoffToken_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX "AppHandoffToken_expiresAt_idx" ON "AppHandoffToken"("expiresAt");
