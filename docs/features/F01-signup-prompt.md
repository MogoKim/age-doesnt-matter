# 회원가입 유도 배너 운영 기획서 (F01)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-08-06

---

## 목표

로그인 없이 콘텐츠를 탐색하는 비회원에게 자연스럽게 회원가입을 유도한다.
강제 팝업이 아닌 체류 + 스크롤 조건을 충족한 사용자에게만 노출해 거부감을 최소화한다.

---

## 배경

- 우나어는 50~60대 커뮤니티 — 회원가입 허들을 낮추는 것이 핵심
- 카카오 로그인 1버튼 가입 구조 → 진입 장벽 최소화
- 비회원도 콘텐츠를 충분히 탐색한 뒤 가입 의향이 생겼을 때 제안 → 전환율 ↑
- 인앱 브라우저 → 외부 브라우저 유도 시 `?signup=1` 파라미터로 자동 트리거

---

## 세부 기획

> 아래는 **현재 코드 기준**(`SignupPromptBanner.tsx`, 2026-08-06 대조)이다.
> 이 기능에는 운영 ON/OFF 환경변수가 없다 — 코드가 곧 운영 상태다.

### 노출 조건 (AND 조건)

| 조건 | 값 | 코드 |
|------|-----|------|
| 비로그인 상태 | `status !== 'authenticated'` | `:108,190` |
| 앱 환경 제외 | TWA · Capacitor 앱에서는 미노출 (standalone PWA는 **미제외**) | `:109,190` |
| 발동 트리거 | 정독 **85%** 도달 **또는** **60초** 백스톱 — 둘 중 먼저 충족되는 쪽 | `READ_COMPLETE_SCROLL=0.85` / `BACKSTOP_MS=60_000` |
| 세션 표시 제한 | 세션당 1회 (sessionStorage: `signup_prompt_shown_this_session`) | `:48,73` |
| 누적 표시 제한 | `MAX_SHOWS=4` 도달 시 영구 정지 (localStorage: `signup_prompt_count` → `signup_prompt_done`) | `:30,45,46,84` |
| 활성 경로 | `/community/`, `/magazine/`, `/jobs/`, `/best` | `CONTENT_PATHS` |
| 제외 경로 | `/`(홈, SignupCard가 대체) · `/login` `/signup` `/onboarding` `/my` `/admin` `/terms` `/privacy` `/rules` `/about` `/contact` `/grade` `/error` `/_next` `/api` | `EXCLUDED_PATHS` |

**예외 (auto-trigger)**: `?signup=1` + `utm_source` ∈ {`kakao-android`, `kakao-ios`, `naver-inapp`, `google-inapp`} → 5초 카운트다운 배너 후 **자동 OAuth 시작**. 탭당 1회(sessionStorage: `signup_auto_triggered`).

### 🟢 진행 중 실험 — `android_conversion_a2_b2` (2026-08-06 21:00 KST~)

이 배너는 **Android 외부 브라우저 비회원**에게만 A/B로 갈린다. 그 외 사용자는 아래 고정 문구 그대로다.

| variant | 내용 | CTA |
|---|---|---|
| `signup_warm` (50%) | 🌿 / "같이 이야기해도 괜찮아요" / "우리 또래끼리 편하게 나눠요" | 카카오 옐로우 `💛 카카오로 1초 가입` → 기존 카카오 가입 |
| `app_card` (50%) | "앱으로 보면 더 편해요" / "한 번 받아두면 다음엔 바로 들어올 수 있어요" + 우나어 앱 아이콘 카드 | 브랜드 코랄 `앱으로 보기` → Play스토어 |

- **트리거·횟수 정책 무변경**: 정독 85% / 60초 백스톱, 세션 1회, `MAX_SHOWS=4`. `app_card`도 배너 노출 1회로 계산한다.
- **제외**: 회원 · 인앱브라우저(카카오·**네이버 앱**·Meta·Google앱) · 안드로이드 WebView · iOS · desktop · TWA · Capacitor · standalone PWA. 판정 정본 `src/lib/experiments/android-conversion.ts`.
- 상세·승패 기준은 [F16](F16-ab-test-infra.md) 참조. ⚠️ 승패는 설치 수가 아니라 **D7 재방문 참여 유저**로 본다.

### 문구·타이밍 (실험 종료 후 고정 — 위 실험 비대상자에게 적용)

문구 A/B/C 변형과 타이밍 A/B는 **2026-06-09 종료**되어 코드에서 삭제됐다. 현재는 단일 상수 `BANNER_CONTENT`(공감형)로 고정되어 있고, 배정 로직(`signup_variant` 등)은 존재하지 않는다.

| 항목 | 고정값 |
|------|-------|
| 헤드라인 | "나만 이런 게 아니었네?" |
| 서브 | "우리끼리 편하게 수다 떨어봐요" |
| CTA | "카카오 한 번 클릭으로 가입" (인앱에서는 "카카오 밖에서 가입하기" / "브라우저에서 가입하기") |

### 이벤트 추적 (GA4 + EventLog 병행)

