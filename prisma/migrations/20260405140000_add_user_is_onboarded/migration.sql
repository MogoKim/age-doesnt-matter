-- User.isOnboarded 필드 추가: 온보딩 Step3(관심사) 완료 여부 추적
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isOnboarded" BOOLEAN NOT NULL DEFAULT false;

-- 기존 유저(닉네임 직접 설정한 사람) → 온보딩 완료로 간주
-- user_ 로 시작하지 않는 닉네임 = 온보딩 Step1(닉네임 변경) 완료한 사람
UPDATE "User" SET "isOnboarded" = true WHERE "nickname" NOT LIKE 'user\_%' ESCAPE '\';
