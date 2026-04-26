-- Setting 테이블 생성 (TopPromoBanner 실시간 관리용 key-value 스토어)

CREATE TABLE "Setting" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- TopPromoBanner 초기 시드
INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES
('TOP_PROMO_ENABLED', 'true',                                    NOW()),
('TOP_PROMO_TAG',     '소개',                                    NOW()),
('TOP_PROMO_TEXT',    '우리 또래 이야기, 우리 나이가 어때서',   NOW()),
('TOP_PROMO_HREF',    '/about',                                   NOW());
