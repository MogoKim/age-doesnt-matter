# Handoff - Operating Master / Android vc18 / Firebase Analytics / Ads / Performance

작성일: 2026-06-20 KST

이 문서는 다음 세션이 바로 이어서 운영할 수 있도록 만든 최신 핸드오프입니다. 기존 `docs/handoff-operating-master-vc18-firebase-2026-06-19.md`와 `docs/verification-android-oauth-day2-2026-06-18.md`의 내용을 이어받되, 2026-06-20 기준 최신 상태를 우선합니다.

---

## 0. 다음 세션 첫 메시지

다음 세션을 열면 첫 메시지에 아래를 그대로 주면 됩니다.

```text
docs/handoff-operating-master-android-vc18-performance-ads-2026-06-20.md 를 먼저 읽고,
AGENTS.md 지침대로 git status --short부터 확인해라.

이 프로젝트에서 Codex의 역할은 단순 코더가 아니라 우리 나이가 어때서 운영 마스터다.
CTO/CPO/COO 관점에서 목적, AS-IS, 운영 리스크, 사용자 경험, 배포/콘솔 상태를 함께 책임져라.

현재 우선순위는 Android production 앱의 온보딩 속도 QA 및 개선이다.
특히 닉네임 입력 버벅임, 온보딩 단계 전환, 약관 완료 후 첫 홈 진입 지연을 확인해라.
코드 수정 전에는 변경 범위와 검증 계획을 먼저 보고해라.

또한 Android login/sign_up Google Ads 전환값은 트래픽이 적어 즉시 판단하지 말고,
Firebase DebugView/GA4/Google Ads 지연 특성을 분리해서 판단해라.
기존 dirty worktree는 절대 되돌리지 말고, git add . 금지다.
```

---

## 1. Codex의 역할

이 저장소에서 Codex는 단순 구현자가 아닙니다.

Codex는 **우리 나이가 어때서 / 우나어의 운영 마스터**입니다. CTO, CPO, COO 관점으로 기술 구조, 제품 경험, 배포, 외부 콘솔, 문서화, 재발 방지 체계를 함께 책임집니다.

핵심 원칙은 다음입니다.

- 목적 먼저: 왜 이 일을 하는지, 성공 상태가 무엇인지 먼저 본다.
- AS-IS 먼저: 코드, 정책, 콘솔, 배포, 실제 화면을 분리해 확인한다.
- Claude Code 보고를 그대로 믿지 않는다. 근거를 직접 대조한다.
- 창업자의 판단 피로를 줄인다. 지금 할 일, 미뤄도 되는 일, 하면 안 되는 일을 나눈다.
- dirty worktree를 보존한다. 사용자/Claude Code가 만든 변경을 되돌리지 않는다.
- Raw SQL은 금지한다. DB 확인/수정은 Prisma 또는 관리 UI 기준으로 판단한다.
- 코드 수정 전에는 변경 범위와 검증 계획을 먼저 보고한다.
- `git add .` 금지. 커밋 시 명시 stage만 사용한다.

---

## 2. 프로젝트 배경

서비스는 `우리 나이가 어때서 / 우나어`입니다.

- 대상: 40대 50대 60대 한국인, 특히 여성 중심 커뮤니티
- 도메인: `https://age-doesnt-matter.com`
- 제품 성격: 커뮤니티 + 일자리/생활 정보 + 재방문 기반 관계형 서비스
- 기술: Next.js 14 App Router, TypeScript strict, Supabase, Prisma, NextAuth v5, Kakao auth, Capacitor Android
- 브랜드 규칙: "시니어" 표현 금지. "우리 또래", "50대 60대", "인생 2막" 사용

이번 vc18 작업의 사업 목적은 Android 앱 전환 이후 **Firebase/GA4/Google Ads App Campaign 전환 최적화 기반**을 만드는 것이었습니다.

