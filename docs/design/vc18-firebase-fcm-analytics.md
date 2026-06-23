# vc18 — Firebase Analytics + FCM 토큰 인프라 설계

> 상태: **설계 (구현 전 / read-only 진단)** · 2026-06-19 · 코드 동결
> 목적: 광고 유입 전 Android 앱에서 **설치→로그인→가입완료 전환 추적** + **FCM 재방문 기반** 구축.
> 제외: AdMob / WebView API for Ads / Airbridge / 푸시 자동화 / 마케팅 캠페인 / iOS.
>
> ⚠️ **최종 기술 기준 = §11~17(보강).** §1~10에서 충돌하는 표현(예: "json만 넣으면 활성", `@capacitor/push-notifications`)은 **§11~17이 우선**한다. 플러그인은 **`@capacitor-firebase/app`·`analytics`·`messaging@8.3.0`**로 통일.

---

## 1. AS-IS (실측)

| 영역 | 현재 |
|---|---|
| firebase 패키지 | **없음** (package.json) — 신규 |
| `google-services.json` | **없음** — 창업자 Firebase 콘솔서 발급 |
| Firebase Capacitor plugin | **미설치** — 신규: `@capacitor-firebase/app`·`analytics`·`messaging@8.3.0` (§17) |
| **Android gradle 사전준비** | ✅ `android/build.gradle`에 `classpath 'com.google.gms:google-services:4.4.4'` + `app/build.gradle:48-53`에 "google-services.json 있으면 plugin 자동 apply" 조건부(Capacitor 기본). ⚠️ **이는 `google-services` Gradle plugin만 활성화한다 — Analytics 이벤트 수집은 native SDK(`@capacitor-firebase/analytics`)가 별도로 필요(§11).** |
| 기존 웹푸시(VAPID) | `src/lib/push/{permission,service,subscribe,types}.ts` + `PushSubscription{endpoint@unique, p256dh, auth}`(W3C) + `api/push/subscribe`·`api/admin/push/dispatch-scheduled` |
| GA4/GTM | `src/lib/gtm.ts`(sendEvent/gtag + `gtmSignUp`·`signup_banner_*`·`login` + `getBrowserEnv`=kakao-android 등) + `NEXT_PUBLIC_GTM_ID` |
| 자체 이벤트 | `EventLog{eventName,userId,sessionId,properties,isBot,botType}` + `api/events`(CONVERSION_EVENTS=[post_cta_clicked, sign_up, signup_step, …]) |
| 가입완료 판정 | `auth.ts` jwt `prisma.user.create` + `needsOnboarding=true`(line ~152) |
| 온보딩완료 판정 | `actions/onboarding.ts` `completeOnboarding`(line 42) + `unstable_update({needsOnboarding:false})`(line 134) |

→ **웹은 GA4(gtag)로 sign_up/login 이미 추적 중.** 앱 전용으로 빠진 것 = ① 앱 `first_open`/`app_open`(네이티브) ② FCM 토큰 ③ Android 13 알림권한 ④ Google Ads 전환 연결.

---

## 2. 수정 예상 파일

> **이 §2는 개요다. 최종 파일 목록은 §17(통일본)을 기준으로 한다.** 플러그인은 전부 `@capacitor-firebase/{app,analytics,messaging}@8.3.0`.

### 신규
- `android/app/google-services.json` (Firebase 콘솔 발급 — 창업자, **커밋 허용** §15)
- `src/lib/analytics/app-analytics.ts` — 앱 이벤트(`@capacitor-firebase/analytics` `logEvent`/`setUserProperty`), isCapacitor 가드
- `src/lib/fcm/register.ts` — FCM 토큰 발급/refresh/삭제 + 알림권한 (`@capacitor-firebase/messaging`, isCapacitor 가드)
- `src/app/api/push/fcm-token/route.ts` — 토큰 저장/삭제 API
- `src/lib/push/fcm-send.ts` — `firebase-admin` 발송(service account env)
- `src/components/features/push/FcmRegistrar.tsx` — 로그인 후 토큰 등록 + 권한 요청(client, layout 마운트)
- `prisma/migrations/*_add_fcm_token/migration.sql`

