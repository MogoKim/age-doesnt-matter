# Codex 운영 마스터 핸드오프

작성일: 2026-06-18 KST  
대상 저장소: `/Users/yanadoo/Documents/New_Claude_agenotmatter`  
현재 핵심 작업: iOS Capacitor Phase 2-1 PoC 런타임 검증

이 문서는 다음 Codex 세션이 컨텍스트를 다시 캐지 않고도 바로 이어받기 위한 운영 인수인계 문서다.  
다음 세션은 이 문서를 먼저 읽고, 반드시 `git status --short`와 현재 브랜치부터 확인해야 한다.

---

## 0. 다음 세션 첫 행동

새 세션에서 사용자가 이어서 진행하자고 하면 먼저 아래 순서로 시작한다.

```bash
git branch --show-current
git status --short
git log --oneline --decorate -8
```

그 다음 이 문서의 `4. 현재 활성 작업: iOS Capacitor Phase 2-1`부터 읽는다.

새 세션에 바로 붙여넣을 프롬프트:

```txt
이 문서부터 읽고 현재 브랜치/dirty 상태 확인해라:
docs/handoff-codex-operating-master-2026-06-18.md

지금은 iOS Capacitor Phase 2-1 런타임 검증 중이다.
코드 수정하지 말고, Safari Web Inspector에서 앱 WebView DOM 검증을 끝내도록 안내해라.
Claude Code 보고는 그대로 믿지 말고 현재 브랜치, diff, 실제 화면, 런타임 상태를 대조해라.
```

---

## 1. 역할 정의

### Codex의 역할: 운영 마스터

Codex는 이 저장소에서 단순 개발자가 아니라 운영 총괄, 기술 판단자, QA 책임자 역할이다.

Codex가 반드시 해야 하는 일:

- 목적과 성공 상태를 먼저 확정한다.
- AS-IS를 코드, DB, CI, 워크플로우, 운영 화면으로 분리해 확인한다.
- Claude Code의 보고를 그대로 믿지 않는다.
- Claude Code가 "완료"라고 해도 실제 코드, 배포, CI, 런타임, 운영 데이터와 대조한다.
- 창업자의 판단 피로를 줄이기 위해 선택지를 2~3개로 줄이고 추천안을 제시한다.
- 업무를 `지금 끝낼 수 있음`, `창업자 확인 필요`, `데이터 대기`, `백로그`, `제외`로 나눈다.
- Claude Code에게는 범위, 금지사항, 확인 파일, PASS 기준, 커밋 범위를 명확히 지시한다.
- 같은 파일을 Claude Code와 동시에 수정하지 않는다.
- 다른 세션의 untracked/dirty 파일은 삭제하거나 되돌리지 않는다.
- DB write, 어드민 조작, Vercel/env 변경, force push, destructive command는 명시 승인 없이 하지 않는다.

Codex가 피해야 하는 일:

- Claude Code 보고만 보고 종결 처리.
- 실기기 확인을 직접 하지 않았는데 했다고 말하기.
- 사용자 승인 없는 DB write.
- 현재 작업과 무관한 dirty 파일 정리.
- `git add .` 사용.
- 다른 세션이 작업 중인 파일 수정.

### Claude Code의 역할: 구현/진단 담당

Claude Code는 구현과 read-only 진단을 맡는다. 단, Claude Code에게 넓은 자율권을 주면 파일 혼입, 커밋 범위 오염, 오진이 생길 수 있다.

Claude Code에게 줄 프롬프트에는 항상 아래가 있어야 한다.

- 목적.
- read-only인지 구현인지.
- 허용 파일.
- 금지 파일/금지 행동.
- 확인할 파일.
- 산출물 형식.
- PASS 기준.
- 커밋 범위.
- staging 방식: 경로 명시, `git add .` 금지.

Claude Code가 할 수 없는 것으로 취급해야 하는 것:

- 창업자 실기기 확인.
- 외부 콘솔 확인: AdSense, Play Console, App Store Connect, Vercel UI 등.
- 사용자의 DB/어드민 조작을 했다고 가정.
- 다른 세션의 untracked 파일 삭제.

### 창업자의 역할

창업자는 최종 사업 판단과 외부/실기기 확인을 담당한다.

창업자가 직접 해야 하는 경우:

- Android/iOS/TWA 실기기 동작 확인.
- AdSense 대시보드 수익 지표 확인.
- Play Console, App Store Connect, Vercel env 확인.
- Apple Developer 계정/서명/팀 선택.
- 실제 카카오 계정 로그인 테스트.
- 운영 정책 결정: 광고 유지/차단, 기존 남성 회원 처리, 실험 시작/종료 등.

Codex는 창업자가 해야 할 일을 "한 화면에서 어디를 누를지" 수준으로 안내해야 한다.

---

## 2. 작업 원칙

### 시작 원칙

모든 작업은 `git status --short`로 시작한다.

현재 저장소에는 여러 세션의 작업물이 섞이는 일이 자주 있었다. 따라서 반드시 아래를 지킨다.

- 커밋은 경로 명시로만 한다.
- `git add .` 금지.
- `git commit -- <path1> <path2>` 또는 명시적 `git add <path>`만 사용.
- unrelated dirty 파일은 "보존"한다.
- 삭제된 파일도 사용자 승인 없이 복구/삭제 확정하지 않는다.
- build가 실패하면 내 변경 때문인지, 기존 staged/dirty 때문인지 먼저 분리한다.

### 판정 원칙

상태는 아래 용어로 분리한다.

- `Code/static PASS`: 타입, 린트, 빌드, 코드 경로가 맞음.
- `Runtime PASS`: 브라우저, 시뮬레이터, 실제 앱에서 동작 확인됨.
- `Ops/data PASS`: 외부 대시보드, DB 집계, 실기기, 수익 데이터까지 확인됨.
- `N/A`: 현재 테스트 대상 없음. 예: 활성 팝업 0개.
- `BLOCK`: 필요한 권한/기기/데이터가 없어 더 진행 불가.

종결은 `Runtime PASS` 또는 `Ops/data PASS`까지 필요한지 업무별로 다르다. 인증, 푸시, 앱, 광고, 수익은 코드 PASS만으로 종결하지 않는다.

---

## 3. 현재 저장소 상태

마지막 확인 시점: 2026-06-18 KST.

현재 브랜치:

```txt
poc/ios-capacitor-2-1
```

현재 HEAD:

```txt
a1284b7 (HEAD -> poc/ios-capacitor-2-1, origin/poc/ios-capacitor-2-1) feat(poc): iOS Capacitor shell 2-1 — 환경감지·앱 광고 OFF (server.url PoC)
```

최근 로그:

```txt
a1284b7 feat(poc): iOS Capacitor shell 2-1 — 환경감지·앱 광고 OFF (server.url PoC)
862fcb4 feat: 첫 참여 온보딩 Phase 3 — 홈 신입환영 섹션(실유저 환대 2층)
8847337 refine: 홈 회원 인사 카드(PersonalGreeting) 당분간 비활성화
7d7519c feat: 첫 참여 온보딩 Phase 2 — 회원 첫 인사 위젯 + submitGreeting
44bb25c feat: 첫 참여 온보딩 Phase 1 — 가입인사 카테고리 + 전방위 노출/생성 차단
537b6cb docs: UTM 문서에 친구톡(카카오 메시지) 규칙 추가
105c259 fix: 어드민 대시보드 창업자/내부 트래픽 자동 제외 (데이터 신뢰성)
2f11b5e fix: 매거진 plist·라벨 stale 정정 — 11→12시, gemini→chatgpt 통일
```

현재 dirty/untracked 상태:

```txt
 D assets/logo.png
 M capacitor.config.ts
 M src/app/(main)/community/[boardSlug]/[postId]/page.tsx
 M src/components/features/community/CommentSection.tsx
 M src/components/features/community/GuestCommentInput.tsx
?? agents/scripts/_audit-coldstart.mjs
?? agents/scripts/_audit-hero.mjs
?? agents/scripts/_audit-signup.mjs
?? agents/scripts/_gen-favicon.mjs
?? docs/analysis/ac-signup-optimization-feasibility-2026-06-17.md
?? docs/analysis/app-retention-experiments-2026-06-16.html
?? docs/analysis/channel-efficiency-2026-06-15.md
?? docs/analysis/d1-retention-2026-06-15.html
?? docs/analysis/d1-retention-asis-2026-06-15.md
?? docs/analysis/experiment1-infra-design-2026-06-15.html
?? docs/analysis/first-participation-infra-design-2026-06-17.html
?? docs/analysis/first-participation-onboarding-2026-06-17.html
?? docs/analysis/golden-user-2026-06-15.html
?? docs/analysis/keyword-widelist-2026-06-15.html
?? docs/analysis/seo-organic-diagnosis-2026-06-15.md
?? docs/analysis/signup-cta-measurement-audit-2026-06-18.md
?? docs/analysis/web-retention-experiments-2026-06-15.html
?? docs/analysis/속도개선-기획서-2026-06-16.md
?? docs/handoff-f17-naver-lockin.md
?? exp1-B-card-view.png
?? female-only-block.png
?? ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/
?? mockup/
?? scripts/ga4-gcpc-names.ts
?? scripts/ga4-scroll-check.ts
?? scripts/ga4-utm-inflow.ts
```