단순히 앱을 만든 것이 아니라, Google Ads가 학습할 수 있도록 앱 설치, 로그인, 가입 완료 이벤트를 GA4 Android app stream으로 보내고, Google Ads 전환 액션으로 연결하는 것이 목표였습니다.

---

## 3. 현재 저장소 상태

2026-06-20 확인 기준:

- 현재 브랜치: `poc/ios-capacitor-2-1`
- 현재 HEAD: `ba3fb82`
- origin/main: `59a66e6 perf(onboarding): smooth nickname entry and first home transition`
- 주의: `ba3fb82` 자체가 origin/main의 ancestor는 아니지만, 동일 성격의 온보딩 성능 개선이 origin/main에 `59a66e6`로 반영된 상태로 보입니다. 다음 세션은 반드시 `git log --oneline --decorate -10`과 `git diff origin/main...HEAD`로 실제 차이를 다시 확인해야 합니다.

작업 시작 시 확인된 dirty/untracked 상태는 많습니다. 이들은 기존 사용자/Claude Code 작업으로 보고 보존해야 합니다.

대표 dirty:

- `assets/logo.png` 삭제 상태
- community 관련 파일 수정
- `agents/scripts/_audit-*.mjs` 미추적
- 다수의 `docs/analysis/*` 미추적
- `docs/design/vc18-firebase-fcm-analytics.md` 미추적
- `mockup/`, `ios/.../swiftpm/` 미추적

다음 세션은 어떤 작업을 하든 먼저 `git status --short`를 보고, 요청 범위 밖 dirty는 건드리지 않아야 합니다.

---

## 4. Android/Firebase/GA4/Ads 현재 상태

### Android 앱

- 패키지명: `com.agenotmatter.app`
- Capacitor config: `server.url = https://age-doesnt-matter.com`
- production Play 버전: `versionCode 18`, `versionName 1.0.14`
- Play 게시 완료: 2026-06-19
- Play 스토어 앱 정보에서 `1.0.14` 확인됨
- Play Console Ad ID 선언: "예"로 처리하여 출시 차단 해소

### Firebase

- Firebase project: `agenotmatter-19615`
- project number: `757616369524`
- Android Firebase App ID: `1:757616369524:android:4f5a69a31a937bd6de1621`
- `android/app/google-services.json`이 app ID와 package를 제공
- Android Analytics에서 `measurement_id` 부재는 blocker가 아님. Android는 `mobilesdk_app_id` 기반으로 수집한다.

### GA4

- 최종 사용 GA4 property: `481670969`
- 속성명: `우리 나이가 어때서`
- Android app stream: `com.agenotmatter.app`
- Web stream: `www.age-doesnt-matter.com`
- 목적: 웹과 앱을 한 속성에서 같이 보되, 앱 이벤트는 native SDK로 app stream에 보내고 웹 이벤트는 gtag로 web stream에 보냄

### Google Ads

- GA4 481670969와 Google Ads 연결 완료
- Android `login`, Android `sign_up` 이벤트를 Google Ads 전환 액션으로 import 완료
- Ads 목표 화면에서 `가입` goal에 web sign_up + Android login/sign_up 전환 액션이 보였음
- 상태는 `운영중`
- 실제 전환 수는 트래픽 부족과 Ads 지연 때문에 즉시 판단하면 안 됨

---

## 5. 완료된 주요 커밋

중요 이력:

- `8e47896 feat(android): add oauth handoff for capacitor login`
- `f65a70a fix(android): allow app-handoff provider in signIn callback`
- `2fc04a2 chore(android): production server.url + versionCode 13`
- `830978f chore(android): finalize launcher icon and splash assets for vc17`
- `456663e feat(app): vc18 Firebase native Analytics - 앱 핵심 이벤트 GA4 app stream 전송 + 웹 gtag 차단`
- `f769e9f docs(kakao): 사고 7 추가 - KOE006 Preview redirect_uri 미등록`
- `e93d7ff docs(android): vc18 production Firebase Analytics 검증 기록`
- `fbfd410 docs(android): vc18 완료 정리 - Analytics+Ads 전환 연결 완료, 광고 집행 보류 기록`
- `ba3fb82 perf(onboarding): smooth nickname entry and first home transition`
- `59a66e6 perf(onboarding): smooth nickname entry and first home transition` on origin/main

