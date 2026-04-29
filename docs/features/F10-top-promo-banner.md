---
id: F10
name: 최상단 띠 배너
status: ACTIVE
created: 2026-04-29
updated: 2026-04-29
---

## 개요

전 페이지 최상단에 노출되는 홍보 띠 배너. DB Setting 테이블에서 실시간 설정값을 읽어 렌더하며, 어드민에서 워딩·링크를 자유롭게 변경할 수 있다.

## 코드 위치

| 역할 | 파일 |
|------|------|
| 서버 컴포넌트 (DB 조회) | `src/components/layouts/TopPromoBanner.tsx` |
| 클라이언트 컴포넌트 (닫기) | `src/components/layouts/TopPromoBannerClient.tsx` |
| 어드민 관리 패널 | `src/components/admin/TopPromoBannerPanel.tsx` |
| 어드민 Server Action | `src/lib/actions/admin/admin.config.ts` → `adminUpdateTopPromoBanner` |
| 어드민 Query | `src/lib/queries/admin/admin.config.ts` → `getTopPromoSettings` |
| 어드민 페이지 진입 | `/admin/banners?tab=top-promo` |

## DB 설정값 (Setting 테이블)

| 키 | 설명 | 제약 |
|----|------|------|
| `TOP_PROMO_ENABLED` | 배너 활성화 여부 | `'true'` / `'false'` |
| `TOP_PROMO_TAG` | 태그 칩 텍스트 | 최대 4자 |
| `TOP_PROMO_TEXT` | 본문 텍스트 | 최대 20자 (모바일 1줄 기준) |
| `TOP_PROMO_HREF` | 클릭 링크 | /로 시작하는 내부 경로 |

## 동작 방식

- `unstable_cache` (60초 TTL, tag: `top-promo-settings`) 로 DB 쿼리 캐싱
- 어드민 저장 시 `revalidateTag('top-promo-settings')` → 즉시 반영
- 닫기: `sessionStorage('top-promo-dismissed')` — 탭 세션 단위
- `enabled=false` 또는 `text` 비어있으면 서버에서 null 반환 → 배너 숨김

## 수정 이력

| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-04-29 | 기능 신규 등록. CLS fix(useState true), h-[44px] 고정, 터치 타겟 44px, text-caption, unstable_cache, 어드민 패널 신규 | 전수 검수 후 6개 이슈 개선 |
