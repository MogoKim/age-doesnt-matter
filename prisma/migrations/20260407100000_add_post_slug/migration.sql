-- AlterTable: Post에 slug 필드 추가 (매거진 URL 슬러그)
ALTER TABLE "Post" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