주의:

- `assets/logo.png` 삭제는 오래된 unrelated 변경이다. 필요 여부를 별도 판단하기 전까지 건드리지 않는다.
- `capacitor.config.ts`는 PoC server.url 변경으로 dirty일 가능성이 높다. 커밋 전 확인 필요.
- `src/app/(main)/community/[boardSlug]/[postId]/page.tsx`, `CommentSection.tsx`, `GuestCommentInput.tsx`는 다른 작업이 진행 중일 수 있다. Capacitor 2-1 검증 중에는 손대지 않는다.
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`은 Xcode/SPM 실행으로 생긴 파일일 수 있다. 임의 삭제 금지.

---

## 4. 현재 활성 작업: iOS Capacitor Phase 2-1

### 목적

TWA를 당장 대체하지 않고, iOS Capacitor 앱 PoC가 가능한지 확인한다.

Phase 2-1의 목표:

- iOS Capacitor shell이 웹을 `server.url`로 로드한다.
- 기존 Next.js 웹 렌더가 iOS WebView에서 깨지지 않는다.
- 앱 환경 감지가 된다.
- 앱 WebView에서는 AdSense가 꺼진다.
- 웹/브라우저에서는 AdSense 또는 기존 광고 동작이 회귀하지 않는다.

Phase 2-1에서 하지 않는 것:

- main 병합.
- production 배포.
- OAuth handoff 구현.
- push 구현.
- deeplink 구현.
- Android TWA 대체.
- Airbridge.
- 결제.
- AdMob/WebView API for Ads.

### 현재 방향

기본 전략은 `C안`이다.

```txt
Android TWA는 유지.
iOS만 Capacitor로 먼저 PoC.
```

Android Capacitor 전환은 지금 하지 않는다. 기존 Android TWA 사용자가 있고, 전환 시 재로그인/푸시 재구독 리스크가 있다.

### 현재 Preview URL

Claude Code가 만든 Vercel Preview:

```txt
https://age-doesnt-matter-55bfl5ak8-mogoyongseok-8318s-projects.vercel.app
```

이 URL은 PoC 브랜치 코드를 로드하기 위한 것이다. production 도메인 직접 로드는 GA4/EventLog 오염 및 PoC 코드 미반영 문제 때문에 금지로 봤다.

### 현재 확인된 것

창업자 스크린샷 기준:

- Xcode 설치 완료.
- `npx cap sync ios`, `npx cap open ios` 실행 완료.
- iPhone 17 Pro 시뮬레이터에서 앱 실행됨.
- 홈, 베스트, 커뮤니티, 매거진, 일자리, 로그인 슬라이드 화면이 렌더됨.
- 로컬 dev + 터널 방식에서는 Supabase DB 연결 오류가 났다.
- Vercel Preview 방식으로 바꾼 후 렌더는 정상에 가까워졌다.
- 화면에 쿠팡 CPS 배너가 보인다.

중요 정정:

- 쿠팡 CPS 배너가 보이는 것은 AdSense가 켜졌다는 뜻이 아니다.
- `aria-label="광고"`는 AdSense 전용이 아니다. 쿠팡 컴포넌트도 같은 라벨을 쓴다.
- AdSense 판정은 `adsbygoogle`, `ins.adsbygoogle`, `data-ad-client`로 해야 한다.

### 2-1 PASS 기준

2-1은 아래 두 가지가 충족되면 런타임 PASS로 볼 수 있다.

1. 렌더 PASS:
   - 홈.
   - `/best`.
   - `/community`.
   - `/magazine`.
   - `/jobs`.
   - 글상세.
   - `/login`.
   - Next runtime error 없음.

2. AdSense OFF PASS:
   - 앱 WebView 콘솔에서 아래가 성립.

```js
document.querySelectorAll('script[src*="adsbygoogle"]').length
// 0