| 이벤트명 | 발생 시점 | GA4(`gtm*`) | EventLog(`trackEvent`) |
|---------|---------|------------|----------------------|
| `signup_banner_eligible` | 발동 조건 충족 (분모) | ✅ `page_path` | ✅ `show_count` |
| `signup_banner_shown` | 배너 실제 표시 | ✅ `page_path`·`show_count` | ✅ `scroll_at_show` |
| `signup_banner_clicked` | CTA 클릭 | ✅ `cta_type` | ✅ `cta_type`·`env` |
| `signup_banner_dismissed` | X 닫기 | ✅ `show_count` | ✅ `show_count` |
| `inapp_redirect_attempted` / `_success` | 인앱 CTA → 외부 브라우저 | ✅ | ❌ **EventLog 미기록** |
| `android_conversion_prompt_exposed` / `_clicked` / `_dismissed` | 실험 대상(Android 외부 브라우저 비회원)에서 위 3종과 **병행** 발화 | ❌ | ✅ `experiment_id`·`variant`·`surface`·`trigger`·`browser_env`·`path`·`cta_type`·`content_id` |

> ⚠️ 같은 이벤트명이라도 GA4와 EventLog의 **파라미터가 서로 다르다**(예: `eligible`은 GA4=`page_path`, EventLog=`show_count`). 두 소스를 합산·대조할 때 주의.
> `signup_banner_*` 4종 + `android_conversion_prompt_*` 3종 모두 `/api/events`의 `CONVERSION_EVENTS` rate-limit 면제 대상이다(빠지면 429로 조용히 유실돼 분모가 깎인다).

---

## 관련 링크

- 코드: `src/components/common/SignupPromptBanner.tsx`
- 렌더 위치: `src/app/(main)/layout.tsx` (`<SignupPromptBanner />`, dynamic·ssr:false)
- 온보딩 완료: `src/components/features/onboarding/OnboardingForm.tsx` (signup_completed_at 설정)
- PRD: `docs/prd/PRD_Final_A_서비스_고객웹.md`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 | Feature Lifecycle 도입 |
| 2026-05-19 | EXCLUDED_PATHS에서 `/faq` 제거 | /faq 페이지 삭제 — /about#faq로 통합됨 |
| 2026-06-02 | Props 제거, `useSession()` 도입, `status==='loading'` 가드 추가 | P0 2단계 auth island 제거 — CDN 캐시 활성화 |
| 2026-06-05 | GA4 A/B/C 성과 집계 스크립트(`scripts/ga4-signup-ab.ts`) 추가 + 운영문서(`docs/signup-prompt-policy.html`) 코드 기준 전면 재작성 | 실험 데이터 가시화 — 명령 한 줄로 승자 확인. 본 문서(F01)의 A/B/C 카피·storage 키는 코드와 불일치분 잔존(별도 정정 예정) |
| 2026-06-09 | 문구 A/B/C→**C 공감형 고정**, 타이밍→**read_complete(정독 85% + 60초 백스톱) 고정**. variant 배정·early 분기·VARIANT_CONTENT A/B 제거 | UT 위너 확정(정량 표본 1~2건 무의미, UT 정성 근거). 코드 단순화·레거시 제거 |
| 2026-06-10 | 운영문서 `signup-prompt-policy.html`·`app-install-policy.html`을 **`docs/channel-architecture.html`(채널 정책 마스터 가이드)로 통합**하고 두 파일 삭제. stale(A/B/C·20초·배정로직) 전면 교정 | 분산 문서 단일화 + 실험 종료 미반영분 정정. 가입 배너 상세는 통합본 §5-1 |
| 2026-08-06 | **본 문서 §세부 기획을 코드 기준으로 재작성** — 2026-06-09 실험 종료(문구 C 고정·타이밍 read_complete)가 본문에 반영되지 않아 "20초/50% 스크롤/A·B·C 랜덤 배정"이 그대로 남아 있던 것을 교정. storage 키도 실제값(`signup_prompt_count`/`signup_prompt_done`)으로 정정하고, EventLog 병행 기록과 GA4↔EventLog 파라미터 불일치를 표에 명시 | 6-10 통합본만 고치고 F01 본문은 미정정 → 이 문서만 읽은 사람이 이미 없는 A/B 실험을 근거로 판단할 위험. **동작 변경 없음(문서 전용)** |
| 2026-08-06 | **A/B 실험 `android_conversion_a2_b2` 시작** — Android 외부 브라우저 **비회원**에게만 `signup_warm`(A2) / `app_card`(B2) 50:50 적용. 신규 EventLog 3종 발화 + rate-limit 면제 등록. 트리거·횟수·storage 정책과 비대상자 동작은 무변경 | 첫 전환 제안으로 가입이 나은지 앱이 나은지 실측. 상세 [F16](F16-ab-test-infra.md) |

---
| 2026-08-09 | **인앱 한정** ① 딤 오버레이 탭 닫기 제거(✕ 버튼으로만) ② body 스크롤 잠금 해제 ③ iOS 인앱 CTA no-op 제거 → 클립보드 복사 + 배너 내 안내 전환 | 인앱 배너가 뜨면 스크롤이 잠기고 화면 탭은 곧 닫기였다 → 글을 계속 읽으려면 배너를 치우는 것 말고 선택지가 없었다. 실측 shown→dismissed 중앙값 2.4초·3초 이내 63.2%·인앱 닫힘률 77.6%(데스크탑 35.2%). **문구·디자인·트리거·횟수 정책은 무변경**, 비인앱/실험(app_card) 동작도 무변경 |

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-08-09 | 인앱 배너 CTR 0%(7일 1,113 노출 → 클릭 1) | 딤 오버레이 `onClick=handleDismiss` + `body.overflow=hidden` 동시 적용으로 "읽기 계속"이 불가능 → 탭 한 번이 dismiss로 소모. iOS 인앱은 CTA를 눌러도 `setVisible(false)`로 끝나 no-op | 인앱에서만 오버레이 탭 닫기·스크롤 잠금 제거, iOS는 클립보드+안내로 전환 |
