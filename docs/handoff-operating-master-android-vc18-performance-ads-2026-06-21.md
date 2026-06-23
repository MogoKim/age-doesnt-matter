# Handoff — Operating Master / Android vc18 Analytics / Performance / Ads AC

작성일: 2026-06-21
대상 저장소: `/Users/yanadoo/Documents/New_Claude_agenotmatter`
현재 기준: Android Capacitor vc18 production 게시 완료, Firebase/GA4 앱 이벤트 수집 확인, Google Ads AC 전환 연결 완료, 앱 속도 개선 진행 단계

---

## 0. 다음 세션 첫 메시지

다음 세션을 열면 아래 그대로 전달한다.

```text
docs/handoff-operating-master-android-vc18-performance-ads-2026-06-21.md 를 먼저 읽고,
AGENTS.md 지침대로 git status --short부터 확인해라.

현재 목표는 Android 앱 온보딩/홈 전환 속도 개선과 GA4/Google Ads AC 전환 운영 안정화다.
코드 수정 전에는 변경 범위와 검증 계획을 먼저 보고해라.

poc 전체를 main에 무작정 merge하지 말고, main과 분기 상태를 확인한 뒤 필요한 커밋만 cherry-pick/PR로 반영해라.
기존 dirty worktree와 타 세션 작업은 절대 되돌리지 마라.
```

---

## 1. Codex의 역할

이 프로젝트에서 Codex는 단순 코더가 아니다. Codex는 **우리 나이가 어때서 / 우나어 운영 마스터**다.

역할은 다음과 같다.

- CTO 관점: Android Capacitor, Next.js, Firebase/GA4, Google Ads, Kakao OAuth, Play Console, Vercel 배포 흐름을 기술적으로 정합하게 유지한다.
- CPO 관점: 50대 60대 여성 사용자의 실제 가입 흐름, 온보딩 체감 속도, 앱 첫 경험, 전환 정의가 제품 목적과 맞는지 판단한다.
- COO 관점: 콘솔 수동 작업, 배포, 검증, 문서화, 재발 방지 절차를 운영 가능한 형태로 정리한다.
- 운영 리스크 관리자: Claude Code나 창업자 보고를 그대로 믿지 않고 코드, 콘솔 화면, 빌드 산출물, 실제 이벤트 수집 결과를 분리해 검증한다.
- 창업자 판단 피로 감소: 지금 할 일, 기다릴 일, 하면 안 되는 일, 나중에 할 일을 구분해서 제시한다.

판단 원칙:

1. 목적/목표를 먼저 확인한다.
2. AS-IS를 코드, 콘솔, 데이터, 사용자 화면으로 분리해 확인한다.
3. 증상 패치보다 근본 원인과 재발 방지를 우선한다.
4. 같은 파일을 여러 agent가 동시에 수정하지 않는다.
5. dirty worktree는 보존한다.
6. Raw SQL, `git add .`, force push, 불필요한 전체 merge는 금지한다.

---

## 2. 프로젝트 배경과 목적

서비스:

- 이름: 우리 나이가 어때서 / 우나어
- 도메인: `https://age-doesnt-matter.com`
- 대상: 50대 60대 한국인, 특히 여성 중심 커뮤니티
- Android 패키지: `com.agenotmatter.app`
- 앱 구조: Capacitor Android 앱이 `server.url`로 production 웹을 로드하는 구조

현재 큰 목표:

1. Android 앱을 Capacitor로 전환해 Play Store 앱으로 운영한다.
2. Firebase Analytics native SDK로 Android 앱 이벤트를 GA4 app stream에 수집한다.
3. 웹 gtag와 앱 native Analytics를 분리해 web stream 오염을 막는다.
4. Google Ads App Campaigns(AC)에서 `sign_up`을 전환 목표로 사용할 수 있게 한다.
5. 광고 집행 전, 온보딩과 첫 홈 전환 체감 속도를 개선한다.

중요한 제품 정의:

- `login`: 카카오 로그인 성공 및 세션 발급.
- `sign_up`: 단순 카카오 로그인 성공이 아니라, 신규 사용자가 온보딩 마지막 "시작하기/우나어 시작하기"까지 완료한 순간.
- 남성 사용자는 가입 불가가 정상 정책이다. 남성이 카카오 로그인 후 차단되면 `sign_up`은 찍히면 안 된다.

---

## 3. 현재 기준 스냅샷

확인된 주요 값:

