-- CreateTable
CREATE TABLE "DailyKpiSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "uv" INTEGER NOT NULL DEFAULT 0,
    "pv" INTEGER NOT NULL DEFAULT 0,
    "memberUv" INTEGER NOT NULL DEFAULT 0,
    "guestUv" INTEGER NOT NULL DEFAULT 0,
    "memberPv" INTEGER NOT NULL DEFAULT 0,
    "guestPv" INTEGER NOT NULL DEFAULT 0,
    "newSignups" INTEGER NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION,
    "userPosts" INTEGER NOT NULL DEFAULT 0,
    "userComments" INTEGER NOT NULL DEFAULT 0,
    "wau" INTEGER NOT NULL DEFAULT 0,
    "realCustomers" INTEGER NOT NULL DEFAULT 0,
    "channels" JSONB,
    "retention" JSONB,
    "dataQuality" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyKpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyKpiSnapshot_date_key" ON "DailyKpiSnapshot"("date");

-- CreateIndex
CREATE INDEX "DailyKpiSnapshot_date_idx" ON "DailyKpiSnapshot"("date");
