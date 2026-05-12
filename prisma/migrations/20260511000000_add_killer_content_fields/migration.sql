-- AlterTable: Post 모델에 킬러 컨텐츠 마킹 필드 추가
ALTER TABLE "Post" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "featuredAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "cafePostId" TEXT;
