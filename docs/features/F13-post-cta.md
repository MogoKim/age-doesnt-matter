# F13 — 게시글 하단 CTA (PostCTA)

## 개요
게시글/매거진 상세 하단에 인라인 CTA를 표시해 전환·리텐션을 높인다.
- **비회원**: "가입하면 공감·댓글·저장까지 할 수 있어요" → 카카오 로그인
- **모바일웹 로그인**: "앱처럼 설치하면 더 빠르게 읽을 수 있어요" → PWA 설치 프롬프트
- **TWA/standalone/이미 설치됨**: 전체 숨김

## 코드 위치
- `src/components/features/community/PostCTA.tsx` — 클라이언트 컴포넌트
- `src/app/(main)/community/[boardSlug]/[postId]/page.tsx` — ActionBar 아래 삽입
- `src/app/(main)/magazine/[id]/page.tsx` — ActionBar 아래 삽입

## 표시 조건

| 상태 | 표시 내용 |
|------|---------|
| 비로그인 | 가입 CTA (모바일·데스크탑 모두) |
| 로그인 + 모바일웹 + 미설치 | 앱설치 CTA |
| 로그인 + desktop/kakao-android/kakao-ios/인앱/crios | 숨김 |
| TWA 또는 standalone | 전체 숨김 |

## 이벤트 로그

| 이벤트 | 시점 | properties |
|--------|------|-----------|
| `post_cta_shown` | 마운트 | `{ cta_type: 'signup'\|'install', post_id, post_title }` |
| `post_cta_clicked` | 버튼 클릭 | 동일 |

기록 방법: `trackEvent()` (EventLog DB) + `sendGtmEvent()` (GA4)

## 구현 메모
- `useState<boolean | null>(null)` — null=미계산(SSR 안전), false=숨김, true=표시
- `detectEnv()` (`AddToHomeScreen.tsx` export) + `localStorage['pwa_installed']`로 설치 여부 판단
- 비회원 CTA: `sessionStorage.signup_prompt_shown_this_session = '1'` 설정 → SignupPromptBanner와 중복 방지용

## 수정 이력

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-06-03 | 신규 생성 — 비회원 가입 CTA + 로그인 모바일웹 앱설치 CTA | 게시글 읽기 후 인라인 전환 유도 |