`456663e`가 vc18 핵심 구현입니다.

---

## 6. vc18 구현 상세

### 패키지

`package.json`에 다음이 반영됨:

- `@capacitor-firebase/app`
- `@capacitor-firebase/analytics`

Android sync 산출물:

- `android/capacitor.settings.gradle`에 Firebase App/Analytics plugin include
- `android/app/capacitor.build.gradle`에 native Firebase dependencies

FCM은 포함하지 않았습니다. FCM은 앱 푸시이며 후순위입니다.

### Native Analytics helper

파일: `src/lib/analytics/app-analytics.ts`

역할:

- `isAppNative()`로 Capacitor native 여부 확인
- 앱에서만 `@capacitor-firebase/analytics` 동적 import
- 웹/TWA에서는 no-op
- native log 실패가 UX를 막지 않도록 catch 처리

### 앱 이벤트

현재 native 전송 이벤트:

- `login_start`
- `login`
- `sign_up`
- `onboarding_complete`

자동 수집:

- `first_open`
- `session_start`
- `screen_view`
- `user_engagement`

### 이벤트 위치

- `src/lib/kakao-start.ts`
  - 앱에서 Kakao Browser open 직전 `login_start`
- `src/components/common/PageViewTracker.tsx`
  - 인증된 세션 최초 감지 시 앱에서 `login`
  - 웹에서는 기존 `gtmLogin`
- `src/components/features/onboarding/OnboardingForm.tsx`
  - 온보딩 완료/환영 화면 CTA 이후 앱에서 `sign_up`, `onboarding_complete`
  - 웹에서는 기존 `gtmSignUp`

### 앱 gtag 차단

앱에서 web stream 오염을 막기 위해 3중 방어가 들어감:

- `src/components/common/GtagLoader.tsx`
  - 앱 native면 gtag script 자체를 로드하지 않음
- `src/lib/gtm.ts`
  - `sendEvent()`가 앱이면 즉시 return
  - `waitForGtagReady()`도 앱이면 즉시 return
- 주요 컴포넌트에서 앱/native와 웹/gtag 분기

검증:

- Android WebView DevTools에서 `typeof window.gtag`가 `"undefined"`
- `window.Capacitor?.isNativePlatform?.()`가 `true`

---

## 7. 검증 이력

### 빌드/정적 검증

vc18 구현 당시 확인:

- TypeScript pass
- ESLint pass
- Next build pass
- `npx cap sync android` pass
- Android release/debug build pass
- `google_app_id` 주입 확인

### Firebase DebugView

확인됨:

- `first_open`
- `session_start`
- `screen_view`
- `login_start`
- `login`

2026-06-19 문서 기록 시점에는 미확인:

- `sign_up`
- `onboarding_complete`

이후 창업자가 production 앱에서 신규 가입 흐름을 직접 진행했고 닉네임 `다은마미`로 홈 도달을 확인했습니다. 이 흐름이면 코드상 `sign_up`과 `onboarding_complete`가 native로 발화되어야 합니다. 다만 다음 세션은 Firebase/GA4/Ads에서 실제 수신 여부를 과잉 확정하지 말고 콘솔에서 다시 확인해야 합니다.

### Play Store

- `1.0.14` production 게시 완료
- Play 앱 상세에 `광고 포함` 표시
- 다운로드 수 1,000회 이상 표시

### Google Ads

- GA4 481670969 연결 확인
- Android `login`, Android `sign_up` conversion import 확인
- goal 화면에서 `운영중` 확인
- 실제 전환 수는 트래픽 부족과 Ads 집계 지연 때문에 당일 0이어도 이상 아님

---

