# AC 캠페인 "회원가입(sign_up)" 전환 최적화 기술 검증

> 작성일: 2026-06-17 | READ-ONLY 코드/설정 감사 + Google 정책 확인
> 질문: AC(앱 설치 캠페인)의 최적화 목표를 "설치" → "sign_up 완료"로 바꿔, 남성이 가입 못 하는 구조를 이용해 알고리즘이 여성만 학습하게 만들 수 있는가?

## 한 줄 결론

**전략의 "제품 로직"은 성립하지만(A), "측정 로직"이 현재 구조로는 AC에 안 먹힌다(C).**
우리 sign_up은 **웹(GA4) 이벤트**인데, AC의 인앱 액션 입찰은 **앱(Firebase/SDK) 이벤트**를 요구한다. 우리는 TWA(웹뷰) + Firebase 미설치라 둘이 연결돼 있지 않다. → **현재 상태로는 "AC를 sign_up으로 최적화" 불가.** 되게 하는 현실적 우회로는 C/D에 정리.

---

## A. sign_up 이벤트 발화 지점 — ✅ 전략 성립 (단 1개 누수)

### 현재 상태 (코드 확인)
- **발화 함수**: `gtmSignUp('kakao')` → `sendEvent('sign_up', { method, ...getStoredUtm() })` → `window.gtag('event','sign_up')` ([src/lib/gtm.ts:209-211](src/lib/gtm.ts#L209-L211))
- **발화 시점**: 온보딩 Step 3 "우나어 시작하기" 버튼 클릭 = `handleComplete()` ([src/components/features/onboarding/OnboardingForm.tsx:228-232](src/components/features/onboarding/OnboardingForm.tsx#L228-L232))
  - 이 시점은 닉네임 입력 + 약관 동의 + `completeOnboarding()`(isOnboarded=true 커밋, [onboarding.ts:82-111](src/lib/actions/onboarding.ts#L82-L111))이 **모두 끝난 뒤**다.
  - → **"클릭"이 아니라 "가입 완료" 시점**이 맞다. ✅
- **남성 차단 시점**: NextAuth `signIn` 콜백, **User 생성 전 가장 이른 지점** ([src/lib/auth.ts:36-47](src/lib/auth.ts#L36-L47))
  ```
  if (!existing) { if (kakaoData?.gender === 'male') return '/auth/error?error=FemaleOnly' }
  ```
  - `signIn`이 에러 URL 문자열을 반환하면 NextAuth가 로그인을 거부 → `jwt` 콜백(User 생성, [auth.ts:113](src/lib/auth.ts#L113))이 **실행되지 않음** → **남성은 User 레코드 미생성** ✅
  - 남성은 `/onboarding` 페이지에 **도달조차 못 함** → sign_up 이벤트 **절대 미발화** ✅

### 판정: **가능 (✅)**
"남성 차단 → User 미생성 → 온보딩 도달 불가 → sign_up 발화 불가"의 인과가 코드상 정확히 성립.
**sign_up 전환은 여성(+성별 미상)에게서만 발생한다.**

### ⚠️ 단 하나의 누수 — 성별 미상 통과
카카오 `gender`는 **선택 동의 항목**이다. scope에 `gender`를 요청하지만([auth.config.ts:19](src/lib/auth.config.ts#L19)) 사용자가 성별 제공에 **동의하지 않으면** `kakaoData.gender`가 `undefined`가 되고, 차단 조건 `=== 'male'`을 **빠져나간다**([auth.ts:42](src/lib/auth.ts#L42)).
→ **성별 동의를 거부한 남성은 가입 가능하고 sign_up도 발화한다.** 전략의 "여성 순도"는 카카오 성별 동의율에 비례. (얼마나 새는지는 GA4/DB에서 gender=null 신규가입 비율로 측정해야 함 — UI/쿼리 확인 필요)

---

## B. 측정 스택 — GA4 웹만 있고 Firebase 없음

### 현재 상태 (코드 확인)
| 항목 | 상태 | 근거 |
|------|------|------|
| GA4 웹 스트림 | ✅ G-XD7XDP42DF | gtag config ([GtagLoader.tsx:45](src/components/common/GtagLoader.tsx#L45)) |
| Google Ads gtag | ✅ AW-18086681147 | gtag config ([GtagLoader.tsx:46](src/components/common/GtagLoader.tsx#L46)) |
| GA4로 sign_up 전송 | ✅ | `gtag('event','sign_up')` ([gtm.ts:209](src/lib/gtm.ts#L209)) |
| sign_up 파라미터 | method, utm_*, gclid, fbclid | `getStoredUtm()` 스프레드 ([gtm.ts:210](src/lib/gtm.ts#L210), [gtm.ts:119-122](src/lib/gtm.ts#L119-L122)). **gender 파라미터는 없음** |
| gclid 캡처 | ✅ | `captureUtm()` ([gtm.ts:133-156](src/lib/gtm.ts#L133-L156)), layout에서 마운트 ([PageViewTracker.tsx:22](src/components/common/PageViewTracker.tsx#L22)) |
| EventLog 자체 DB | ✅ | `trackEvent('sign_up')` ([OnboardingForm.tsx:229](src/components/features/onboarding/OnboardingForm.tsx#L229)) |
| **Firebase SDK** | **❌ 없음** | package.json 의존성 없음, firebase config 파일 없음 |
| GTM | ⚠️ 설정만(GTM-T4ZFSDFQ), 실제 이벤트는 gtag 직접 전송 | [gtm.ts:4-6](src/lib/gtm.ts#L4-L6) |

### 판정
- sign_up이 GA4로 가는 것: **확인됨 (✅)**
- Firebase 프로젝트가 com.agenotmatter.app에 연결: **❌ 코드상 Firebase 자체가 없음**
- **GA4 ↔ Google Ads 연결 / GA4 ↔ Firebase 연결: 코드로 확인 불가 → UI 확인 필요** (아래 "UI에서 봐야 할 것")

---

## C. Google Ads 전환 import & AC 최적화 가능성 — ⛔ 핵심 관문에서 막힘

### 결정적 사실 (Google 정책)
- AC의 **인앱 액션 입찰(in-app action bidding)**은 **Firebase SDK 또는 third-party 앱 SDK의 앱 이벤트**를 요구한다. ([Google Ads Help](https://support.google.com/google-ads/answer/13823256?hl=en))
- 우리 앱은 **TWA(웹뷰)**다. TWA는 네이티브 액티비티가 아니라서 **Firebase/AppsFlyer 같은 SDK로 인앱 이벤트를 보낼 수 없다.** ([AppsFlyer: Using AppsFlyer with TWA](https://support.appsflyer.com/hc/en-us/articles/360002330178-Using-AppsFlyer-with-TWA))
- 따라서 **우리의 웹 GA4 sign_up 이벤트를 AC의 인앱 액션 최적화 타겟으로 직접 쓸 수 없다.**

### 판정: **현재 구조로는 불가 (⛔)** — "AC + sign_up 최적화" 조합 자체가 성립 안 함

### 되게 하려면 (현실적 대안, 난이도순)

| # | 방법 | 내용 | 난이도 | 비고 |
|---|------|------|--------|------|
| 1 | **GA4 sign_up → Google Ads 전환 import** | GA4 키 이벤트 sign_up을 Ads 전환으로 가져옴 | 낮음 (UI 클릭, 코드 0) | **단 이건 웹 캠페인(P맥스/검색/디맨드젠)용.** AC 인앱 액션엔 안 붙음 |
| 2 | **AC를 버리고 웹 캠페인으로 가입 최적화** | 설치 대신 웹 sign_up을 목표로 P맥스/디맨드젠 운영 | 낮음~중간 (광고 운영) | "여성만 학습" 전략이 **여기서는 그대로 성립**(웹 전환=여성). 설치는 부산물 |
| 3 | **Web to App Connect** | 웹 전환을 앱 캠페인 성과에 연결하는 Google 기능 | 중간 | ([Google Ads Help](https://support.google.com/google-ads/answer/15929459?hl=en)) — 딥링크/검증 필요, AC 인앱 입찰 대체 여부는 UI 검증 |
| 4 | **Firebase를 TWA에 심기** | 앱 이벤트를 진짜 발생시켜 AC 인앱 액션 입찰 사용 | 높음 | TWA는 웹뷰라 SDK 통합 까다로움. 사실상 비권장 |

> **권장 방향**: 전략의 목적(여성만 알고리즘에 학습)은 **#1+#2 (웹 전환 최적화)**로 달성하는 게 정석이다. "AC(설치 최적화)를 sign_up으로 바꾼다"는 프레임 자체를 "웹 가입 전환 캠페인"으로 교체하는 것. 설치 수는 줄 수 있으나, 원래 목표가 "여성 가입자"이므로 KPI가 오히려 정렬된다.

---

## D. 설치 ↔ 가입 어트리뷰션 — 부분적 (웹/앱 세션 분리)

### 현재 상태 (코드 확인)
- TWA ↔ Play 연결: assetlinks([public/.well-known/assetlinks.json](public/.well-known/assetlinks.json)) + manifest related_applications([public/manifest.json:13-20](public/manifest.json#L13-L20)) **연결됨 ✅**
- TWA 첫 실행 자동 UTM 태깅: `utm_source=google-play, utm_medium=organic` ([gtm.ts:141-150](src/lib/gtm.ts#L141-L150))
- gclid 캡처 → sign_up에 포함 ✅

### 판정: **조건부 (한 유저로 자동으로 안 묶임)**
- 광고→**설치**는 Google Play가 추적, **가입**은 웹 GA4 이벤트 → **서로 다른 측정 영역**이다.
- 이 둘을 "광고→설치→가입" **하나의 전환 경로**로 AC가 보려면 Firebase/SDK 어트리뷰션이 필요 → **C와 같은 벽**. 현재는 끊겨 있다.
- 단 #2(웹 캠페인) 경로에서는 gclid 기반으로 "광고 클릭→웹 sign_up"이 **하나로 묶인다**(이미 인프라 있음).

---

## UI에서 직접 봐야 할 것 (코드로 확인 불가)

1. **GA4 → Google Ads 연결 여부**
   GA4 관리(⚙️) → 제품 링크 → **Google Ads 링크**. AW-18086681147이 연결돼 있는지.
2. **sign_up이 GA4 키 이벤트(전환)로 표시됐는지**
   GA4 관리 → 이벤트 / 키 이벤트 → `sign_up` 토글 ON 여부.
3. **Google Ads에 sign_up 전환 액션 import 여부**
   Google Ads → 목표 → 전환 → 요약. GA4 sign_up이 전환 액션으로 들어와 있는지, "최적화에 포함" 상태인지.
4. **Firebase 프로젝트 존재/연결**
   Firebase 콘솔에 com.agenotmatter.app 프로젝트가 있는지 (코드상 없음 → 거의 확실히 미연결, UI로 최종 확인).
5. **성별 미상 누수율** (전략 순도)
   GA4 또는 DB에서 최근 신규가입 중 `gender = null` 비율. 카카오 성별 동의를 거부하고 들어온 남성 추정치.
6. **현재 AC 캠페인의 입찰 목표**
   Google Ads → 해당 AC → 설정 → 입찰. 지금 "설치 수" 최적화인지, 인앱 액션이 잡혀 있는지.

---

## 종합

| 항목 | 판정 |
|------|------|
| A. sign_up이 "가입 완료" 시점 발화 + 남성 미발화 | ✅ 성립 (성별 미상 누수 1건 주의) |
| B. 웹 GA4로 sign_up 전송 | ✅ / Firebase ❌ |
| C. 웹 sign_up을 **AC 인앱 액션** 최적화에 사용 | ⛔ 불가 (TWA 웹뷰 + Firebase 부재) |
| C'. 웹 sign_up을 **웹 캠페인**(P맥스/디맨드젠) 최적화에 사용 | ✅ 가능 (전환 import만 하면 됨) |
| D. 광고→설치→가입 단일 어트리뷰션 | ⛔ AC경로 / ✅ 웹캠페인 경로(gclid) |

**전략 재구성 제안**: "AC를 sign_up으로 최적화"(불가) 대신 → "웹 sign_up 전환을 목표로 하는 디맨드젠/P맥스 캠페인"(가능)으로 가면, 의도한 "여성만 알고리즘 학습" 효과를 **코드 변경 0, GA4/Ads UI 설정만으로** 얻을 수 있다.

### 출처
- [Measure and optimize App campaign performance using Google Analytics data](https://support.google.com/google-ads/answer/13823256?hl=en)
- [About bidding in App campaigns](https://support.google.com/google-ads/answer/7100895?hl=en)
- [Set up Web to App Connect](https://support.google.com/google-ads/answer/15929459?hl=en)
- [Using AppsFlyer with TWA](https://support.appsflyer.com/hc/en-us/articles/360002330178-Using-AppsFlyer-with-TWA)
- [About mobile app conversion tracking](https://support.google.com/google-ads/answer/6100665?hl=en)
