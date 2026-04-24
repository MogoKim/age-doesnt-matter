-- Post.shareCount 필드 추가: 공유 시 +1 집계
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "shareCount" INTEGER NOT NULL DEFAULT 0;
