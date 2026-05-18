-- AlterTable: User 에 phone 필드 추가 (카카오 전화번호 선택 동의)
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- CreateIndex: phone unique 제약
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
