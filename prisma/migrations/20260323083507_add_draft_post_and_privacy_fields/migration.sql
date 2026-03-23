-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isGenderPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRegionPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DraftPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "boardSlug" TEXT NOT NULL,
    "category" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftPost_authorId_updatedAt_idx" ON "DraftPost"("authorId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "DraftPost" ADD CONSTRAINT "DraftPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