## 8. AAB/서명 관련 중요 주의

이번에 결정적인 함정이 있었습니다.

- `app-release-signed.aab`는 12:24 생성된 구버전 vc17 파일이었고 Firebase Analytics가 포함되지 않았음
- `app-release.aab`는 vc18이었지만 unsigned 상태였음
- 최종적으로 `app-release-vc18-signed.aab`를 upload key로 직접 서명하여 Play에 업로드

keystore:

- 경로: `/Users/yanadoo/migration-backup/android/android.keystore`
- alias: `android`
- 인증서 CN: `Yongseok Kim`

다음 release에서 절대 하면 안 되는 것:

- `app-release-signed.aab`라는 이름만 믿고 업로드하지 말 것
- 반드시 AAB 내부 Firebase 포함 여부, `server.url`, `versionCode`, 서명 여부를 확인할 것
- 비밀번호는 채팅에 쓰지 말고 터미널에서 직접 입력할 것

권장:

- 추후 Gradle signingConfig를 안전하게 구성해 수동 signing 실수를 줄일 것
- 단, 이 작업은 build.gradle 수정이므로 별도 승인 후 진행

---

## 9. Kakao OAuth 운영 주의

Kakao는 이 프로젝트에서 반복 사고가 있었으므로 매우 조심해야 합니다.

참고 문서:

- `docs/kakao-auth-policy.md`
- `docs/kakao-auth-policy.html`

영구 유지해야 할 Kakao redirect URI:

```text
http://localhost:3000/api/auth/callback/kakao
https://age-doesnt-matter.com/api/auth/callback/kakao
https://www.age-doesnt-matter.com/api/auth/callback/kakao
```

Preview 테스트 시:

- immutable Vercel Preview URL을 앱 server.url로 넣은 debug APK를 만들면, 해당 preview callback도 Kakao Developers에 임시 등록해야 함
- 예: `https://{vercel-preview-domain}/api/auth/callback/kakao`
- 테스트 종료 후 preview callback은 삭제해도 됨

KOE006 의미:

- 대부분 코드 문제가 아니라 Kakao Developers의 redirect URI 미등록 또는 불일치
- 도메인만 등록하면 안 되고 `/api/auth/callback/kakao` 전체 경로까지 정확히 등록해야 함

---

## 10. 현재 핵심 문제: 앱 온보딩 속도

창업자가 실제 Android production 앱에서 다음 문제를 보고했습니다.

- 온보딩에서 닉네임 입력 시 버벅임
- 페이지 전환 버벅임
- 온보딩 완료 후 첫 홈 진입까지 지연

이후 성능 개선 커밋이 들어갔습니다.

- `ba3fb82 perf(onboarding): smooth nickname entry and first home transition`
- origin/main에는 `59a66e6`로 반영된 것으로 확인

변경된 것으로 확인된 코드 성격:

- 닉네임 중복 체크 debounce: `450ms`
- 진행 상태 저장 debounce: `300ms`
- 한글 IME composition guard
- stale nickname request guard
- nickname API timeout
- 온보딩 후 도착 페이지 prefetch
- 완료 후 home transition을 부드럽게 만드는 처리

다음 세션에서 해야 할 것은 "더 고치기"가 아니라 먼저 production 앱에서 체감 재검증입니다.

---

## 11. 성능 QA에서 이미 본 참고 데이터

Playwright/감사 스크립트로 본 대략적 경향:

- production cold start는 FCP/LCP 자체보다, 이후 third-party script와 chunk/fetch가 load를 늘리는 경향
- AdSense/GTM/DoubleClick/FundingChoices가 후반 자원 로드에 관여
- warm reload는 훨씬 빠름
- 로그인 Kakao 이동은 외부 인증 영향으로 수 초가 걸릴 수 있음

주의:

- `_audit-signup.mjs`는 Node 24 ESM/CJS Prisma import 문제로 실패한 이력이 있음
- Raw SQL 금지
- Prisma client 문제를 해결하려면 먼저 `npx prisma generate` 필요 여부를 검토해야 함