### 수정
- `package.json` — `@capacitor-firebase/app`·`analytics`·`messaging@8.3.0` + `firebase-admin`
- `prisma/schema.prisma` — `FcmToken` 모델
- `src/lib/kakao-start.ts` — `startKakaoLogin`에 `login_start`(앱=app-analytics / 웹=gtag, 이미 isCapacitor 분기 있음)
- `src/lib/actions/onboarding.ts` 호출부 — `onboarding_complete`(client)
- `android/app/src/main/AndroidManifest.xml` — `POST_NOTIFICATIONS` 권한 (FCM 서비스는 plugin 자동)
- `versionCode 18 / 1.0.14`

> **auth.ts·MainActivity·auth.config.ts는 미수정 지향**(sign_up 이벤트는 client/web 흐름). 불가피 시 별도 게이트.

---

## 3. Firebase 콘솔 작업 (창업자 — 외부)
1. **Firebase 프로젝트 생성**(또는 기존) → **Android 앱 등록**: 패키지명 `com.agenotmatter.app`, **SHA-1/SHA-256**(android.keystore + Play App Signing 키 둘 다 등록 권장).
2. **`google-services.json` 다운로드** → `android/app/`에 배치.
3. **Cloud Messaging(FCM) 활성화** → 서버 발송용 **service account 키**(firebase-admin) 또는 FCM v1 자격.
4. **Google Analytics 연결**(Firebase 프로젝트 ↔ GA4 속성). 기존 GA4 속성과 통합 여부 결정.
5. (Day 후속) **Google Ads ↔ GA4 연결** + 전환 import.

---

## 4. DB 스키마 변경 — **필요**
신규 `FcmToken` 모델(웹푸시 `PushSubscription`과 **병행**, 별개):
```
model FcmToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  platform  String   // 'android' (iOS 후속)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
}
```
- VAPID `PushSubscription`은 **그대로 유지**(웹). 발송 시 플랫폼 분기: 웹=web-push, 앱=FCM(firebase-admin).
- migration: 로컬 direct(IPv6) 불가 → Supabase 콘솔/Vercel 적용(HANDOFF, AppHandoffToken과 동일 방식).

---

## 5. 이벤트명 / 파라미터 표

| 이벤트 | 시점 | 파라미터 | 트리거 위치 | 비고 |
|---|---|---|---|---|
> 전송 경로(웹 gtag ↔ 앱 Firebase app stream)는 **§12·§13이 최종**. 아래 "트리거 위치"는 앱 기준.

| 이벤트 | 시점 | 파라미터 | 앱 전송(최종) | 비고 |
|---|---|---|---|---|
| `first_open` | 앱 최초 실행 | (자동) | native `firebase-analytics`(자동) | `@capacitor-firebase/analytics` 설치 시 |
| `app_open` | 앱 실행 | (자동) | native(자동) | 동일 |
| `login_start` | 카카오 버튼 탭 | `method=kakao` | `@capacitor-firebase/analytics` `logEvent` | `startKakaoLogin`(isCapacitor 분기) |
| `login` | 로그인 완료 | `method` | `logEvent` | 앱=native, 웹=gtag |
| `sign_up` | 신규 가입 | `method=kakao` | `logEvent` | 앱=native, 웹=gtag |
| `onboarding_complete` | 온보딩 완료 | — | `logEvent` | `completeOnboarding` 후 client |
| (user property) `app_platform=android_app` | init | — | `setUserProperty` | 앱·웹 구분 |
| (user property) `app_version=1.0.14` | init | — | `setUserProperty` | 버전 로깅 |

- **분리 원칙(최종)**: **앱(isCapacitor)=`@capacitor-firebase/analytics`(GA4 app stream)만**, **웹=`gtag`(GA4 web stream)만**. 같은 이벤트명, 다른 stream. 앱에서 gtag 동시 호출 금지(web stream 오염 방지) — §12.
- Google Ads 전환 = **`sign_up`**(주) + 보조 `onboarding_complete` — §13.

---

