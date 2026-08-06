# PWA 설치 유도 운영 기획서 (F02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-08-06

---

## 목표

앱 스토어 등록 없이 홈 화면 추가(PWA) 설치를 유도해 재방문율을 높인다.
4단계 트리거로 사용자 여정 단계에 맞는 시점에 자연스럽게 제안한다.

---

## 배경

- (작성 시점 배경) iOS/Android 네이티브 앱 없음 → PWA로 앱 수준 경험 제공
  - ⚠️ 이후 상황 변경: Android는 **Play스토어 TWA 앱 출시 완료**(`com.agenotmatter.app`), Capacitor 네이티브 shell도 존재. 따라서 **Android는 PWA가 아니라 Play스토어로 유도**한다(2026-06-05 분기). PWA 경로가 남아 있는 건 **iOS뿐**이다.
- 홈 화면 추가 = 재방문 진입점 확보 → North Star(주간 재방문 참여 유저 수)의 선행 레버
- 강제 팝업 금지 — 사용자가 서비스 가치를 경험한 시점에만 제안

---

## ⚠️ 현재 운영 상태 (읽기 전 필수)

| 구분 | 내용 |
|------|------|
| **코드 기준** | `AddToHomeScreen`(팝업·하단배너·인앱 유도배너 3종) · `PwaInlineBanner`의 useEffect는 전부 `NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true'` 가드로 **즉시 return** 한다. 즉 플래그가 `'true'`가 아니면 이 문서의 4단계 트리거는 **하나도 동작하지 않는다.** |
| **운영 플래그 확인 필요** | 실제 프로덕션 값은 **Vercel 환경변수 콘솔에서 직접 확인**해야 한다. 로컬 `.env.local`에는 이 키가 없다(=OFF). 문서·메모리가 아니라 콘솔이 진실의 원천이다. |
| **플래그와 무관하게 항상 동작** | ① 홈 FAQ 앱 설치 안내(`AppInstallFaqAnswer` — 안드=Play스토어 / 아이폰=홈 화면 추가 3단계) ② `/go/[src]` 외부 유입 앱 분기(`GoRedirect`) ③ 글 상세 회원 설치 CTA(`PostCTA`) 중 **안드로이드 Play스토어 경로** |
| **플래그 OFF일 때 감춰지는 것** | `PostCTA`의 **iOS(비-안드로이드) 설치 CTA**. iOS 경로는 `pwa-prompt` 이벤트에 의존하는데 그 리스너를 `AddToHomeScreen`이 등록하지 않으므로, 눌러도 반응 없는 헛버튼이 된다 → 2026-08-06부터 CTA 자체를 숨긴다. 플래그를 켜면 자동 복귀. |

> 재활성화 전 주의: OFF 기간에도 과거 사용자의 브라우저에는 `pwa_shown_count`·`pwa_declined_count` 값이 남아 있다. 그대로 켜면 `weekly` 트리거 조건(`shownCount >= 2`)을 이미 충족한 사용자에게 즉시 팝업이 뜬다. 켜기 전 잔존 카운터 처리 방안을 먼저 정할 것.

---

## 플랫폼 정책 (2026-08-06 확정)

> ⚠️ **A/B 실험은 아직 켜지 않았다.** 아래는 실험 이전의 기본 정책이며, 가입-first vs 앱설치-first
> 실험은 별도 PR에서 `EXPERIMENTS` 등록 후 시작한다(F16 참조).

### Android — "Android 외부 브라우저"가 정책 단위다

"Android Chrome"이 아니라 **Android 외부 브라우저** 세그먼트로 판정한다. 판정 정본은
`src/lib/browser-env.ts`의 `isAndroidExternalBrowser` / `isAndroidExternalBrowserEnv`이며,
테스트는 `src/__tests__/browser-env.test.ts`가 대표 UA로 고정한다.

| 구분 | 대상 |
|---|---|
| **포함** | Chrome · **Whale(네이버 웨일 브라우저)** · Samsung Internet · Firefox 등 안드로이드 일반 브라우저 |
| **제외** | 카카오 · **네이버 앱** · Instagram/Facebook · Google 앱 **인앱브라우저**, 안드로이드 **WebView**(`; wv`), iPhone/iPad, desktop, **TWA · Capacitor · standalone PWA** |

- **Whale을 이름으로 하드코딩하지 않는다.** "Android이고 인앱/WebView가 아니다"라는 조건으로 자연히 포함된다.
- ⚠️ **네이버 웨일 브라우저 ≠ 네이버 앱 인앱브라우저.** 전자는 독립 브라우저(포함), 후자는 `NAVER(inapp` UA(제외). 절대 같이 묶지 않는다.
- ⚠️ TWA·Capacitor·standalone은 **UA로 구분 불가** → 호출부가 `useAppEnvironment`의 `isTWA`/`isCapacitor`/`isStandalone`으로 먼저 걸러야 한다.
- 종전 `detectEnv()` 기반 판정은 `window.innerWidth >= 1024`로만 desktop을 걸러 **창을 줄인 데스크탑이 안드로이드로 새고**, 마지막이 catch-all `return 'android-chrome'`이라 안드로이드가 아닌 것도 안드로이드로 잡혔다. 새 판정은 **UA에 Android가 있는지 양성 확인**한다.