---

## 12. 다음 작업 우선순위

| 우선순위 | 작업 | 상태 | 다음 액션 |
|---:|---|---|---|
| 1 | Android production 온보딩 속도 재검증 | 대기 | Play Store 1.0.14 앱에서 닉네임 입력, 다음, 약관 완료, 홈 진입 체감 확인 |
| 2 | 그래도 느리면 2차 성능 분석 | 대기 | WebView DevTools Performance trace 또는 Playwright mobile audit로 병목 분리 |
| 3 | Android sign_up / onboarding_complete 실측 확인 | 대기 | 신규 여성 가입 1건 발생 후 Firebase DebugView/GA4/Ads 확인 |
| 4 | Google Ads Android login/sign_up 전환값 자연 수집 확인 | 대기 | 트래픽 적으므로 24-48시간 단위로 확인 |
| 5 | 광고 집행 여부 판단 | 보류 | sign_up 실측 확인 또는 소규모 유입 테스트 전까지 AC 광고 집행 보류 |
| 6 | AdSense/WebView 수익화 확인 | 후순위 | 앱 트래픽과 노출이 쌓인 뒤 AdSense/AdMob 여부 판단 |
| 7 | FCM 앱 푸시 | 후순위 | vc18 범위 밖. 별도 설계 필요 |
| 8 | Airbridge | 더 후순위 | Ads/Firebase 기본 전환 안정화 후 검토 |

---

## 13. 다음 세션에서 바로 할 QA 절차

### 13.1 앱 버전 확인

Android 기기에서:

1. Play Store 앱 상세 열기
2. 버전 `1.0.14`인지 확인
3. 앱 업데이트가 남아 있으면 업데이트

### 13.2 온보딩 속도 체감 QA

신규 계정이 없으면 실제 신규 가입 전체는 어렵습니다. 그래도 다음은 확인할 수 있습니다.

- 기존 계정 로그인 후 홈 진입 속도
- 첫 홈 렌더링 시 이미지/카드/추천 박스 지연 여부
- 로그인 후 화면이 멈춘 것처럼 보이는 구간
- DevTools 연결 가능 시 `window.Capacitor?.isNativePlatform?.()` 확인

신규 계정이 있으면:

1. Kakao 로그인
2. 닉네임 입력
3. 한글 조합 중 버벅임 확인
4. 중복 체크가 입력마다 과도하게 도는지 체감 확인
5. 다음 버튼 반응 확인
6. 약관 완료
7. 환영 화면에서 `우나어 시작하기`
8. 홈 도달까지 시간 확인

문제가 있으면 다음처럼 분류:

- 입력 자체가 버벅임: React state/render 또는 validation/debounce 문제
- 다음 버튼 후 느림: API/write 또는 route transition 문제
- 환영 화면 이후 느림: router replace, home prefetch, home page data fetching 문제
- 홈 첫 렌더 후 느림: 이미지/chunk/third-party script 문제

### 13.3 DebugView 확인

테스트용 기기에서:

```bash
/Users/yanadoo/.bubblewrap/android_sdk/platform-tools/adb shell setprop debug.firebase.analytics.app com.agenotmatter.app
```

Firebase Console:

- Project: `agenotmatter-19615`
- DebugView
- Android app `com.agenotmatter.app`

확인할 이벤트:

- `login_start`
- `login`
- `sign_up`
- `onboarding_complete`

주의:

- Google Ads 전환값은 DebugView처럼 즉시 보이지 않는다.
- Ads는 수 시간에서 24-48시간 지연될 수 있다.
- 트래픽이 없으면 내일까지 봐도 의미 있는 수치가 안 나올 수 있다.

---

## 14. sign_up 이벤트 관련 잠재 리스크

현재 코드상 Android `sign_up`은 `OnboardingForm.tsx`의 마지막 환영 화면 CTA에서 발화되는 것으로 확인됩니다.

