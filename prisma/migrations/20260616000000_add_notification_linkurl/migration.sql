-- 공지 등 글과 무관한 알림의 이동 경로 저장(예: /best). 종 알림 클릭 시 사용.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT;