| 항목 | 값 |
|---|---|
| 브랜치 | `poc/ios-capacitor-2-1` |
| 최근 관련 HEAD | `ea89fd2 perf(onboarding): reduce native signup transition stutter` |
| Android version | `versionCode 18`, `versionName 1.0.14` |
| Play Store 상태 | 1.0.14 / vc18 production 게시 완료 |
| Firebase project | `agenotmatter-19615` |
| Android package | `com.agenotmatter.app` |
| Firebase Android app id | `1:757616369524:android:4f5a69a31a937bd6de1621` |
| GA4 property | `481670969` / 우리 나이가 어때서 |
| Capacitor server.url | `https://age-doesnt-matter.com` |
| 앱 콘텐츠 반영 방식 | src/web 변경은 Vercel production 배포로 앱에 반영. AAB 재빌드 불필요 |

주의:

- 현재 worktree에는 타 세션 dirty/untracked 파일이 많다.
- `assets/logo.png`, community 관련 파일, agents/scripts, docs/analysis, mockup, iOS SwiftPM 등은 이 handoff 작성 범위 밖이다.
- 다음 세션은 반드시 `git status --short`로 시작하고, 관련 없는 dirty 파일을 절대 되돌리지 않는다.

---

## 4. 완료된 핵심 작업 타임라인

주요 커밋:

| 커밋 | 내용 |
|---|---|
| `456663e` | vc18 Firebase native Analytics 구현. 앱 핵심 이벤트 GA4 app stream 전송 + 앱 gtag 차단 |
| `f769e9f` | Kakao KOE006 Preview redirect_uri 사고 7 문서화 |
| `e93d7ff` | vc18 production Firebase Analytics 검증 기록 |
| `fbfd410` | vc18 완료 정리, Google Ads 전환 연결 완료, 광고 집행 보류 기록 |
| `ba3fb82` | 온보딩 닉네임/첫 홈 전환 성능 개선 작업 |
| `9fb891e` | native `sign_up`/`onboarding_complete`를 라우팅 전 await 하도록 보정 |
| `ea89fd2` | 온보딩 전환 stutter 감소. `Promise.all`로 native 이벤트 await 유지하며 병렬화 |

완료된 일:

- Firebase 프로젝트와 GA4 property `481670969` 연결.
- Android `google-services.json` app id/package 정합 확인.
- `measurement_id` 부재가 Android blocker가 아님을 정정. Android Firebase Analytics는 `mobilesdk_app_id` 기반으로 동작한다.
- `@capacitor-firebase/app`, `@capacitor-firebase/analytics` 도입.
- Android app stream native 이벤트 구현:
  - `login_start`
  - `login`
  - `sign_up`
  - `onboarding_complete`
- 앱에서는 gtag를 로드하지 않도록 차단:
  - `GtagLoader`
  - `gtm.ts`
  - 주요 이벤트 호출부 분기
- Play Store vc18 `1.0.14` production 게시 완료.
- Firebase DebugView에서 `first_open`, `session_start`, `screen_view`, `login_start`, `login` 확인.
- GA4 실시간에서 `login`, `sign_up` 이벤트 확인.
- Google Ads에 Android `login`, Android `sign_up` 전환 import 완료.
- Play Console 광고 ID 선언 처리 완료.
- 온보딩 속도 개선 1차 반영.

---

## 5. 현재 이벤트 구조

### 5.1 앱 native 이벤트

코드 기준:

- `src/lib/analytics/app-analytics.ts`
  - `isAppNative()`가 `window.Capacitor.isNativePlatform()`으로 native 앱 여부 판단.
  - `appLogEvent()`는 async 함수.
  - Firebase Analytics client dynamic import 후 `FirebaseAnalytics.logEvent()`까지 await 한다.

- `src/components/features/onboarding/OnboardingForm.tsx`
  - `handleComplete()`에서 app native이면 아래를 라우팅 전에 await 한다.

```ts
await Promise.all([
  appLogEvent('sign_up', { method: 'kakao' }),
  appLogEvent('onboarding_complete', { method: 'kakao' }),
])
```

그 뒤 공통 `trackEvent('sign_up')`와 `router.replace(destinationUrl)` 흐름으로 간다.

### 5.2 이벤트별 발화 시점

| 이벤트 | 발화 시점 |
|---|---|
| `login_start` | 앱에서 카카오 로그인 버튼 클릭, 브라우저 열기 직전 |
| `login` | 카카오 로그인 성공 및 세션 발급 후 |
| `sign_up` | 신규 사용자가 온보딩 마지막 환영 화면에서 "시작하기/우나어 시작하기"를 누른 직후 |
| `onboarding_complete` | `sign_up`과 같은 시점 |

중요:

- 기존 회원 재로그인은 `login`만 찍히고 `sign_up`은 찍히지 않는다.
- 온보딩 중간 이탈은 `sign_up`이 아니다.
- 남성 차단은 정상 정책이며 `sign_up`이 찍히면 안 된다.
- `sign_up`이 GA4 실시간에 보이면 native 이벤트 경로는 작동하는 것이다.

---

## 6. GA4와 Google Ads 해석

핵심 결론:

- GA4는 전체 사용자 행동을 본다.
- Google Ads 전환은 광고를 통해 유입된 사용자의 전환 성과를 본다.

따라서 친구가 직접 Play Store에서 검색/링크로 다운로드하거나, 창업자가 직접 테스트한 가입은 GA4/Play Console에는 보일 수 있지만 Google Ads 전환에는 0일 수 있다.

현재 상태 해석:

- GA4 실시간에서 `sign_up`이 보였다면 앱 이벤트 자체는 정상이다.
- Google Ads에서 Android `sign_up`이 0인 것은 광고 유입이 없거나 Ads attribution 대상이 아니면 정상이다.
- Android `first_open`/다운로드도 마찬가지다. 친구가 직접 다운로드한 것은 Ads 전환으로 잡히지 않을 가능성이 높다.

Ads 전환 검증 조건:

1. Google Ads App Campaign 또는 유효한 광고 클릭/설치 유입이 있어야 한다.
2. 그 유입 사용자가 앱 설치 후 목표 이벤트를 수행해야 한다.
3. Ads reporting 지연을 감안해 보통 수 시간에서 24~48시간은 기다린다.

현재 광고는 아직 본격 집행 전이므로, Ads 0을 추적 고장으로 판정하면 안 된다.

---

## 7. Kakao OAuth 운영 이력과 주의사항

KOE006 사건:

- Preview URL로 앱 OAuth 테스트 시, Kakao Developers에 정확한 preview redirect URI가 없으면 KOE006 발생.
- 코드 문제가 아니라 Kakao 콘솔 운영 절차 문제였다.

영구 유지할 redirect URI:

```text
http://localhost:3000/api/auth/callback/kakao
https://age-doesnt-matter.com/api/auth/callback/kakao
https://www.age-doesnt-matter.com/api/auth/callback/kakao
```

Preview 테스트 시:

- 해당 Vercel preview domain 전체 callback을 임시로 추가해야 한다.
- 형식은 반드시 `/api/auth/callback/kakao`까지 포함한다.
- 테스트 종료 후 preview redirect URI는 삭제해도 된다.

남은 보안 후속:

- 디버깅 중 노출된 Kakao Client Secret은 재발급이 필요하다.
- 재발급 후 Vercel production/preview env와 로컬 `.env.local`을 정합하게 교체해야 한다.
- 이 작업은 인증 영향이 있으므로 별도 계획과 검증이 필요하다.

---

## 8. AAB/Play Console 운영 주의

vc18 production은 이미 게시됨:

- `versionName 1.0.14`
- `versionCode 18`

AAB 관련 사고:

- `app-release-signed.aab`는 과거 vc17 산출물이었다. Firebase Analytics가 없으므로 업로드하면 안 된다.
- vc18은 `app-release.aab`를 upload key로 서명해 업로드했다.
- keystore alias는 `android`.
- keystore 위치는 `/Users/yanadoo/migration-backup/android/android.keystore`.
- Play App Signing 사용 중이다.

향후:

- src/web 변경만 있으면 AAB 재빌드 불필요. Vercel production 배포로 앱에 반영된다.
- Android native/plugin/config 변경이면 AAB 재빌드와 versionCode 증가가 필요하다.

---

## 9. 현재 남은 작업 우선순위

| 우선순위 | 작업 | 상태 | 다음 액션 |
|---|---|---|---|
| 1 | Android 앱 속도 개선 | 진행 가능 | 온보딩 닉네임 입력, 약관 완료, 첫 홈 전환 버벅임 분석/개선 |
| 2 | GA4 Android `sign_up`/`onboarding_complete` 자연 수집 확인 | 사실상 작동 확인됨, 추가 모니터링 | 신규 여성 가입이 발생하면 GA4 실시간/DebugView 확인 |
| 3 | Google Ads Android `sign_up` 전환 확인 | 광고 유입 필요 | AC 광고 소액 집행 후 Ads 전환 수 확인 |
| 4 | Google Ads 다운로드 전환 확인 | 광고 유입 필요 | 광고 클릭/설치가 발생한 뒤 확인. 친구 직접 설치는 Ads 전환 검증으로 부적합 |
| 5 | 광고 최적화 | 보류 | 전환 데이터가 쌓인 뒤 판단 |
| 6 | Kakao Client Secret rotation | 대기 | 인증 영향 계획 수립 후 진행 |
| 7 | FCM 푸시 | 후순위 | 앱 푸시가 필요해질 때 Firebase Messaging 설계 |
| 8 | AdMob/AdSense 앱 수익화 | 후순위 | 광고 UX/정책/수익화 판단 후 별도 설계 |
| 9 | Airbridge | 더 후순위 | GA4/Ads 운영이 안정된 뒤 검토 |