즉, DB상 onboarding 완료와 native `sign_up` 발화 시점이 완전히 같지 않을 수 있습니다.

위험 시나리오:

- 사용자가 닉네임/약관 완료 후 환영 화면까지 왔지만 `우나어 시작하기`를 누르기 전에 앱을 닫음
- DB에는 가입 완료에 가까운 상태가 남지만 Ads `sign_up`은 안 찍힐 수 있음

다음 세션이 `sign_up` 누락을 확인하면 바로 코드 수정하지 말고 먼저 read-only로 다음을 확인해야 합니다.

- DB에서 onboarding 완료가 정확히 어느 함수에서 확정되는지
- 웹 gtag `sign_up`의 기존 의미가 어느 시점인지
- 앱 native `sign_up`을 `completeOnboarding` 성공 직후로 앞당겨도 중복/의미 왜곡이 없는지
- `onboarding_complete`와 `sign_up`을 분리할 필요가 있는지

---

## 15. Google Ads 전환 운영 원칙

현재 Google Ads 연결은 완료됐지만 광고 집행은 서두르지 않는 것이 맞습니다.

이유:

- 트래픽이 적어 conversion count가 바로 쌓이지 않음
- `login`은 확인됐지만 핵심인 `sign_up`은 실측이 더 필요
- App Campaign을 미검증 이벤트로 학습시키면 최적화가 잘못될 수 있음

추천 운영:

- 오늘/내일 conversion 숫자가 0이어도 이상으로 보지 말 것
- 지인 신규 가입 1건 또는 자연 유입 1건으로 `sign_up` 확인
- 확인 후 소액 App Campaign 또는 search/display 리타겟팅 검토
- 광고 전에는 앱 첫 경험 속도 개선이 우선

---

## 16. AdSense / AdMob / 앱 광고

창업자가 "앱에서 구글 애드센스는 언제 확인하나"라고 물었습니다.

현재 판단:

- 앱이 Play에 게시됐다고 바로 AdSense 수익화 판단을 하면 안 됨
- 트래픽과 노출이 적으면 AdSense/광고 수익 보고서도 의미가 없음
- WebView 앱에서 웹 AdSense가 어떻게 보이는지와, AdMob native 광고를 붙일지는 별도 판단

우선순위:

1. 앱 속도
2. sign_up 전환 수집
3. 광고 유입 테스트
4. 이후 AdSense/AdMob 수익화 판단

---

## 17. Claude Code에게 줄 read-only 프롬프트

성능 분석을 시킬 때는 바로 구현시키지 말고 아래처럼 시킵니다.

```text
코드 수정 금지. read-only로 Android production 앱 온보딩 성능 병목을 재검증해라.

확인 범위:
1. src/components/features/onboarding/OnboardingForm.tsx
2. 닉네임 입력 state/update/debounce/composition 처리
3. 닉네임 중복 체크 API 호출 빈도와 timeout
4. completeOnboarding 이후 환영 화면과 router.replace/home transition
5. home 첫 렌더링에서 blocking fetch/chunk/image/third-party script 여부
6. 앱 native 환경에서 gtag 차단이 유지되는지

금지:
- 코드 수정 금지
- DB write 금지
- Raw SQL 금지
- git add/commit 금지

산출물:
- 병목 후보를 입력/단계전환/API/home/third-party로 분류
- 실제 코드 파일/라인 근거 제시
- 수정이 필요하면 diff 계획과 검증 명령만 보고
```

sign_up 누락 의심 시:

```text
코드 수정 금지. Android sign_up/onboarding_complete native 이벤트 발화 시점을 read-only로 검증해라.

확인:
- completeOnboarding 성공 시점
- trackEvent('sign_up') 위치
- appLogEvent('sign_up') 위치
- 사용자가 환영 화면에서 앱을 닫는 경우 이벤트 누락 가능성
- 웹 gtag sign_up 의미와의 일치 여부

보고:
- 현재 의미상 sign_up이 어떤 순간을 뜻하는지
- Ads 전환 최적화 목적상 더 적절한 발화 시점
- 중복 방지 방안
- 수정 필요 시 파일별 diff 계획
```

