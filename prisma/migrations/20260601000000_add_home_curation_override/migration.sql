-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "HomeCurationSection" AS ENUM ('TRENDING', 'STORIES', 'HUMOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "HomeCurationAction" AS ENUM ('PIN', 'HIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "HomeCurationOverride" (
    "id" TEXT NOT NULL,
    "section" "HomeCurationSection" NOT NULL,
    "postId" TEXT NOT NULL,
    "action" "HomeCurationAction" NOT NULL,
    "position" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeCurationOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "HomeCurationOverride_section_isActive_idx" ON "HomeCurationOverride"("section", "isActive");
CREATE INDEX IF NOT EXISTS "HomeCurationOverride_postId_idx" ON "HomeCurationOverride"("postId");
CREATE INDEX IF NOT EXISTS "HomeCurationOverride_createdByAdminId_idx" ON "HomeCurationOverride"("createdByAdminId");
CREATE INDEX IF NOT EXISTS "HomeCurationOverride_createdAt_idx" ON "HomeCurationOverride"("createdAt");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "HomeCurationOverride" ADD CONSTRAINT "HomeCurationOverride_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "HomeCurationOverride" ADD CONSTRAINT "HomeCurationOverride_createdByAdminId_fkey"
    FOREIGN KEY ("createdByAdminId") REFERENCES "AdminAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