---

## 10. 다음 세션의 1순위: 앱 속도 개선

문제 증상:

- 온보딩 닉네임 입력 시 버벅임.
- 온보딩 완료 후 첫 홈 전환이 버벅임.
- 앱 WebView 환경에서 체감이 더 민감하다.

분석해야 할 코드 경로:

- `src/components/features/onboarding/OnboardingForm.tsx`
- `src/lib/analytics/app-analytics.ts`
- `src/components/common/PageViewTracker.tsx`
- `src/components/common/GtagLoader.tsx`
- `src/lib/gtm.ts`
- 로그인/온보딩 후 홈에서 처음 로드되는 component/API/image 경로
- community/home 관련 최근 dirty 변경은 타 세션 작업일 수 있으므로 수정 전 반드시 상태 확인

가능성이 높은 원인:

- 닉네임 입력 중 즉시 검증/상태 업데이트가 과도함.
- 한글 IME composition 중 validation/render가 반복될 수 있음.
- 온보딩 완료 시 서버 action, native analytics await, EventLog, router replace, 홈 초기 데이터 fetch/render가 한 번에 몰림.
- 홈 첫 진입에서 hero/image/community list/CTA/analytics 작업이 동시에 실행됨.

개선 원칙:

- 가입 전환 이벤트 유실 방지 await는 유지한다.
- `sign_up`/`onboarding_complete`를 라우팅 전에 보장하되, 가능한 작업은 병렬화하거나 전환 후로 미룬다.
- 닉네임 입력은 composition-aware, debounce, 최소 렌더링으로 만든다.
- 홈 첫 진입에서는 critical UI 먼저 보여주고 비필수 작업은 defer한다.
- 50대 60대 사용자 기준으로 버튼/입력 안정성과 즉시 반응감을 우선한다.

수정 전 read-only 진단 프롬프트:

```text
read-only로 Android 앱 온보딩 성능을 진단해라.
수정 금지.

확인 범위:
- src/components/features/onboarding/OnboardingForm.tsx
- 닉네임 입력/검증 로직
- handleComplete 이후 router.replace와 홈 첫 로드 경로
- src/lib/analytics/app-analytics.ts
- PageViewTracker/GtagLoader/gtm.ts
- 홈 첫 진입 시 불필요하게 먼저 실행되는 fetch, image, analytics, CTA, banner 작업

보고 형식:
1. 버벅임 후보를 사용자 체감 순서대로 정리
2. 코드 근거 파일/라인
3. 수정할 최소 범위
4. 검증 방법
5. sign_up/onboarding_complete 유실 방지 await를 깨지 않는지 판정
```

수정 승인 후 구현 프롬프트:

```text
온보딩 닉네임 입력 버벅임과 온보딩 완료 후 첫 홈 전환 버벅임을 최소 범위로 개선해라.

금지:
- sign_up/onboarding_complete 라우팅 전 await 보장 제거 금지
- auth/prisma/schema/DB 수정 금지
- raw SQL 금지
- git add . 금지
- 관련 없는 dirty 파일 수정 금지

검증:
- npm run typecheck
- npm run lint
- npm run build
- 변경 파일 목록과 앱 server.url 구조상 AAB 재빌드 필요 여부 보고
```

---

## 11. Google Ads/GA4 후속 확인 방법

광고 전:

- GA4 실시간 또는 DebugView로 앱 이벤트가 찍히는지만 확인한다.
- Ads 전환 0은 정상일 수 있다.

광고 후:

1. AC 광고를 소액으로 켠다.
2. 광고 클릭/설치/가입이 발생하도록 기다린다.
3. Google Ads 목표 > 가입 > Android `sign_up` 전환 수를 확인한다.
4. 보고 지연 때문에 당일 즉시 0일 수 있다.
5. 24~48시간 후에도 0이면 read-only audit를 한다.

Ads 전환이 계속 0일 때 Claude Code에게 줄 read-only 프롬프트:

```text
read-only로 Android Firebase Analytics first_open/sign_up 경로와 Google Ads import 상태를 재검증해라.
코드 수정 금지.

구분해서 보고:
1. GA4 app stream에는 Android sign_up/first_open 이벤트가 있는가
2. Google Ads에는 해당 이벤트가 import되어 있는가
3. Ads 전환 0이 광고 attribution 부재인지, GA4 이벤트 부재인지, import 설정 문제인지
4. 광고 유입 없이 친구/직접 설치로 테스트한 값이 Ads 전환에 잡히지 않는 이유
```

---

## 12. 검증 명령

기본:

```bash
git status --short
npm run typecheck
npm run lint
npm run build
```

Android DebugView:

```bash
/Users/yanadoo/.bubblewrap/android_sdk/platform-tools/adb devices
/Users/yanadoo/.bubblewrap/android_sdk/platform-tools/adb shell setprop debug.firebase.analytics.app com.agenotmatter.app
```

앱 WebView inspect:

```text
Chrome > chrome://inspect/#devices
WebView in com.agenotmatter.app > inspect
Console:
typeof window.gtag
window.Capacitor?.isNativePlatform?.()
```

기대값:

- 앱: `typeof window.gtag` -> `"undefined"`
- 앱: `window.Capacitor?.isNativePlatform?.()` -> `true`
- 데스크탑 웹: `window.gtag` 정상 존재

---

## 13. 절대 하면 안 되는 것

- `git add .`
- 관련 없는 dirty 파일 되돌리기
- `git reset --hard`
- poc 브랜치 전체를 main에 무검증 merge
- community/home 최신 작업을 옛 poc 상태로 덮어쓰기
- Raw SQL
- Kakao production/www/localhost redirect URI 삭제
- `app-release-signed.aab` 같은 구버전 산출물 업로드
- GA4에 이벤트가 보이는데 Ads 0이라는 이유만으로 추적 고장이라고 단정
- src/web 변경만 했는데 불필요하게 AAB 재빌드
- 남성 차단을 가입 실패로 오판

---

## 14. 다음 세션에서 바로 내려야 할 판단

1. 지금은 Ads 전환 디버깅보다 앱 속도 개선이 우선이다.
2. GA4 `sign_up`은 이미 실시간에서 확인됐으므로, 이벤트 경로는 작동한다고 본다.
3. Google Ads 전환 검증은 광고 유입 이후의 일이다.
4. 성능 개선은 src/web 변경이면 production 배포만으로 앱에 반영된다.
5. 수정 전에는 반드시 dirty 상태와 main/poc 분기 상태를 확인한다.

---

## 15. 창업자가 지금 할 일

- 새 세션을 열고 이 문서를 먼저 읽게 한다.
- Android 앱에서 느린 지점이 재현되는 화면/순서를 계속 메모한다.
- 신규 여성 계정이 생기면 앱에서 온보딩 마지막 "시작하기"까지 완료하고 GA4 실시간 또는 DebugView를 본다.
- Google Ads 전환은 광고를 켠 뒤 확인한다. 친구 직접 설치/가입으로 Ads 전환을 검증하려 하지 않는다.

---

## 16. Claude Code에게 시킬 일

바로 구현을 시키지 말고, 먼저 read-only 성능 진단을 시킨다.

우선 프롬프트:

```text
docs/handoff-operating-master-android-vc18-performance-ads-2026-06-21.md 를 읽고,
AGENTS.md 지침대로 git status --short부터 확인해라.

read-only로 Android 앱 온보딩 속도 문제를 진단해라.
코드 수정 금지.

특히 닉네임 입력 버벅임, 약관 완료 후 환영 화면, 환영 화면에서 홈으로 넘어가는 전환, 홈 첫 렌더링을 분리해서 봐라.
sign_up/onboarding_complete native await 보정은 깨면 안 된다.

보고는:
1. 원인 후보
2. 코드 근거
3. 최소 수정 계획
4. 검증 계획
5. AAB 재빌드 필요 여부
순서로 하라.
```

---

## 17. 현재 결론

vc18의 핵심 목적이었던 Android native Analytics와 Google Ads AC 준비는 큰 축에서 완료됐다.

남은 본질은 두 가지다.

1. 광고를 켜기 전에 앱 첫 경험, 특히 온보딩과 첫 홈 전환을 빠르게 만든다.
2. 광고 유입이 생긴 뒤 Google Ads가 Android `sign_up` 전환을 실제로 집계하는지 확인한다.

지금 Google Ads 전환 0은 고장 증거가 아니다. 광고 유입 전에는 GA4/Play Console로 전체 사용자 행동을 보고, Ads는 광고를 켠 뒤 성과 확인용으로 본다.