document.querySelectorAll('ins.adsbygoogle').length
// 0

document.querySelectorAll('[data-ad-client]').length
// 0

window.Capacitor?.isNativePlatform?.()
// true
```

주의:

```js
document.querySelectorAll('[aria-label="광고"]').length
```

이 값은 쿠팡 때문에 0이 아닐 수 있다. AdSense 판정에서 제외한다.

### 창업자가 지금 하던 일

창업자는 Safari Web Inspector를 열려고 했다. 혼란 포인트는 Mac Safari와 iPhone 시뮬레이터 안의 Safari가 다르다는 점이었다.

정확한 안내:

1. iPhone 시뮬레이터 안에서는 Safari가 아니라 앱 아이콘 `우리 나이가 어때서`를 실행한다.
2. Mac Dock에서 파란 나침반 Safari 아이콘을 클릭한다.
3. 상단 메뉴 왼쪽이 `Safari`로 바뀌어야 한다. `Simulator`이면 잘못된 앱이 활성화된 것이다.
4. Mac Safari에서 개발자 메뉴를 켠다.
   - Safari 메뉴 > 설정 또는 Settings.
   - 고급 또는 Advanced.
   - 맨 아래 "메뉴 막대에서 개발자용 메뉴 보기" 체크.
5. 상단 메뉴에 `개발자`가 생기면:
   - 개발자 > Simulator > iPhone 17 Pro > 앱 WebView 선택.
6. 열린 Web Inspector Console에 위 4개 JS를 붙여넣는다.

만약 메뉴에 앱 WebView가 안 보이면:

- 시뮬레이터에서 앱이 foreground인지 확인.
- 시뮬레이터 Safari가 아니라 `우리 나이가 어때서` 앱이 켜져 있는지 확인.
- Xcode에서 다시 Run.
- Mac Safari를 완전히 종료 후 재실행.

### 2-1에서 절대 하지 말 것

- 2-2 OAuth handoff 시작 금지.
- push/deeplink 시작 금지.
- main merge 금지.
- production 배포 금지.
- AdSense 켜기 금지.
- Android TWA 대체 금지.
- Airbridge/결제/AdMob 끼우기 금지.

---

## 5. Capacitor 전환 설계 요약

### AS-IS

현재 서비스는 Next.js 14 App Router 기반 웹이다.

구조:

- Next.js SSR/ISR/API route/server action/auth/middleware 사용.
- NextAuth v5 + 카카오 로그인.
- Android는 TWA/PWA/Web Push 기반.
- iOS 앱은 없음.
- AdSense는 주요 수익원.
- Coupang CPS도 페이지 곳곳에 있음.
- 여성 전용 가입 차단은 auth `signIn` 단계에서 동작.

중요 제약:

- 정적 export가 불가능하다.
- API route, middleware, server action, server auth, dynamic/revalidate, next/image 서버 최적화가 많다.
- 따라서 Capacitor에 정적 번들로 넣는 방식은 현재 현실적이지 않다.

### TO-BE 1차 추천

1차 추천은 아래다.

```txt
Android TWA 유지.
iOS만 Capacitor로 PoC 및 앱화.
```

이유:

- iOS 앱/푸시가 현재 목적이다.
- Android TWA는 이미 사용자가 있고, 깨면 재로그인/푸시 재구독 리스크가 크다.
- iOS는 그린필드라 마이그레이션 리스크가 낮다.
- Capacitor PoC는 iOS 중심으로 검증해도 목적에 맞다.

### server.url 판단

`server.url`은 PoC에서는 현실적이다.

하지만 production iOS 출시 기준으로는 위험이 남는다.

- App Store 4.2/4.7 리젝 가능성.
- "원격 웹만 감싼 앱"으로 보일 수 있음.
- 푸시, 딥링크, 공유, 오프라인 fallback 같은 네이티브 가치가 필요하다.

따라서:

- Phase 2-1에서는 server.url PoC 허용.
- production 출시 전에는 App Store 심사 리스크를 별도 설계해야 한다.
- PoC 통과가 App Store 통과 보장은 아니다.

### OAuth/세션

중요한 결론:

```txt
시스템 브라우저 카카오 로그인만으로는 WebView 세션이 생기지 않는다.
```

이유:

- NextAuth 세션은 `age-doesnt-matter.com` httpOnly 쿠키.
- 시스템 브라우저 쿠키함과 Capacitor WebView 쿠키함은 분리된다.
- 딥링크로 돌아와도 WebView는 로그아웃 상태일 수 있다.

추천:

- Phase 2-2에서 `one-time handoff token` 방식.
- 외부 카카오 OAuth는 기존 signIn 로직을 타게 한다.
- 성공 후 단기 토큰을 딥링크로 앱에 전달.
- WebView가 토큰을 서버에 교환해 WebView용 세션 쿠키를 발급받는다.

이때 유지되어야 하는 것:

- 신규 여성 가입 정상.
- 신규 남성 차단 유지.
- 기존 회원 로그인 정상.
- 온보딩 callbackUrl 유지.
- 토큰은 1회성, 60~120초 만료, replay 방지.

### 광고

정정된 판단:

- AdSense가 WebView에서 무조건 불가능한 것은 아니다.
- Google WebView API for Ads가 있다.
- 하지만 PoC에서는 계정 보호를 위해 AdSense OFF가 맞다.

선택지:

1. 앱 광고 OFF: PoC 기본값. 계정 리스크 0.
2. WebView API for Ads: 출시 전 검토. 기존 웹 AdSense 유지 가능성이 있으나 네이티브 SDK 등록 필요.
3. AdMob 전환: 작업 큼, 최후 옵션.

Coupang CPS:

- AdSense와 별개다.
- 현재 앱 WebView에서 보인다.
- 2-1 종결을 막지는 않지만, iOS 앱 출시 전 별도 정책 검토가 필요하다.

검토할 것:

- 쿠팡 파트너스 약관상 앱/WebView 노출 허용 여부.
- App Store에서 외부 제휴 배너/구매 이동이 문제가 되는지.
- UX상 광고 혼동 여부.

### Push

현재는 Web Push/VAPID 기반이다. Capacitor iOS는 FCM/APNs 토큰 모델이 필요하다.

원칙:

- Web Push 삭제 금지.
- FCM/APNs 병행.
- multi-device, logout, unsubscribe, token refresh 설계 필요.

2-1에서는 push 제외. 2-2 또는 후속 단계에서 설계.

### Airbridge

Airbridge는 PoC 제외.

다만 유료 앱 설치 캠페인 또는 정확한 install/sign_up attribution이 필요해지는 시점 전에는 붙여야 한다.

늦게 붙이면 잃는 데이터:

- 설치 경로.
- deferred deep link.
- 첫 실행 attribution.
- paid acquisition별 가입 전환.

현재 판단:

- Phase 2-1/2-2에는 넣지 않는다.
- 출시 전 또는 유료 마케팅 전 설계한다.

### 미래 상품/결제

1년 뒤 상품 판매 가능성은 현재 Capacitor 1차 범위에 넣지 않는다.

다만 정책 분류만 기억:

- 실물 상품/오프라인 서비스: 일반 PG/외부 결제 가능성이 높지만 앱스토어 정책 확인 필요.
- 디지털 콘텐츠/구독/앱 내 기능: 인앱결제 필요 가능성이 높다.
- 지금 결제 SDK, PG, IAP, 상품 DB 설계는 하지 않는다.

---

## 6. 최근 완료/종결된 주요 작업

아래는 긴 대화 중 종결 또는 거의 종결된 작업이다. 다음 세션에서 같은 것을 다시 파지 않도록 기록한다.

### 속도 개선 1차

완료:

- `SessionProvider` 제거 기반 마련.
- 자체 `AppSessionProvider/useAppSession`.
- 클라이언트 `next-auth/react/useSession` 제거.
- `scripts/perf-measure.ts` 추가.
- 홈 TBT 대폭 개선.

주의:

- gtag.js lazyOnload는 보류.
- AdSense 축소/삭제 금지.
- 댓글 캐시 변경 보류.

### 팝업 sanitize-html 서버 이전

완료:

- 공개 번들에서 sanitize-html 제거.
- 서버에서 sanitize.
- 활성 팝업 0개라 런타임 팝업 QA는 N/A.

### AdSense 성능 개선

완료:

- head preload/direct script 제거.
- hydration 후 loader 방식.
- hero sizes 보정.
- hero vs adsbygoogle 초기 대역폭 경쟁 제거.

중요:

- AdSense는 수익원이다. 슬롯 삭제/축소 금지.
- 수익 영향은 AdSense 대시보드로 확인해야 한다.

### OS 글자 확대 대응

완료:

- Phase A: 홈/로그인/온보딩 핵심 경로.
- Phase B P1: 가입/설치/검색/목록 CTA.
- 창업자 육안 확인 문제 없음.

백로그:

- Phase B-2: my/contact/landing/FAB.
- Phase C: admin.

### Pull-to-refresh

완료:

- 커스텀 pull-to-refresh 구현.
- 커밋 `8b40aac`.
- CI/Gate 2 통과.

남은 것:

- 실기기 최종 확인이 필요할 수 있다.
- TWA, Android Chrome, iOS Safari/PWA.

### `/login` 슬라이드 UI

완료:

- `/login`을 GateOnboardingSlides 기반 UI로 통일.
- 뒤로가기 유지.
- 둘러보기 유지.
- C 게이트 실험 영향 없음.

### 최근 로그인 배지

완료:

- `localStorage.unao_last_login='kakao'` 마커.
- `/login` 카카오 CTA에 "최근 로그인" 배지.
- C 게이트에는 배지 안 뜨도록 분리.

### 여성 전용 남성 신규 가입 차단

완료:

- 신규 가입 시 카카오 gender `male`이면 User 생성 전 차단.
- 기존 회원, 여성, 성별 미상은 통과.
- FemaleOnly 안내 페이지 배포.
- 창업자 실기기 스크린샷에서 여성 전용 안내 표시 확인됨.

남은 주의:

- 기존 남성 회원 소급 처리는 별도 정책 결정.
- 카카오 성별 오류 여성은 문의 경로로 구제.

### TWA 첫 진입 가입 게이트 실험 종료

완료:

- 게이트 실행 코드 제거.
- `TwaEntryGate` 제거.
- `twa_gate_*` 실행 잔재 제거.
- `/login` 슬라이드는 보존.
- Vercel `NEXT_PUBLIC_TWA_GATE_ENABLED` env 삭제를 창업자가 완료했다고 보고.
- 종결 처리 완료.

### 실험 1: `exp1_related_flow`

완료/라이브:

- 글상세 본문 직후 "다음에 읽기 좋은 이야기" B카드 실험.
- 시작 시각: 2026-06-16 17:30 KST.
- 5:5 배정.
- A는 기존.
- B는 inline 카드 노출.
- 노출 이벤트 `exp1_exposure`.
- 어드민 리텐션 패널.
- D1~D7 확장.

중요:

- 이 실험은 가입 전환 실험이 아니다.
- 판단 지표: 3화면, D1~D7, 세션PV, inline 클릭.
- AdSense RPM은 variant별 분리 불가. 전체 수익 가드레일.

데이터 대기:

- D1: 2026-06-18부터 보기 시작.
- D7: 2026-06-24 이후 흐름 확인.

### 스크래퍼봇 P1~P4

완료:

- 이미지/사진 못 본다는 자백 차단.
- 임신/출산/육아 등 젊은층 글 차단.
- 질문글 후기/덤벨 환각 감소.
- 사진 키워드 취미 오분류 수정.

주의:

- P1 커밋에 다른 세션 pre-staged 파일 3개가 섞였다고 Claude가 보고했다.
- force-push로 되돌리지 않았다.
- 이후 반드시 경로 명시 커밋.

---

## 7. 남은 업무 최신 정리

### 7.1 배포 완료, 적용 확인만 남음

| 항목 | 상태 | 다음 액션 | PASS 기준 |
|---|---|---|---|
| iOS Capacitor Phase 2-1 | PoC 브랜치 런타임 검증 중 | Safari Web Inspector로 앱 WebView DOM 확인 | 렌더 PASS + AdSense 마커 0 + `isNativePlatform() === true` |
| 실험 1 D1 데이터 | 라이브, 날짜 대기 | 2026-06-18 이후 어드민 확인 | D1 분모/반환값 생성, 오늘/미래 코호트 제외 |
| 실험 1 D7 데이터 | 라이브, 날짜 대기 | 2026-06-24 이후 확인 | D1~D7 흐름 확인 |
| AdSense 수익 영향 | 운영 데이터 대기 | AdSense 대시보드 확인 | impressions/RPM/fill/viewability 큰 하락 없음 |
| Pull-to-refresh | 배포 완료, 실기기 확인 필요 가능 | TWA/Android Chrome/iOS Safari에서 당겨보기 | 최상단 당김 새로고침, 에디터/모달 미발동 |
| 앱 설치 안내 분리 | 실기기 확인 대기 가능 | Android/iOS/TWA 각각 확인 | Android Play, iOS 홈화면 추가, TWA CTA 숨김 |
| 팝업 런타임 노출 | 현재 N/A | 활성 팝업 생기면 prod QA | 노출/닫기/오늘하루안보기/클릭 정상 |

### 7.2 지금 바로 할 수 있음

| 항목 | 상태 | 다음 액션 | PASS 기준 |
|---|---|---|---|
| iOS Capacitor 2-1 DOM 검증 | 바로 가능 | Mac Safari 개발자 메뉴에서 앱 WebView 콘솔 검사 | AdSense 3종 0, Capacitor true |
| Dirty 파일 범위 재확인 | 바로 가능 | `git status --short`, 변경 파일별 소유자 분리 | 다음 커밋에 unrelated 미포함 |
| 쿠팡 CPS 앱 노출 정책 진단 | read-only 가능 | 쿠팡 파트너스 약관/App Store 정책 확인 | 앱 WebView 노출 허용/주의점 정리 |
| 실험 1 D1 어드민 확인 | 날짜상 가능 | `/admin/ab-tests` 확인 | D1 분모가 성숙 코호트만 잡히는지 확인 |
| Capacitor 2-2 handoff 설계 | 2-1 PASS 후 가능 | read-only 상세 설계 | 신규 여성/남성차단/기존로그인/온보딩 callbackUrl 보존 설계 |

### 7.3 백로그: 고객 임팩트/리텐션 기준

| 우선순위 | 항목 | 이유 | 트리거 |
|---:|---|---|---|
| 1 | 실험 1 데이터 판독 및 위너 판단 | 글상세 다음 탐색이 리텐션 핵심 | D1~D7 데이터 누적 |
| 2 | 실험 2: 첫날 1차 목표/가입·설치 동선 | 가입 압박 타이밍 최적화 | 실험 1 초기 결과 이후 |
| 3 | iOS Capacitor Phase 2-2 OAuth handoff | iOS 앱의 로그인 핵심 | 2-1 런타임 PASS |
| 4 | iOS native push 설계 | iOS 앱 목적 중 하나 | handoff 이후 |
| 5 | F17 네이버 유입자 락인 효과 | 검색 유입 리텐션 | 2026-06-26 이후 데이터 |
| 6 | 앱 설치 안내 UX 후속 | 앱 전환 리텐션 | 실기기 QA 결과 |
| 7 | OS 글자 확대 Phase B-2 | 접근성/주 타겟 UX | my/contact/landing 깨짐 발견 |
| 8 | Admin Phase C | 운영자 편의 | 운영자 불편 발생 |

### 7.4 제외/무시

| 항목 | 판정 | 이유 |
|---|---|---|
| AdSense 슬롯 삭제/축소 | 제외 | 수익원 훼손 금지 |
| AdSense 전역 lazyOnload | 제외 | 수익/노출 지연 리스크 |
| AdSense Partytown | 제외 | 비호환/신규 의존성 리스크 |
| iOS PoC 중 production 도메인 직접 로드 | 제외 | GA4/EventLog 오염, PoC 코드 미반영 |
| iOS 2-1 PASS 전 2-2 시작 | 제외 | 원인 분리 실패 |
| Android TWA 즉시 대체 | 제외 | 기존 유저 재로그인/푸시 재구독 리스크 |
| Airbridge PoC 포함 | 제외 | attribution은 중요하지만 PoC 범위 과대 |
| 결제/상품 설계 | 제외 | 1년 뒤 가능성, 현재 앱 PoC와 무관 |
| 현재 untracked/dirty 파일 삭제 | 제외 | 다른 세션 작업 가능성 |

---

## 8. Claude Code 프롬프트 템플릿

### read-only 진단용

```txt
read-only로 아래 범위를 진단해라. 코드 수정, 파일 생성/삭제, DB write, 어드민 조작, env 변경, staging/commit 금지.