## 6. push token 저장 설계
- **발급**: 앱 로그인 성공 후 `FcmRegistrar`가 `@capacitor-firebase/messaging` `requestPermissions()` → `getToken()`(+`tokenReceived` 리스너) → `POST /api/push/fcm-token`(session userId + token + platform) → `FcmToken` upsert(token unique).
- **refresh**: SDK가 새 token 발급 시 동일 API upsert(기존 token row 갱신 또는 신규).
- **logout**: 로그아웃 시 `DELETE /api/push/fcm-token`(현재 token) → row 삭제. (또는 userId 해제)
- **reinstall**: 새 token 발급 → upsert. 옛 token은 FCM 발송 시 `UNREGISTERED` 응답으로 정리(발송 핸들러에서 stale 삭제).
- **중복**: token @unique → 같은 기기 1 row. 유저 변경 시 userId 갱신.

---

## 7. 권한 요청 UX 위치 (Android 13+ POST_NOTIFICATIONS)
- Android 13+는 런타임 알림권한 필수. `@capacitor-firebase/messaging` `requestPermissions()` (Manifest `POST_NOTIFICATIONS`).
- **위치**: **로그인 완료 직후**(가치 제안 후) 또는 홈 첫 진입 1회 — **콜드 스타트 즉시 요청 지양**(거부율↑). 시니어 친화: "새 글·댓글 알림 받기" 안내 후 요청.
- 거부 시 graceful degrade(푸시 없이 동작). 재요청은 설정 안내.

---

## 8. Google Ads 전환 설정 순서
1. Firebase ↔ GA4 연결 + GA4 ↔ Google Ads 계정 연결.
2. GA4에서 `sign_up`(+`onboarding_complete`)을 **전환(주요 이벤트)** 표시.
3. Google Ads → 전환 → **GA4 전환 import**(`sign_up`).
4. (앱 캠페인 시) Firebase first_open/in_app 전환도 Ads 연결. 단 이번 범위는 **전환 추적 준비**까지(캠페인 집행 별도).
5. 검증: 테스트 가입 → GA4 DebugView `sign_up` → Ads 전환 기록(24~48h 지연).

---

## 9. 검증 체크리스트
- [ ] `@capacitor-firebase/{app,analytics,messaging}@8.3.0` 설치 + `google-services.json` 배치 + `cap sync android` + 빌드 성공(google-services plugin 자동 apply 로그).
- [ ] GA4 속성에 **Android app data stream** 존재(없으면 first_open 미수집 — §12).
- [ ] Firebase **DebugView**(앱 stream): `first_open`/`app_open` 수신.
- [ ] `login_start`→`login`→`sign_up`→`onboarding_complete` 이벤트 + `platform=android_app` 확인.
- [ ] FCM 토큰 발급 → `FcmToken` row 저장(로그인 유저) → refresh upsert.
- [ ] Android 13 기기 알림권한 요청 노출 + 허용/거부 동작.
- [ ] **테스트 푸시 1발**(Firebase 콘솔 또는 firebase-admin) → 기기 수신.
- [ ] logout → 토큰 삭제 / reinstall → 새 토큰.
- [ ] **웹/TWA 회귀 0**: VAPID 웹푸시·GA4 기존 이벤트 정상(앱 코드는 isCapacitor 가드).
- [ ] GA4 `sign_up` → Google Ads 전환 import 확인.

---

## 10. 리스크 / 롤백
| 리스크 | 대응 |
|---|---|
| `google-services.json` 누락/오류 → 빌드/푸시 실패 | app/build.gradle 조건부라 **json 없으면 plugin 미적용(빌드 안전)**. 롤백=json 제거 |
| Analytics 중복(웹 gtag + 앱 native) | `platform` 파라미터로 구분 + 이벤트 정의 단일화. 웹 gtag 그대로, 앱 first_open만 native |
| Android 13 권한 거부 → 푸시 미발송 | graceful degrade, 재요청 안내 |
| FCM 토큰 stale(reinstall) | 발송 시 `UNREGISTERED` 응답으로 stale 삭제 |
| VAPID 웹푸시 영향 | **별개 모델/경로 → 영향 0** |
| prisma migration | AppHandoffToken과 동일 — Supabase 콘솔 적용(HANDOFF) |
| 롤백 | vc18 미배포 시 vc17 유지. 배포 후 이상 시 Play rollout 중단 + 이전 버전 |

---

