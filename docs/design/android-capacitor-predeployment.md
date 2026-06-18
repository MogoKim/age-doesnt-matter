# Android Capacitor 선배포 — 진단 + 구현 계획

> 상태: **read-only 진단 + 계획 (구현 전 / 코드 미수정)** · 작성 2026-06-18
> 우선순위 변경: **Android Capacitor 선배포 최우선, iOS 2-2 구현 중단.** OAuth handoff 설계([phase-2-2-oauth-handoff.md](./phase-2-2-oauth-handoff.md))는 Android에 재사용하되 Android 기준 재정렬.

---

## 1. AS-IS (실측)

| 영역 | 현재 상태 |
|---|---|
| Capacitor 디렉토리 | **`ios/`만 생성, `android/` 미생성** |
| `capacitor.config.ts` appId | `com.agenotmatter.app` ✅ |
| `capacitor.config.ts` server.url | **iOS PoC preview URL**(`age-doesnt-matter-…vercel.app`) — 단일 config, Android 추가 시 충돌 |
| Capacitor deps | `@capacitor/core·cli·ios ^8.4.0` (android·push·browser·app **미설치**) |
| 기존 Android 앱 | **TWA(Bubblewrap)** — `packageId com.agenotmatter.app`, host `age-doesnt-matter.com`, **versionCode 5 / versionName 1.0.1** |
| 서명 키 | `migration-backup/android/android.keystore` (alias `android`) — **보존됨** |
| assetlinks SHA256 | `D5:F1:9B:5B:0B:44:1C:CF:33:B9:2B:CE:1F:74:1B:62:E0:20:4F:15:61:9C:F2:C0:31:1F:F3:52:0F:40:FD:20` |
| manifest | `related_applications: com.agenotmatter.app` + `prefer_related_applications: true` |
| Push | **Web Push/VAPID only** — `PushSubscription{endpoint@unique, p256dh, auth}`(W3C 모델), `public/sw.js`, `api/push/*`. **FCM/Firebase 코드 없음** |
| 딥링크(custom scheme) | **기존 없음**. `src/lib/app-links.ts`는 Play 스토어 UTM 빌더일 뿐 |
| package id 일치 | capacitor appId = TWA packageId = assetlinks package = manifest related → **전부 일치 ✅** |

---

## 2. Play 업데이트 조건 (TWA → Capacitor **대체 업데이트**)

기존 Play 앱을 **새 앱이 아닌 업데이트**로 올리려면:
1. **같은 `packageId`** `com.agenotmatter.app` — ✅ 충족.
2. **versionCode ≥ 6** (현재 5) — 빌드 시 상향.
3. **같은 서명**: Play **App Signing** 사용 중이면 → upload key가 `android.keystore`와 일치해야 Play가 재서명 수락. assetlinks SHA(위)가 **Play App Signing 키 지문이면 불변**(assetlinks 수정 불필요). ⚠️ **창업자 Play Console 확인 필수**(아래 4장).
4. Capacitor는 TWA와 달리 Digital Asset Links가 **필수 아님**(WebView). 단 `assetlinks`/`prefer_related_applications`는 웹 PWA 설치배너용으로 **유지**.

> 부록: 기존 TWA 사용자 영향 — Capacitor 업데이트 시 **재로그인**(TWA=Chrome 쿠키 ↔ Capacitor=WebView 쿠키 격리) + **푸시 재구독**(web push→FCM). PWA·웹 유저는 무영향.

---

## 3. 블로커