### iPhone — 설치 유도 없음. 가입 유도만 한다

- iOS는 원클릭 설치가 불가하고, "홈 화면에 추가" 3단계를 받쳐 주던 PWA 팝업이 플래그로 꺼져 있어 **안내만 남으면 헛수고가 된다.**
- 따라서 **홈 FAQ의 아이폰 "홈 화면에 추가" 3단계 안내를 제거**했다(`AppInstallFaqAnswer`, JSON-LD 답변 동시 수정).
- 아이폰 사용자에게 필요한 것은 설치가 아니라 **가입**이다 — 가입해야 댓글·공감으로 다시 온다(North Star = 주간 재방문 참여 유저 수). 가입 유도는 홈 `SignupCard`·글 상세 `PostCTA`가 이미 담당하므로 FAQ에 **새 CTA를 추가하지 않았다**(계측 없는 전환면을 늘리지 않기 위함).
- 글 상세 `PostCTA`의 iOS 설치 CTA 숨김 정책은 그대로 유지한다.

### Play스토어 referrer — medium이 진입점을 담는다

종전에는 진입점과 무관하게 `utm_medium=footer`가 고정이라 PostCTA·홈 FAQ·인라인 배너의 설치가
Play Console에서 전부 "footer"로 뭉개졌다(utm_content는 획득 보고서에서 분해되지 않아 medium이 사실상 유일한 구분자).
→ 이제 `buildPlayStoreUrl(placement)`가 **medium에 진입점을 싣는다**. 패키지 id·캠페인·source는 불변.

| 항목 | 값 |
|---|---|
| 패키지 id | `com.agenotmatter.app` (불변) |
| `utm_source` | `website` (불변) |
| `utm_campaign` | `app_install` (불변) |
| `utm_medium` | **진입점** (`post_cta` / `home_faq_android` / `inline` …). 미지정 시 `app_install_cta` |
| `utm_content` | 진입점 (동일 값) |

⚠️ **시계열 주의**: 이 변경 이후 Play Console의 `footer` medium은 더 이상 증가하지 않는다. 이전 데이터와 직접 비교하지 말 것.

---

## 세부 기획

### 4단계 트리거

| 단계 | 트리거 이름 | 조건 | 노출 시점 |
|------|-----------|------|---------|
| Phase 1 | `first_15s` | `shownCount === 0` (첫 방문) | 13초 후 |
| Phase 2 | `signup` | `shownCount < 2` + `signup_completed_at` 설정 후 3페이지 탐색 | 3페이지 도달 시 |
| Phase 3 | `engagement` | `shownCount < 3` + 글/댓글 작성 후 | 작성 직후 |
| Phase 4 | `weekly` | `declineCount < 3` + `shownCount >= 2` + 7일 경과 | 주기적 재노출 |

### Phase 2 상세 (signup 트리거)

```
온보딩 3단계 완료 → signup_completed_at 로컬스토리지 저장
→ 이후 페이지 뷰마다 KEY_PAGE_VIEWS_AFTER_SIGNUP 카운터 증가
→ PAGE_VIEW_TRIGGER_THRESHOLD(=3) 도달 시 PWA 팝업 표시
```

### 제외 경로 (팝업 미표시)

`/login`, `/signup`, `/onboarding`

### storage 키 목록 (코드 기준 — `AddToHomeScreen.tsx` 상수와 1:1)

**localStorage**

| 키 | 용도 |
|----|------|
| `pwa_shown_triggers` | 이미 소진한 트리거 목록 (JSON 배열) |
| `pwa_shown_count` | 총 노출 횟수 |
| `pwa_declined_count` | 거절 횟수 (`MAX_DECLINES=3` 도달 시 weekly 정지) |
| `pwa_last_prompted_at` | 마지막 노출 타임스탬프 (ISO, weekly 7일 계산용) |
| `pwa_session_count` | 방문 세션 누적 횟수 |
| `pwa_installed` | 설치 완료 플래그 (`'1'`) |
| `pwa_page_views_after_signup` | Phase 2 카운터 |
| `pwa_kakao_guide_at` / `pwa_naver_guide_at` / `pwa_instagram_guide_at` | 인앱 유도 배너 3일 쿨다운 |
| `signup_completed_at` | 온보딩 완료 시각 (F01 `OnboardingForm`이 기록) |

**sessionStorage**

| 키 | 용도 |
|----|------|
| `pwa_visited_this_session` | 세션 카운트 중복 방지 |
| `pwa_shown_this_session` | 세션 내 팝업 1회 제한 — `PushPermissionToast`가 이 키를 읽어 양보한다 |
| `pwa_banner_shown_this_session` | 세션 내 하단 배너 1회 제한 |
| `pwa_inline_shown` | `PwaInlineBanner` 세션 1회 제한 |
| `signup_prompt_shown_this_session` | **F01 소유 키** — 세팅돼 있으면 PWA 팝업·인라인 배너가 양보한다 |