---

## 18. 구현 승인 후 검증 명령

성능 수정이 들어가면 기본 검증:

```bash
npm run typecheck
npm run lint
npm run build
```

Android wrapper 영향이 있으면:

```bash
npx cap sync android
cd android
./gradlew assembleDebug
```

release가 필요하면:

```bash
./gradlew bundleRelease
```

단, signing/AAB 업로드는 반드시 별도 확인 후 진행합니다.

---

## 19. 운영 콘솔 확인 경로

### Firebase DebugView

- Firebase Console
- Project: `agenotmatter-19615`
- Analytics > DebugView
- Android app: `com.agenotmatter.app`

### GA4

- GA4 property: `481670969`
- Property name: `우리 나이가 어때서`
- Admin > Data streams
- Android stream: `com.agenotmatter.app`
- Web stream: `www.age-doesnt-matter.com`

### Google Ads

- Goals / Conversions
- GA4 imported conversion actions
- 확인 대상:
  - Android `login`
  - Android `sign_up`
  - web `sign_up`

### Play Console

- Test and release > Production
- Latest version: `18 (1.0.14)`
- App content > Ad ID declaration

### Kakao Developers

- App ID: `1409330`
- Kakao Login redirect URI
- permanent URI 3개 유지
- preview URI는 테스트 때만 임시 추가

---

## 20. 다음 세션의 성공 상태

다음 세션의 성공 상태는 "무조건 코드 수정"이 아닙니다.

성공 상태:

1. 현재 main/production 배포 상태를 확인한다.
2. Play Store 앱 1.0.14에서 온보딩/홈 체감 속도를 다시 확인한다.
3. 버벅임이 재현되면 입력/API/전환/home/third-party로 원인을 분리한다.
4. 수정이 필요하면 최소 범위로 고친다.
5. 수정 후 typecheck/lint/build 및 필요한 Android QA를 한다.
6. Android `sign_up`과 `onboarding_complete` 실측은 트래픽과 지연을 감안해 운영 모니터링으로 분리한다.

하면 안 되는 것:

- conversion count 0을 보고 즉시 코드 문제로 단정
- Kakao preview URI를 permanent처럼 계속 늘려두기
- old AAB를 이름만 보고 업로드
- Raw SQL
- dirty worktree 정리 명목으로 사용자 변경 되돌리기
- `git add .`

---

## 21. 지금 창업자가 할 일

급한 것:

- Play Store에서 앱이 1.0.14인지 확인
- 앱에서 온보딩/홈 체감 속도 확인
- 지인이 신규 가입하면 닉네임/시간을 기록해두기

급하지 않은 것:

- Ads conversion count 당일 확인
- AdSense 수익 판단
- FCM
- Airbridge

광고 집행:

- Android `sign_up` 실측 확인 전까지 본격 집행 보류 권장
- 앱 속도 체감이 안정된 뒤 소액 테스트로 시작

---

## 22. 참고 문서

- `AGENTS.md`
- `docs/handoff-operating-master-vc18-firebase-2026-06-19.md`
- `docs/verification-android-oauth-day2-2026-06-18.md`
- `docs/kakao-auth-policy.md`
- `docs/kakao-auth-policy.html`
- `docs/design/vc18-firebase-fcm-analytics.md`

---

## 23. 한 줄 결론

Android vc18 production 배포와 Firebase/GA4/Google Ads 전환 연결은 큰 줄기에서 완료됐습니다. 남은 핵심은 **앱 첫 경험 속도 안정화**와 **Android sign_up/onboarding_complete 실측 확인**입니다. 광고와 앱 수익화는 이 두 가지가 닫힌 뒤 진행하는 것이 맞습니다.