| # | 블로커 | 영향 | 해소 |
|---|---|---|---|
| **B1** | server.url 단일 config (iOS=preview vs Android=production) | Android 선배포는 production(`age-doesnt-matter.com`) 라이브 로드 필요 → 충돌 | 플랫폼별 server 분리 또는 Android=production 우선(iOS PoC는 별도) |
| **B2** | Play App Signing / upload key SHA 일치 **미확인** | 불일치 시 업데이트 거부 → 신규 앱 강제(기존 사용자 분리) | **창업자 Play Console 확인**(4장) |
| **B3** | FCM 미도입 (Capacitor WebView는 web push 사실상 불가) | 앱 푸시 동작하려면 Firebase+`@capacitor/push-notifications`+**prisma token 저장 변경** 필요 | 1차 배포에서 **푸시 제외** 가능(쉘+브라우징만) / 푸시는 후속 단계 |
| **B4** | 앱 로그인 = OAuth handoff 필수 (WebView 쿠키 격리) | handoff 없으면 앱에서 카카오 로그인 불가 → `auth.ts`+`prisma` 변경 필요 | 1차는 **비로그인 쉘**로 배포 / 로그인은 handoff 단계 |
| **B5** | 현재 금지 범위(@capacitor/android·android 생성·firebase·auth.ts·prisma·migration) | **오늘 실제 배포 코드 0** | 단계별 금지 해제 승인 + 창업자 선결 |

---

## 4. 창업자 Play Console 확인 항목 (선결 — 가장 먼저)

1. **Play App Signing 사용 여부**: 사용 중이어야 upload key 재서명으로 업데이트 수락.
2. **등록된 upload key SHA-256** = `android.keystore`(alias `android`)의 지문과 **일치하는지**. (불일치 = 키 분실/교체 → 신규 앱 불가피, 기존 1,400여 사용자 분리)
3. **현재 출시 versionCode** = 5 확인 → 새 빌드는 6 이상.
4. (푸시 단계) **Firebase 프로젝트** 생성 + Android 앱(`com.agenotmatter.app`) 등록 + `google-services.json` + FCM service account 발급.
5. **단계적 출시**(5%→20%→100%) 채택 여부 — 재로그인/재구독 영향 완화.

---

## 5. 구현 단계 (승인 + 선결 후)

### Day 1 — 쉘 배포 (비로그인 브라우징)
- `@capacitor/android` 설치 + `npx cap add android` → `android/` 생성.
- `capacitor.config.ts` server를 **플랫폼 분리**: Android=`https://age-doesnt-matter.com`(production 라이브), iOS PoC는 별도 유지. (Next SSR이라 정적 번들 불가 → 라이브 로드는 TWA와 동일 정당)
- 앱 환경 감지: 기존 `isCapacitor`(window.Capacitor) 재사용 — Android WebView도 동일 주입. **앱 광고 OFF(2-1) 그대로 적용**.
- `versionCode 6` 설정 + `android.keystore`로 서명 → AAB 빌드 → **Play 내부 테스트** 업로드(업데이트로 인식되는지 확인).

### Day 2 — 로그인 (OAuth handoff, Android 재정렬)
- handoff 설계([phase-2-2-oauth-handoff.md](./phase-2-2-oauth-handoff.md)) 적용. **Android 차이만**:
  - 시스템 브라우저: `@capacitor/browser`(Android=Chrome Custom Tabs, iOS와 동일 API).
  - 딥링크: **Android는 App Links(`AndroidManifest` intent-filter + `autoVerify` + 기존 assetlinks 재활용)** 또는 custom scheme `com.agenotmatter.app://`. (iOS는 Info.plist CFBundleURLSchemes/Universal Links)
  - 세션 쿠키 격리·`/app-login/bridge`·Credentials authorize·`/auth/error` 딥링크·nonce replay = **iOS와 동일**.
- 수정: `auth.ts`(Credentials provider) + `prisma`(AppHandoffToken) + migration — **금지/HANDOFF 영역**.