---

## 관련 링크

- 코드: `src/components/common/AddToHomeScreen.tsx`
- 렌더 위치: `src/app/layout.tsx` (RootLayout 전역 등록)
- 온보딩 연결: `src/components/features/onboarding/OnboardingForm.tsx`
- 진입점 분기: `src/lib/app-links.ts` (`triggerAppInstall` — 안드=Play스토어 / 그 외=`pwa-prompt` 이벤트)
- 플래그와 무관한 설치 진입점: `src/components/features/home/AppInstallFaqAnswer.tsx`, `src/app/go/GoRedirect.tsx`
- 스펙 문서: `docs/prd/pwa-install-spec.md` — ⚠️ `FooterPwaButton` 렌더를 전제로 쓰여 있으나 그 컴포넌트는 2026-08-06 삭제됨(아래 히스토리). 스펙 문서 정정은 별건.

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 | Feature Lifecycle 도입 |
| 2026-05-13 | AddToHomeScreen·PwaInlineBanner·FooterPwaButton useEffect에 `NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true'` 가드 추가 — 잠정 홀드 처리 | PWA 설치 유도 전략 재검토 결정. env var 하나로 재활성화 가능하도록 코드 보존 |
| 2026-06-05 | 안드=Play스토어 / iOS=PWA 분리. manifest `prefer_related_applications:true` + `related_applications`(com.agenotmatter.app) 추가로 안드 자동 PWA 차단. 설치 진입점(PostCTA/Footer/Inline)은 `triggerAppInstall()`(src/lib/app-links.ts)로 안드→Play, iOS→홈화면추가 분기 | TWA 앱 Play스토어 출시 완료 → 채널 혼란(PWA/Play 동시 유도) 정리 |
| 2026-08-06 | **문서를 코드 기준으로 정정** — ① 상단에 "현재 운영 상태" 표 추가(플래그 OFF 시 4단계 트리거 전부 미동작 / 플래그 무관 진입점 분리 명시) ② storage 키 표를 실제 상수와 1:1로 교정(`pwa_decline_count`→`pwa_declined_count`, `pwa_last_shown`→`pwa_last_prompted_at`, 누락 6키 추가, sessionStorage 표 신설) | 문서가 코드와 달라 재활성화 판단의 근거로 쓸 수 없었음 |
| 2026-08-06 | **`FooterPwaButton.tsx` 삭제** (footer 리디자인으로 렌더 트리에서 빠진 뒤 import 0건 상태로 잔존). 함께 `FooterChannelLinks.tsx`(footer 간소화 v1에서 제거된 SNS·Google Play 블록)도 삭제 | orphan 컴포넌트가 "설치 진입점이 있다"는 오해를 만들고, 재활성화 시 안드 중복 유도 위험 |
| 2026-08-06 | **`PostCTA` iOS 설치 CTA를 플래그 연동으로 변경** — 안드로이드가 아닌 경로는 `NEXT_PUBLIC_PWA_INSTALL_ENABLED === 'true'`일 때만 CTA 노출 | 플래그 OFF 상태에서 iOS 회원에게 "홈 화면에 추가하기" 버튼이 보이지만 `pwa-prompt` 리스너가 없어 눌러도 무반응(헛클릭). 환경이 아닌 플래그로 판정하므로 켜면 자동 복귀 |
| 2026-08-06 | **Android 판정을 "외부 브라우저" 세그먼트로 재정의** — 순수 helper `src/lib/browser-env.ts` 신설(`isAndroidExternalBrowser`/`isAndroidExternalBrowserEnv`), `isAndroidInstallEnv` → `isAndroidExternalBrowserEnv`로 교체(PostCTA·PwaInlineBanner·triggerAppInstall). 대표 UA 테스트 `browser-env.test.ts` 추가 | 실험 분모가 되는 판정이라 오판 시 데이터 전체 오염. 종전 `detectEnv()`는 창 좁힌 데스크탑이 안드로이드로 새고 Whale이 우연히 catch-all로만 잡히던 구조 |
| 2026-08-06 | **아이폰 "홈 화면에 추가" 안내 제거** — `AppInstallFaqAnswer` 3단계 토글 삭제 + `HomeFaqSection` JSON-LD 답변 동시 수정. 안드로이드 Play 안내는 유지 | 받쳐 주는 PWA 팝업이 꺼져 있어 안내대로 해도 헛수고. 아이폰은 설치가 아니라 가입 유도가 맞다 |
| 2026-08-06 | **Play referrer `utm_medium` 하드코딩(`footer`) 제거** — medium이 진입점을 담도록 변경 + `sanitizeUtmToken` 방어 + `play-store-referrer.test.ts` 추가 | 모든 진입점 설치가 Play Console에서 "footer"로 뭉개져 어트리뷰션 불가. 실험 시작 전 반드시 분리 필요 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | `@pwa-phase3` E2E 테스트 CI 미실행 | CI는 `@smoke`만 실행 | 로컬에서만 수동 검증 필요 |
