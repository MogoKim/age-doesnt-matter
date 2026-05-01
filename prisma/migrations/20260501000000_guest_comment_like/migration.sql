-- AlterTable: Comment.authorId nullable + guest fields
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "Comment" ADD COLUMN "guestNickname" TEXT;
ALTER TABLE "Comment" ADD COLUMN "guestPasswordHash" TEXT;
ALTER TABLE "Comment" ADD COLUMN "guestPasswordAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Comment" ADD COLUMN "guestLockedUntil" TIMESTAMP(3);

-- Drop and recreate Comment_authorId_fkey with ON DELETE SET NULL
ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_authorId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: GuestLike
CREATE TABLE "GuestLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "ipHash" TEXT NOT NULL,
    "cookieId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: GuestLike unique + index
CREATE UNIQUE INDEX "GuestLike_postId_ipHash_key" ON "GuestLike"("postId", "ipHash");
CREATE UNIQUE INDEX "GuestLike_postId_cookieId_key" ON "GuestLike"("postId", "cookieId");
CREATE UNIQUE INDEX "GuestLike_commentId_ipHash_key" ON "GuestLike"("commentId", "ipHash");
CREATE UNIQUE INDEX "GuestLike_commentId_cookieId_key" ON "GuestLike"("commentId", "cookieId");
CREATE INDEX "GuestLike_postId_idx" ON "GuestLike"("postId");
CREATE INDEX "GuestLike_commentId_idx" ON "GuestLike"("commentId");

-- AddForeignKey: GuestLike -> Post (cascade)
ALTER TABLE "GuestLike" ADD CONSTRAINT "GuestLike_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: GuestLike -> Comment (cascade)
ALTER TABLE "GuestLike" ADD CONSTRAINT "GuestLike_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Report.userId nullable
ALTER TABLE "Report" ALTER COLUMN "userId" DROP NOT NULL;

-- Drop and recreate Report_userId_fkey allowing nullable
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_userId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