### Day 3 — 푸시 (FCM, web push 병행)
- `@capacitor/push-notifications` + `firebase-admin`(서버 발송) + `google-services.json`(android).
- **VAPID 병행 구조**: 기존 `PushSubscription`(W3C) 유지 + **FCM token 저장**(신규 컬럼 `platform`/`fcmToken` 또는 신규 `FcmToken` 테이블 — prisma 변경). 발송 시 분기: web 구독자=`web-push`, native(Capacitor)=FCM. `public/sw.js`·`api/push/*` 유지(회귀 0).
- env: `FCM_SERVICE_ACCOUNT`(또는 google service account JSON). `.env.local`+Vercel+GHA 동시.

---

## 6. 검증 단계

- **쉘(Day1)**: Android 에뮬/실기기 홈·베스트·커뮤니티·글상세 렌더 / `isCapacitor=true` / 앱 광고 OFF(adsbygoogle·ca-pub 0) / **versionCode 6** / 서명 SHA = Play upload key 일치 / 내부테스트에서 **업데이트로 설치**되는지.
- **로그인(Day2)**: 4 시나리오(신규 여성/신규 남성 차단/기존 로그인/온보딩 callbackUrl) + handoff 보안(replay/만료/위변조) + 에러 딥링크(FemaleOnly).
- **푸시(Day3)**: 앱 FCM 토큰 수신·저장·발송 도달 + **웹/TWA web push 회귀 0**.
- 공통: 웹/TWA 회귀 0(서버 코드 분기만), Edge 미들웨어 정상.

---

## 7. 예상 수정 파일 (구현 시 — 단계별)

### 7-1. 수정/생성 허용 (단계별)
- **Day1(쉘)**: `package.json`(@capacitor/android), `capacitor.config.ts`(플랫폼 server 분리), `android/`(cap add 생성물), 로그인버튼/`app-links` 등 isCapacitor 분기(필요 시).
- **Day2(로그인)**: `src/lib/auth.ts`, `src/lib/app-handoff.ts`(신규), `src/app/app-login/bridge/route.ts`(신규), `src/app/api/app-login/start/route.ts`(신규), `src/app/auth/error/page.tsx`(딥링크 분기), `prisma/schema.prisma`+migration, `android/app/src/main/AndroidManifest.xml`(intent-filter).
- **Day3(푸시)**: `src/lib/push/*`(FCM 병행), 푸시 발송 라우트 분기, `prisma`(FCM token), `android/app/google-services.json`.

### 7-2. 금지 (현 진단 단계 — 창업자 명시)
- iOS 2-2 구현 / `auth.ts` 수정 / `prisma/schema.prisma` 수정 / migration 생성 / `@capacitor/android` 설치 / `android/` 생성 / Firebase 파일 생성 / `git add·commit` / 무관 dirty 파일 정리.

---

## 8. 오늘 끝낼 수 있는 범위 (현 금지 준수 = 코드 0)

현재 금지 목록이 Android 빌드의 모든 코드 작업(@capacitor/android·android 생성·firebase·auth·prisma)을 포함하므로 **오늘 실제 배포 코드는 0**. 오늘 완료 가능한 것:
- ✅ **read-only 진단**(본 문서 1~3장) — 완료.
- ✅ **구현 계획 + 단계화**(5~7장) — 완료.
- ✅ **창업자 Play Console 선결 항목**(4장) — 제출.
- ⏭️ 다음(승인 시): Day1 쉘부터. **선결 B2(서명 일치) 확인이 가장 먼저** — 불일치면 전략 자체가 신규 앱으로 바뀜.

> 권장 순서: ① 창업자 Play App Signing/SHA 확인(4장) → ② Day1 쉘(비로그인) 금지 해제 승인 → ③ 내부테스트 업데이트 인식 확인 → ④ Day2 로그인(handoff) → ⑤ Day3 푸시(FCM).

---

## 9. Day1 실행 결과 — ✅ PASS (2026-06-18)