목적:
- [무엇을 판단하려는지]

현재 상태:
- 브랜치:
- 관련 커밋:
- 이미 확인된 사실:

확인할 파일/영역:
1.
2.
3.

금지:
- [건드리면 안 되는 파일/기능]
- git add/commit 금지
- 다른 세션 dirty 파일 정리 금지

산출물:
1. AS-IS
2. 리스크
3. 선택지
4. 추천안
5. PASS 기준
6. 창업자 액션

Claude Code 보고는 추측하지 말고 파일/라인/명령 결과 근거로 써라.
```

### 구현 요청용

```txt
PLEASE IMPLEMENT THIS PLAN:

목적:
- [목표]

수정 허용 파일:
- path1
- path2

절대 금지:
- path/feature
- DB write
- env 변경
- 어드민 조작
- git add .
- unrelated 파일 커밋

구현:
1.
2.

검증:
- npm run typecheck
- npm run lint
- npm run build
- 필요한 e2e/수동 확인

PASS 기준:
- [구체적 상태]

커밋:
- 허용 파일만 경로 명시로 stage/commit.
- 커밋 전 git diff --stat 및 git status 보고.
- unrelated dirty 파일은 그대로 보존.
```

### 현재 iOS Capacitor 2-1 이어가기용

```txt
iOS Capacitor Phase 2-1 런타임 검증을 이어서 도와라.
코드 수정 금지, main merge 금지, push 금지, production 배포 금지.

