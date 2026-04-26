-- PostView 테이블 생성 (SeenPosts 기능 — Phase 8에서 코드 연동 예정)

CREATE TABLE "PostView" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "postId"      TEXT NOT NULL,
  "viewedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readPercent" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "PostView_pkey" PRIMARY KEY ("id")
);

-- 외래키
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 인덱스
CREATE UNIQUE INDEX "PostView_userId_postId_key" ON "PostView"("userId", "postId");
CREATE INDEX "PostView_userId_viewedAt_idx" ON "PostView"("userId", "viewedAt");
