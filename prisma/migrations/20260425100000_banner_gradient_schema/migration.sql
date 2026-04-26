-- Banner 모델 — 그라디언트 only 스키마 (v2.0)
-- 기존 컬럼 유지 (imageUrl NOT NULL 제약 보존, 1주일 후 별도 DROP 마이그레이션 예정)

ALTER TABLE "Banner" ADD COLUMN "slot"          TEXT NOT NULL DEFAULT 'HERO';
ALTER TABLE "Banner" ADD COLUMN "category"      TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "Banner" ADD COLUMN "subtitle"      TEXT;
ALTER TABLE "Banner" ADD COLUMN "themeColor"    TEXT NOT NULL DEFAULT '#FF6F61';
ALTER TABLE "Banner" ADD COLUMN "themeColorMid" TEXT;
ALTER TABLE "Banner" ADD COLUMN "themeColorEnd" TEXT;
ALTER TABLE "Banner" ADD COLUMN "ctaText"       TEXT;
ALTER TABLE "Banner" ADD COLUMN "ctaUrl"        TEXT;
ALTER TABLE "Banner" ADD COLUMN "displayOrder"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Banner" ADD COLUMN "startsAt"      TIMESTAMP(3);
ALTER TABLE "Banner" ADD COLUMN "endsAt"        TIMESTAMP(3);

-- imageUrl 기본값 설정 (신규 INSERT 시 빈 문자열 허용)
ALTER TABLE "Banner" ALTER COLUMN "imageUrl" SET DEFAULT '';
ALTER TABLE "Banner" ALTER COLUMN "startDate" SET DEFAULT NOW();
ALTER TABLE "Banner" ALTER COLUMN "endDate" SET DEFAULT NOW();

-- 신규 인덱스
CREATE INDEX "Banner_slot_isActive_displayOrder_idx"
  ON "Banner"("slot", "isActive", "displayOrder");

-- 시드: 초기 3장 Hero 슬라이드
INSERT INTO "Banner" (
  "id", "slot", "category", "title", "subtitle",
  "themeColor", "themeColorMid", "themeColorEnd",
  "ctaText", "ctaUrl", "displayOrder", "isActive",
  "imageUrl", "startDate", "endDate", "priority",
  "createdAt", "updatedAt"
) VALUES
(
  'hero-brand-001', 'HERO', 'BRAND',
  '우리 나이가\n어때서',
  '50대 60대가 직접 쓰는 커뮤니티',
  '#C4453B', '#FF6F61', '#FFB4A2',
  '지금 시작하기', '/about',
  1, true,
  '', NOW(), NOW(), 0,
  NOW(), NOW()
),
(
  'hero-life-002', 'HERO', 'LIFE_STORY',
  '오늘도\n이야기 나눠요',
  '따뜻한 공감과 유머가 있는 소통 공간',
  '#C7651E', '#E89456', '#FAC775',
  '사는이야기 보러가기', '/community/life',
  2, true,
  '', NOW(), NOW(), 0,
  NOW(), NOW()
),
(
  'hero-life2-003', 'HERO', 'LIFE2',
  '인생 2막,\n함께 준비해요',
  '건강, 취업, 귀농귀촌 — 실용 정보 가득',
  '#1B5E20', '#4A8C3A', '#97C459',
  '2막 준비 보러가기', '/community/life2',
  3, true,
  '', NOW(), NOW(), 0,
  NOW(), NOW()
)
ON CONFLICT ("id") DO NOTHING;