현재 목표:
- 앱 WebView에서 렌더 정상.
- AdSense 마커 0.
- window.Capacitor.isNativePlatform() true.

창업자가 Safari Web Inspector를 못 찾고 있으니, Mac Safari와 시뮬레이터 Safari를 구분해서 정확히 안내해라.

AdSense 판정 기준:
document.querySelectorAll('script[src*="adsbygoogle"]').length === 0
document.querySelectorAll('ins.adsbygoogle').length === 0
document.querySelectorAll('[data-ad-client]').length === 0
window.Capacitor?.isNativePlatform?.() === true

aria-label="광고"는 쿠팡도 쓰므로 AdSense 판정에서 제외한다.
```

---

## 9. 자주 헷갈린 지점

### Mac Safari vs 시뮬레이터 Safari

시뮬레이터 화면 안에 보이는 Safari는 iPhone 안의 Safari다.  
Web Inspector 설정은 Mac의 Safari 앱에서 해야 한다.

Dock의 파란 나침반 Safari 아이콘을 클릭하면 상단 메뉴 왼쪽이 `Safari`로 바뀐다.  
그 상태에서 `Safari > 설정 > 고급`으로 들어간다.

### 앱 WebView vs Safari

검증 대상은 시뮬레이터 Safari가 아니라 `우리 나이가 어때서` 앱 WebView다.

Safari Web Inspector 메뉴에서 선택해야 하는 것은:

```txt
개발자 > Simulator > iPhone 17 Pro > 앱 WebView
```

### 쿠팡 vs AdSense

쿠팡 배너:

- `aria-label="광고"` 가능.
- 이미지에 `coupang` 가능.
- 2-1에서 꺼야 한다고 확정된 것은 아님.

AdSense:

- `adsbygoogle`.
- `ins.adsbygoogle`.
- `data-ad-client`.
- `ca-pub`.

2-1의 핵심은 AdSense OFF다. 쿠팡 노출은 별도 정책 검토 대상이다.

### production URL 직접 로드 금지

PoC branch 코드가 production에 없으면 앱이 production을 로드해도 PoC 검증이 안 된다.  
또한 GA4/EventLog 오염 가능성이 있다.

따라서 PoC 검증은 Vercel Preview 또는 안전한 터널을 사용한다.

---

## 10. 다음 세션의 추천 운영 흐름

1. 이 문서 읽기.
2. `git status --short` 확인.
3. 현재 사용자가 무엇을 하던 중인지 확인.
4. iOS 2-1 검증이면 코드 수정하지 말고 Safari Web Inspector 안내부터 한다.
5. 앱 DOM 검사 결과를 받아 판정한다.
6. PASS면:
   - 2-1 런타임 PASS로 기록.
   - main merge는 아직 별도 결정.
   - 다음 단계는 2-2 OAuth handoff read-only 설계.
7. FAIL이면:
   - 렌더 실패인지, AdSense 마커 잔존인지, Capacitor 감지 실패인지 분리.
   - 바로 수정하지 말고 원인 후보와 필요한 최소 변경 범위를 먼저 제시.

---

## 11. 현재 가장 중요한 한 줄

지금은 iOS Capacitor 2-1에서 "웹이 앱 WebView에서 잘 뜨는가"와 "AdSense가 앱에서 꺼지는가"를 확인하는 단계다.  
아직 main에 합치거나, 로그인 handoff, push, deeplink, Android 전환을 시작할 단계가 아니다.

