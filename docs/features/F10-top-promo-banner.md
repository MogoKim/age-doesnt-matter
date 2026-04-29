---
id: F10
name: 최상단 띠 배너
status: ACTIVE
created: 2026-04-29
updated: 2026-04-29
---

## 개요

전 페이지 최상단에 노출되는 홍보 띠 배너.
**비회원(GUEST)** 과 **회원(MEMBER)** 에게 서로 다른 배너를 표시하며,
어드민에서 각각 독립적으로 워딩·링크를 실시간 변경할 수 있다.

## 코드 위치

| 역할 | 파일 |
|------|------|
| 서버 컴포넌트 (세션 분기 + DB 조회) | `src/components/layouts/TopPromoBanner.tsx` |
| 클라이언트 컴포넌트 (닫기 + URL 분기) | `src/components/layouts/TopPromoBannerClient.tsx` |
| 어드민 관리 패널 | `src/components/admin/TopPromoBannerPanel.tsx` |
| 어드민 Server Action | `src/lib/actions/admin/admin.config.ts` → `adminUpdateTopPromoBanner` |
| 어드민 Query | `src/lib/queries/admin/admin.config.ts` → `getGuestPromoSettings` / `getMemberPromoSettings` |
| 어드민 페이지 진입 | `/admin/banners?tab=top-promo` |

## 배너 타입

| 타입 | 대상 | 목적 |
|------|------|------|
| **GUEST** | 비로그인 유저 | 회원가입 유도 (예: `가입 · 지금 가입하면 혜택이 가득`) |
| **MEMBER** | 로그인 유저 | 공지 · 이벤트 · 신기능 안내 (예: `공지 · 새 매거진이 발행됐어요`) |

- 각 타입은 **독립적으로** 활성화/비활성화
- 해당 타입이 꺼져 있거나 텍스트가 비어있으면 배너 영역 완전 숨김

## DB 설정값 (Setting 테이블)

| 키 | 설명 | 제약 |
|----|------|------|
| `TOP_PROMO_GUEST_ENABLED` | 비회원 배너 활성화 여부 | `'true'` / `'false'` |
| `TOP_PROMO_GUEST_TAG` | 비회원 태그 칩 텍스트 | 최대 4자 |
| `TOP_PROMO_GUEST_TEXT` | 비회원 본문 텍스트 | 최대 20자 (모바일 1줄 기준) |
| `TOP_PROMO_GUEST_HREF` | 비회원 클릭 링크 | 내부 `/` 또는 외부 `https://` |
| `TOP_PROMO_MEMBER_ENABLED` | 회원 배너 활성화 여부 | `'true'` / `'false'` |
| `TOP_PROMO_MEMBER_TAG` | 회원 태그 칩 텍스트 | 최대 4자 |
| `TOP_PROMO_MEMBER_TEXT` | 회원 본문 텍스트 | 최대 20자 (모바일 1줄 기준) |
| `TOP_PROMO_MEMBER_HREF` | 회원 클릭 링크 | 내부 `/` 또는 외부 `https://` |

> **구 키(`TOP_PROMO_ENABLED/TAG/TEXT/HREF`)**: v2 전환 시 코드에서 제거됨. DB 레코드는 잔류(무해).

## URL 정책

| 유형 | 판별 기준 | 렌더 방식 |
|------|---------|---------|
| 내부 경로 | `/`로 시작 | Next.js `<Link>` — 같은 탭 |
| 외부 URL | `https://`로 시작 | `<a target="_blank" rel="noopener noreferrer">` — 새 탭 |
| 차단 | 그 외(`javascript:`, `http://`, 빈값) | Server Action에서 에러 반환 |

## 동작 방식

```
TopPromoBanner (Server Component)
  ├─ auth() → session?.user 있으면 MEMBER, 없으면 GUEST 분기
  │            (JWT 방식 — DB 조회 없음, 성능 영향 없음)
  ├─ getMemberPromoSettings() — unstable_cache (60초, tag: 'top-promo-member')
  └─ getGuestPromoSettings()  — unstable_cache (60초, tag: 'top-promo-guest')
```

**캐싱 원칙**: `auth()`는 캐시 밖에서 세션 분기, 캐시는 설정값(DB 데이터)만 담당.
`unstable_cache` 안에서 `auth()` 호출 금지 — 캐시 오염 위험.

**즉시 반영**: 어드민 저장 시 해당 타입의 `revalidateTag` → 60초 내 반영.

**닫기 동작**:
- 비회원 닫기 키: `sessionStorage('top-promo-guest-dismissed')` — 탭 세션 단위
- 회원 닫기 키: `sessionStorage('top-promo-member-dismissed')` — 탭 세션 단위
- 두 키는 독립 → 비회원으로 닫아도 로그인 후 MEMBER 배너 새로 노출됨

## 어드민 UI

`/admin/banners?tab=top-promo` — 비회원/회원 두 섹션 독립 운영

- 각 섹션: 미리보기 + 활성화 토글 + 태그 + 텍스트 + 링크 유형(내부|외부) + [저장]
- 외부 URL 선택 시 `⚠️ 클릭 시 새 탭으로 열립니다` 경고 표시
- [저장] 버튼은 각 섹션 독립 — 한쪽 수정이 다른 쪽에 영향 없음

## 수정 이력

| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-04-29 | 기능 신규 등록(v1). CLS fix, h-[44px] 고정, 터치 타겟 44px, text-caption, unstable_cache, 어드민 패널 신규 | 전수 검수 후 6개 이슈 개선 |
| 2026-04-29 | v2 재설계. GUEST/MEMBER 배너 분리, 외부 URL 지원, 어드민 두 섹션 독립 운영 | 비회원 가입 유도 vs 회원 공지·이벤트 분리 운영 필요 |
