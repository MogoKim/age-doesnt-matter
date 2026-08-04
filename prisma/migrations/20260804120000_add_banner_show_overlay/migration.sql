-- 홈 상단 구좌: 배너별 시스템 텍스트 오버레이 ON/OFF
--
-- 광고주가 문구까지 넣은 완성 소재를 주면 우리 제목·부제·CTA가 그 위에 겹쳐 광고가 깨진다.
-- 배너마다 켜고 끌 수 있게 컬럼을 추가한다.
--
-- 추가만 하는 마이그레이션이고 DEFAULT true라 기존 행은 전부 true로 채워진다
-- (= 지금 운영 중인 브랜드 히어로 문구가 그대로 유지된다).
-- 이 컬럼을 읽지 않는 이전 코드도 계속 동작하므로, 배포 전에 먼저 적용해도 안전하다.

ALTER TABLE "Banner" ADD COLUMN "showOverlay" BOOLEAN NOT NULL DEFAULT true;