## 다음 (승인 시 순서)
1. **창업자 선결**: Firebase 프로젝트 + Android 앱(패키지/SHA) + `google-services.json` + FCM service account.
2. 패키지 설치 + `FcmToken` 스키마 + migration(Supabase 적용).
3. FcmRegistrar/register/api + 이벤트(login_start/onboarding_complete) — isCapacitor 가드.
4. AndroidManifest 권한 + vc18 빌드 → 테스트 푸시 검증.
5. GA4↔Ads 전환 연결.

> **승인 게이트**: prisma 스키마 + Firebase 파일 + (가능하면 auth.ts 미수정). 본 문서는 설계만 — 코드 동결.

---

# 보강 (2026-06-19) — 기술 확정

## 11. Firebase Analytics 구현 방식 — **확정: native SDK 필요**

> **`google-services.json`만으로는 Analytics 이벤트가 안 들어간다.** json은 앱↔Firebase 연결 식별자(app id / api key / project)일 뿐, **이벤트 수집은 Firebase Analytics native SDK(firebase-analytics)가 앱에 포함돼야** 동작한다.

- 우리 앱은 **server.url(production 웹)을 WebView로 로드** → WebView 안 웹 JS는 `gtag`로 GA4 **web stream**에 보낸다(기존). 이건 "웹 이벤트"이지 "Android 앱 이벤트"가 아니다.
- **Android 앱 이벤트(first_open/app_open 포함)**는 네이티브 컨테이너에서 발생해야 하므로 **`@capacitor-firebase/analytics`(8.3.0, peer @capacitor/core ≥8)** 를 설치한다. 이 플러그인이 `firebase-analytics` native 의존성을 끌어오고, JS(WebView)에서 `FirebaseAnalytics.logEvent()`를 네이티브 Analytics로 브리지한다.
- FCM도 동일 계열 **`@capacitor-firebase/messaging`(8.3.0)** + init `@capacitor-firebase/app`(8.3.0)로 통일(공식 `@capacitor/push-notifications` 대신 — Analytics와 묶어 일관).
- 즉 **google-services.json + @capacitor-firebase/{app,analytics,messaging} 둘 다 필수.** json 단독 불충분.

