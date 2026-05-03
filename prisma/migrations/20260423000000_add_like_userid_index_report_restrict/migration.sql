-- FIX-10: Like 테이블 userId 단독 인덱스 추가
-- 목적: 프로필 페이지 등 userId 단독 필터 쿼리 성능 개선
-- (composite @@unique([userId, postId/commentId]) 는 leading column 커버하지만
--  NULL postId 케이스나 단독 userId 스캔 시 단독 인덱스가 더 효율적)
CREATE INDEX "Like_userId_idx" ON "Like"("userId");

-- FIX-13: Report 테이블 CASCADE → RESTRICT
-- 목적: 게시글/댓글 하드 삭제 시 신고 감사 기록 자동 소실 방지
-- 현황: 코드베이스에 하드 삭제 없음 (소프트 삭제만 사용) → 기존 기능 영향 없음
-- 효과: 향후 실수로 hard delete 추가 시 DB 레벨에서 차단

-- Report.postId FK: Cascade → Restrict
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_postId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Report.commentId FK: Cascade → Restrict
ALTER TABLE "Report" DROP CONSTRAINT IF EXISTS "Report_commentId_fkey";
ALTER TABLE "Report" ADD CONSTRAINT "Report_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
