# F13 — 게시글 하단 CTA (PostCTA)

## 개요
게시글/매거진 상세 하단에 인라인 CTA를 표시해 전환·리텐션을 높인다.
- **비회원**: "가입하면 공감·댓글·저장까지 할 수 있어요" → 카카오 로그인
- **모바일웹 로그인**: "앱처럼 설치하면 더 빠르게 읽을 수 있어요" → PWA 설치 프롬프트
- **TWA/standalone/이미 설치됨**: 전체 숨김

## 코드 위치
- `src/components/features/community/PostCTA.tsx` — 클라이언트 컴포넌트
- `src/app/(main)/community/[boardSlug]/[postId]/page.tsx` — ActionBar 아래 삽입 (**현재 유일한 삽입 지점**)

> ⚠️ 매거진 상세(`src/app/(main)/magazine/[id]/page.tsx`)에는 **PostCTA가 없다.** 초판 문서에 "삽입"으로 적혀 있었으나 코드에 존재한 적이 확인되지 않는다. 매거진에도 붙일지는 별도 결정 사항.

## 표시 조건 (코드 기준)

| 상태 | 표시 내용 |
|------|---------|
| 비로그인 | **가입 CTA** — 모바일·데스크탑·앱·TWA·standalone 포함 **모든 환경**에서 노출 (환경 가드 없음) |
| 로그인 + **Android 외부 브라우저** + 미설치 | **앱설치 CTA** → Play스토어 이동 (`triggerAppInstall` → `buildPlayStoreUrl('post_cta')`) |
| 로그인 + iOS Safari + 미설치 | **`NEXT_PUBLIC_PWA_INSTALL_ENABLED === 'true'`일 때만** 앱설치 CTA(홈 화면에 추가). 플래그 OFF면 숨김 — 아래 주 참고 |
| 로그인 + desktop / kakao-android / kakao-ios / naver-inapp / google-inapp / instagram-inapp / crios | 설치 CTA 숨김 (`INSTALL_BLOCKED_ENVS`) |
| 로그인 + TWA / Capacitor 앱 / standalone PWA / `pwa_installed==='1'` | 설치 CTA 숨김 |

> **"Android 외부 브라우저"란(2026-08-06)**: Chrome뿐 아니라 **Whale(네이버 웨일 브라우저)·Samsung Internet·Firefox** 등 안드로이드 일반 브라우저를 모두 포함한다. 카카오·**네이버 앱**·Instagram/Facebook·Google 앱 **인앱브라우저**와 안드로이드 WebView는 제외한다. ⚠️ **웨일 브라우저 ≠ 네이버 앱 인앱브라우저** — 전자는 포함, 후자는 제외다. 판정 정본은 `src/lib/browser-env.ts`, 대표 UA 회귀 테스트는 `src/__tests__/browser-env.test.ts`.
>
> **iOS 플래그 연동 이유(2026-08-06)**: iOS 경로의 `triggerAppInstall()`은 `pwa-prompt` 커스텀 이벤트를 dispatch할 뿐이고, 그 리스너는 `AddToHomeScreen`이 `NEXT_PUBLIC_PWA_INSTALL_ENABLED === 'true'`일 때만 등록한다. 플래그가 꺼져 있으면 버튼을 눌러도 화면에 아무 변화가 없어 헛클릭이 된다(클릭 이벤트만 기록됨). 그래서 **환경이 아니라 플래그를 보고** CTA를 감춘다 — 플래그를 켜면 iOS 안내가 그대로 되살아난다. 안드로이드 Play스토어 경로는 이 플래그와 무관하게 항상 동작한다.

## 이벤트 로그

| 이벤트 | 시점 | properties |
|--------|------|-----------|
| `post_cta_shown` | 마운트 | `{ cta_type: 'signup'\|'install', post_id, post_title }` |
| `post_cta_clicked` | 버튼 클릭 | 동일 |

기록 방법: `trackEvent()` (EventLog DB) + `sendGtmEvent()` (GA4)

## 구현 메모
- `useState<boolean | null>(null)` — null=미계산(SSR 안전), false=숨김, true=표시
- `detectEnv()` (`AddToHomeScreen.tsx` export) + `localStorage['pwa_installed']`로 설치 여부 판단
- 비회원 CTA는 `sessionStorage.signup_prompt_shown_this_session`을 **설정하지 않는다** (2026-06-08 제거). 따라서 글 상세에서 PostCTA(하단 인라인)와 SignupPromptBanner(정독 완료 띠배너)는 **공존한다.**

## 수정 이력

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-06-03 | 신규 생성 — 비회원 가입 CTA + 로그인 모바일웹 앱설치 CTA | 게시글 읽기 후 인라인 전환 유도 |
| 2026-06-08 | 비회원 CTA의 `signup_prompt_shown_this_session` 설정 제거 (코드 변경, 문서 미반영분) | 글 상세 정독 동선 배너와 공존 허용 — 효과를 타이밍으로 측정 |
| 2026-08-06 | **문서를 코드 기준으로 정정** — ① 매거진 상세 삽입 기술 삭제(실제 없음) ② 표시 조건 표에 실제 `INSTALL_BLOCKED_ENVS`·Capacitor·`pwa_installed` 반영 ③ 구현 메모의 `signup_prompt_shown_this_session` 설명을 현행(설정 안 함)으로 교정 | 문서가 코드와 반대로 적혀 있어 중복 노출 판단을 오도 |
| 2026-08-06 | **iOS 설치 CTA를 `NEXT_PUBLIC_PWA_INSTALL_ENABLED` 연동으로 변경** (`PostCTA.tsx`) | 플래그 OFF 상태에서 iOS 회원에게 보이던 무반응 버튼 제거. 안드로이드 Play 경로·TWA/Capacitor/standalone 차단 정책은 무변경 |
| 2026-08-06 | **Android 판정을 `isAndroidExternalBrowserEnv`로 교체** (`isAndroidInstallEnv` 대체). Whale·Samsung Internet 포함, 인앱·WebView·창 좁힌 데스크탑 제외 | 실험 분모가 되는 판정 안전화. 종전 판정은 `innerWidth<1024` 데스크탑을 안드로이드로 오분류했다 |
| 2026-08-06 | Play스토어 이동 referrer의 `utm_medium`이 `post_cta`로 실린다 (종전 `footer` 고정) | 진입점별 설치 어트리뷰션 분리 — 실험 계측 오염 방지 |