## 12. first_open / app_open 자동 이벤트가 Android app stream으로 들어가는 조건
1. `@capacitor-firebase/app` + `@capacitor-firebase/analytics` 설치 + `cap sync`(native firebase-analytics 포함).
2. `android/app/google-services.json` 존재(plugin 자동 apply — app/build.gradle:48 조건부).
3. **GA4 속성에 Android app data stream**이 존재(Firebase 프로젝트 ↔ GA4 연결 시 생성, 패키지 `com.agenotmatter.app`).
4. 앱 첫 실행 → native firebase-analytics가 **자동으로 `first_open`/`app_open`을 그 app stream에 전송**(앱 코드 호출 불필요).
- ⚠️ 위 4개 중 하나라도 없으면 app stream에 first_open 미수집. (특히 #3 app stream 미생성 시 데이터 누락 — 흔한 실수)

## 13. 앱 이벤트 전송 경로 표 (웹 gtag ↔ Firebase 앱 이벤트 구분)

| 이벤트 | 웹(브라우저/TWA) | 앱(Capacitor) |
|---|---|---|
| `first_open`/`app_open` | — (웹 개념 없음) | **native SDK 자동** → GA4 **app stream** |
| `login_start` | `gtag` → web stream | `FirebaseAnalytics.logEvent` → app stream |
| `login`(완료) | `gtag` → web stream(기존) | `FirebaseAnalytics.logEvent` → app stream |
| `sign_up` | `gtag` → web stream(기존) | `FirebaseAnalytics.logEvent` → app stream |
| `onboarding_complete` | `gtag` → web stream | `FirebaseAnalytics.logEvent` → app stream |

- **구분 원칙**: 같은 이벤트명이라도 **웹=gtag(web stream)**, **앱=@capacitor-firebase/analytics(app stream)**. 호출부에서 `isCapacitor` 분기 — 앱이면 native logEvent, 아니면 gtag. (이중 전송 아님: 앱 WebView에서는 native 우선, gtag는 web stream 오염 방지 위해 앱에선 생략 가능 — **결정 필요: 앱에서 gtag도 호출하면 web stream에 앱 트래픽 섞임**. 권장: 앱=native만, 웹=gtag만.)
- `platform` user property: 앱=`android_app`, `app_version` 세팅(setUserProperty).

## 14. GA4 / Firebase / Google Ads 연결 구조
```
GA4 속성(기존, 1개)
 ├─ Web data stream (기존)          ← gtag (브라우저/TWA)
 └─ Android app data stream (신규)  ← @capacitor-firebase/analytics (앱) + first_open 자동
        ▲
 Firebase 프로젝트(Android 앱 com.agenotmatter.app) ──연결──┘  (google-services.json)

GA4 속성 ──연결── Google Ads
   sign_up(주요 이벤트) ──import──> Ads 전환
```
- **기존 GA4 web 속성에 Android app stream을 추가**(별도 속성 만들지 않음) → 웹+앱 한 속성서 퍼널 통합.
- Google Ads 전환 = GA4 `sign_up` import(웹·앱 공통 이벤트명).

## 15. secret 관리 방식
- **`firebase service account`(FCM 발송용, firebase-admin)**: **repo 커밋 절대 금지.** Vercel env `FIREBASE_SERVICE_ACCOUNT`(JSON 문자열) + (필요시 GHA secret). `.env.local`은 gitignore. 발송 라우트에서 `JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)`.
- **`google-services.json`**: app id / api key(클라이언트 노출용, 민감 secret 아님)지만 — 정책 확정: **repo 커밋한다**(Capacitor 빌드 표준 + 일관성). `android/.gitignore`의 해당 줄은 **주석(#)이라 이미 커밋 허용 상태**. 단 내부엔 서버 secret 없음(client config). *보수적으로 gitignore+CI 주입을 원하면 별도 결정 — 기본은 커밋.*
- **VAPID 키**(기존 웹푸시): 그대로 유지(Vercel env).

## 16. FCM 토큰 저장 — VAPID와 분리 (재확정)
- `FcmToken`(신규 모델) ≠ `PushSubscription`(VAPID, endpoint 기반). **완전 분리.**
- 발송 분기: 웹 구독자 → `web-push`(VAPID/PushSubscription), 앱 → `firebase-admin`(FCM/FcmToken). 한 유저가 둘 다 가질 수 있음(웹+앱).

## 17. vc18 최종 구현 범위 (파일 재정리)

### 패키지 (신규)
- `@capacitor-firebase/app@8.3.0`, `@capacitor-firebase/analytics@8.3.0`, `@capacitor-firebase/messaging@8.3.0`
- `firebase-admin`(서버 발송)

### 신규 파일
- `android/app/google-services.json` (Firebase 발급, 커밋)
- `src/lib/analytics/app-analytics.ts` — isCapacitor 분기: 앱=FirebaseAnalytics.logEvent/setUserProperty, 웹=gtag(기존 위임)
- `src/lib/fcm/register.ts` — 토큰 발급/refresh/삭제 + 권한
- `src/components/features/push/FcmRegistrar.tsx` — 로그인 후 등록(layout 마운트, isCapacitor)
- `src/app/api/push/fcm-token/route.ts` — 저장/삭제
- `src/lib/push/fcm-send.ts` — firebase-admin 발송(service account env)
- `prisma/migrations/*_add_fcm_token/migration.sql`

### 수정 파일
- `package.json`/lock
- `prisma/schema.prisma`(FcmToken)
- `src/lib/kakao-start.ts`(login_start: 앱=app-analytics)
- `src/lib/actions/onboarding.ts` 호출 client(onboarding_complete)
- 로그인/가입 완료 지점 이벤트 호출부(웹 gtag 기존 + 앱 분기) — **auth.ts 미수정 지향**(이벤트는 client/web)
- `android/app/src/main/AndroidManifest.xml`(POST_NOTIFICATIONS, FCM service는 plugin 자동 가능)
- `versionCode 18 / 1.0.14`

### 미수정 (유지)
- VAPID `src/lib/push/{service,subscribe}`·`PushSubscription` / `MainActivity.java` / `auth.config.ts` / `AppDeepLinkHandler.tsx`(필요 시 FcmRegistrar 별도)

> 본 보강도 **설계 확정만** — 코드 동결. 창업자 Firebase 콘솔 선결(§3) + 착수 승인 후 단계 구현.