### 9-1. 빌드/배포 산출
- `@capacitor/android@8.4.0` + `npx cap add android` → `android/` 생성. `applicationId com.agenotmatter.app`.
- **JDK 21 필수**(Capacitor 8.4 — JDK 17은 `invalid source release: 21` 실패). 빌드: `JAVA_HOME=/opt/homebrew/opt/openjdk@21/...` + `ANDROID_HOME=~/.bubblewrap/android_sdk`(platform android-36, build-tools 35).
- `versionCode 7 / versionName 1.0.3` (6은 이미 사용된 코드라 거부 → 7로 상향. **이후 8↑**).
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`(unsigned) → `jarsigner`(android.keystore, alias `android`)로 `app-release-signed.aab` 서명(`META-INF/ANDROID.SF/RSA` 확인).

### 9-2. 서명 키 일치 (블로커 B2 해소)
- 직전 업로드 시 **"버전 코드 이미 사용됨"만 발생, 서명 오류 없음** = **upload key SHA 일치** 확인 → TWA→Capacitor **업데이트 경로 유효**. (assetlinks SHA `D5:F1:9B:…`)

### 9-3. 실기기 검증 — PASS
- Play 내부 테스트 설치 성공, **앱 버전 1.0.3** 확인.
- 렌더 정상: 홈 / 베스트 / 사는이야기 / 글상세 / 댓글 / footer.
- **Google/Temu류 AdSense 광고 미노출** (앱 광고 OFF = isCapacitor 게이트 작동) → **Day1 핵심 목표 달성**.
- **쿠팡 CPS만 노출** — 2-1과 동일, **별도 정책 트랙**(부록 I 참조). Day1 차단 사유 아님.

### 9-4. ⚠️ 이 빌드는 Preview 기반 (production 아님)
- AAB의 `server.url` = **poc Vercel Preview**(`age-doesnt-matter-55bfl5ak8-…vercel.app`, 임시 deployment) — **광고 OFF 코드(isCapacitor)가 main에 없어** 검증용으로 Preview를 사용.
- **내부 테스트(소수 검증) 전용.** Preview deployment가 내려가면 앱이 빈 화면이 됨.
- **production 정식 AAB는 ① poc→main merge + production 배포(=production에 isCapacitor/광고OFF 코드 반영) → ② `capacitor.config.ts` server.url을 `https://age-doesnt-matter.com`으로 → ③ versionCode 8↑로 재빌드·재서명** 후 출시.

### 9-5. Day1 변경 파일 (dirty 분리 — git add/commit 미실행)
**Day1(Android) 직접 변경 — 커밋 대상 후보:**
- `M capacitor.config.ts`(server.url=Preview), `M package.json`·`M package-lock.json`(@capacitor/android), `?? android/`(생성물 — `.gitignore`가 build/·*.aab·*.apk·local.properties 제외)
- `?? docs/design/android-capacitor-predeployment.md`(본 문서), `?? docs/design/phase-2-2-oauth-handoff.md`(2-2 설계)

**타 세션/무관 dirty — 절대 섞지 말 것(이 세션이 안 건드림):**
- `D assets/logo.png`, `M src/app/(main)/community/[boardSlug]/[postId]/page.tsx`, `M …/community/CommentSection.tsx`, `M …/community/GuestCommentInput.tsx`(커뮤니티/댓글 — 타 세션)
- `?? agents/scripts/_*.mjs`, `?? docs/analysis/*`, `?? docs/handoff-*`, `?? mockup/`, `?? scripts/ga4-*.ts`, `?? *.png`(exp1-B·female-only)
- `?? ios/App/.../swiftpm/`(2-1 iOS 생성물 잔여)

> 커밋 시 **Day1 경로만 명시 stage**(`git add capacitor.config.ts package.json package-lock.json android docs/design/`), `git add .` 금지.

### 9-6. 다음 = Android OAuth handoff 구현 준비 (Day2)
- 설계: [phase-2-2-oauth-handoff.md](./phase-2-2-oauth-handoff.md) Android 재정렬분(5장 Day2). `auth.ts`+`prisma`+migration = **승인 게이트**. 현재 전부 미실행.
