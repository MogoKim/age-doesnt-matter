# Phase 2-2 — 카카오 OAuth Handoff 설계서

> 상태: **설계 확정 전 보완본 (구현 전 / 코드 미수정)** · 작성 2026-06-18
> 선행: Phase 2-1(iOS Capacitor shell + 앱 광고 OFF) **CLOSED**. 본 문서는 2-2 구현 착수 **승인 게이트용 설계**다.
> 단일 진실: 본 문서. (working 메모: Claude plan `expressive-whistling-whisper.md` 부록 J)

---

## 1. 목표

iOS Capacitor 앱(WebView)에서 카카오 로그인 → **WebView에 세션 쿠키 발급**. 기존 웹/TWA 로그인·남성차단·온보딩·callbackUrl 로직을 그대로 재활용하고, 앱 전용 레이어(시스템 브라우저 + 1회성 handoff token + Credentials provider)만 신규로 얹는다.

기준 5가지: **신규 여성 가입 / 신규 남성 차단 / 기존 회원 로그인 / 온보딩 callbackUrl 보존 / one-time token 만료·replay 방지.**

## 2. 왜 handoff가 필요한가 (실측 근거)

- 세션 = JWT **httpOnly 쿠키**(`authjs.session-token` / `__Secure-authjs.session-token`, `src/lib/auth.config.ts` cookies).
- **시스템 브라우저(SFSafariViewController)와 앱 WebView는 쿠키 저장소가 격리**된다 → 시스템 브라우저에서 OAuth가 성공해도 그 세션 쿠키가 WebView로 넘어오지 않는다.
- 카카오는 임베디드 WebView 직접 OAuth를 차단할 위험이 있어 **시스템 브라우저가 필수**.
- 따라서: 시스템 브라우저에서 인증을 끝낸 뒤, **1회성 토큰으로 WebView에 세션을 재발급**한다.

---

## 3. 전체 흐름

```
[앱 WebView] 로그인 탭 (isCapacitor 분기)
  → @capacitor/browser 로 시스템 브라우저 열기:
       https://<host>/api/app-login/start?cb=<원래목적지>
[/api/app-login/start] (신규)
  → app_login 단기 httpOnly 쿠키 set (앱 플로우 표식, maxAge ~5분)
  → signIn('kakao', { redirectTo: '/app-login/bridge?cb=<cb>' })
  → 카카오 OAuth (기존 NextAuth)
       └ signIn 콜백 [auth.ts:25] 그대로:
           · 신규 male            → return '/auth/error?error=FemaleOnly'   (★ bridge 미도달)
           · BANNED/SUSPENDED     → return false → /auth/error?error=AccessDenied (★ 미도달)
           · 예외                  → return false → /auth/error (★ 미도달)
           · female/기존/성별미상 → return true
       └ jwt 콜백 [auth.ts:77] 그대로: 신규면 user.create + needsOnboarding=true

── 성공 경로 ──────────────────────────────
  → redirectTo=/app-login/bridge (시스템 브라우저에 세션 쿠키 set)
[/app-login/bridge] (신규)
  → auth()로 세션 확인 + app_login 쿠키 소거
       · 세션 있음 → handoff token 발급(nonce DB 저장 + HMAC) →
         딥링크 com.agenotmatter.app://auth?token=<JWT>
       · 세션 없음(방어) → 딥링크 com.agenotmatter.app://auth?error=NoSession
[앱] @capacitor/app appUrlOpen 으로 딥링크 수신
  → token 추출 → WebView에서 signIn('app-handoff', { token, redirect:false })
[Credentials authorize] (auth.ts, 신규 'app-handoff')
  → HMAC 검증 + exp 검증 + nonce 1회 consume + userId 유저/상태 조회 → user 반환
  → WebView에 세션 쿠키 발급 (jwt 콜백 app-handoff 분기 → token.userId)
[앱 WebView] 세션 성립 → needsOnboarding ? /onboarding?callbackUrl=cb : cb 로 이동

── 에러 경로 (★ bridge 미도달) ─────────────  ※ 4장 참조
```

---

## 4. 에러 경로 설계 (★ 핵심 보완 — bridge에 도달하지 않는 케이스)

`signIn` 콜백이 **male 차단/계정 차단/예외**로 끝나면 NextAuth는 `redirectTo`(=bridge)를 **무시하고** `pages.error`(`/auth/error`)로 보낸다(`auth.config.ts:82`). 즉 **이 케이스들은 절대 bridge를 거치지 않는다.** 앱으로 결과를 돌려주려면 별도 수렴점이 필요하다.

### 4-1. 수렴점 = `/auth/error`
`pages.error = '/auth/error'`이므로 아래가 전부 한 곳으로 모인다.

| 케이스 | signIn 반환 | 도착 URL |
|---|---|---|
| 신규 남성 | `'/auth/error?error=FemaleOnly'` | `/auth/error?error=FemaleOnly` |
| 차단(BANNED/SUSPENDED) | `false` | `/auth/error?error=AccessDenied` |
| signIn 예외 | `false` | `/auth/error?error=...` |
| 카카오 동의 취소 / OAuth 오류 | — | `/auth/error?error=OAuthCallback` 등 |

### 4-2. `/auth/error`에서 앱 딥링크로 복귀
`/api/app-login/start`가 심어둔 **`app_login` 쿠키**로 "앱 플로우"를 식별한다.

- `/auth/error`(현 `src/app/auth/error/page.tsx`)에 분기 추가: **`app_login` 쿠키가 있으면** 기존 웹 안내 UI 대신, 작은 클라이언트 조각이
  `window.location.href = 'com.agenotmatter.app://auth?error=<code>'` 로 **딥링크 복귀** + 쿠키 소거.
- 쿠키가 없으면(웹/TWA) **기존 동작 그대로**(FemaleOnly 안내 화면 / 일반 오류 화면) — 회귀 0.
- `<code>`는 도착한 `error` 값을 그대로 전달(FemaleOnly / AccessDenied / OAuthCallback …).

> custom scheme 302 redirect는 일부 브라우저가 막을 수 있어, **클라이언트 `location.href`(또는 meta-refresh)** 방식으로 딥링크를 연다.

### 4-3. 어떤 페이지도 거치지 않는 케이스 = 사용자가 시스템 브라우저를 닫음
딥링크(성공/에러) 없이 사용자가 SFSafariViewController를 직접 닫으면 어떤 서버 페이지도 안 거친다. 이건 앱이 감지한다.

- `@capacitor/browser`의 **`browserFinished` 이벤트**(시스템 브라우저 dismiss) 수신 시, **그 시점까지 `appUrlOpen`(딥링크)을 못 받았으면 "로그인 취소"로 처리.**
- 안전망: start 후 N초(예: 5분) 내 딥링크 미수신 시 타임아웃 처리.

### 4-4. 앱 측 딥링크 라우팅 (수신 후)
`com.agenotmatter.app://auth?...` 수신 → 쿼리 파싱:
- `token` 있음 → `signIn('app-handoff', { token, redirect:false })` → 성공 시 needsOnboarding 분기로 이동.
- `error=FemaleOnly` → 여성 전용 안내(앱 내 화면).
- `error=AccessDenied/NoSession/기타` → 로그인 실패 안내 + 재시도.

---

## 5. one-time token 보안 (만료·replay·위변조·바인딩)

- **형식**: JWS(HMAC-SHA256). payload `{ userId, needsOnboarding, cb, nonce, iat, exp }`.
- **만료**: `exp = iat + 90s` (60~120s 범위). 짧게.
- **replay 1회 소비**: `nonce`(랜덤 32바이트)를 신규 테이블 **AppHandoffToken**에 발급 시 기록 → authorize에서 **원자적 consume**
  (`updateMany where nonce && consumedAt IS NULL → consumedAt=now`, **영향 행 0이면 거부**). 이미 사용/만료면 거부.
- **위변조**: HMAC 서명(전용 `APP_HANDOFF_SECRET` 권장). 검증 실패 시 거부.
- **userId 바인딩**: authorize에서 payload.userId로 유저 조회 + status(BANNED/SUSPENDED/WITHDRAWN) **재확인** — 발급~교환 사이 상태 변경 방어.
- **전송**: HTTPS + 딥링크 custom scheme. 토큰 값은 서버/클라 로그에 **비기록**.
- **오픈리다이렉트 방어**: `cb`는 기존 `safeKakaoCallbackUrl`(내부 경로 `/`로 시작 & `//` 아님만 허용, `src/lib/kakao-start.ts:1`)로 검증.

---

## 6. 변경 범위 (구현 시) — 신규 / 수정 / 외부

### 6-1. 신규 파일
| 경로 | 역할 |
|---|---|
| `src/app/api/app-login/start/route.ts` | `app_login` 쿠키 set + `signIn('kakao', {redirectTo:'/app-login/bridge?cb='})`. **웹 `/api/login/kakao`는 무변경.** |
| `src/app/app-login/bridge/route.ts` (or page) | `auth()` 세션 → handoff token 발급 → 딥링크 redirect. 세션 없으면 error 딥링크. `app_login` 쿠키 소거. |
| `src/lib/app-handoff.ts` | token 생성/검증 + nonce consume 유틸 (서버 전용). |

### 6-2. 수정 파일 (최소)
| 경로 | 변경 | 주의 |
|---|---|---|
| `src/lib/auth.ts` | `providers`에 `Credentials({ id:'app-handoff', authorize })` 추가 + `jwt` 콜백에 `account?.provider==='app-handoff'` 분기(authorize 반환 user.id → 기존 `token.userId` refetch 경로 재활용). | **`auth.config.ts`(Edge)는 절대 미수정** — Credentials/Prisma 섞으면 미들웨어 붕괴. |
| `src/app/auth/error/page.tsx` | `app_login` 쿠키 있으면 딥링크 복귀(4-2). 쿠키 없으면 **기존 UI 그대로**. | 웹/TWA 회귀 0. |
| 로그인 버튼(`KakaoSignupButton` / `src/lib/kakao-start.ts startKakaoLogin`) | `isCapacitor`면 `window.location` 대신 `@capacitor/browser`로 `/api/app-login/start` 열기 분기. | 웹/TWA 경로 무변경. |

### 6-3. DB migration
- `prisma/schema.prisma`에 **AppHandoffToken** 모델 추가:
  ```
  model AppHandoffToken {
    nonce       String    @id
    userId      String
    expiresAt   DateTime
    consumedAt  DateTime?
    createdAt   DateTime  @default(now())
    @@index([expiresAt])
  }
  ```
- `prisma migrate` 필요. **만료/소비 레코드 정리**(cron 또는 expiresAt 인덱스 기반 주기 삭제) 권장.

### 6-4. env
- `APP_HANDOFF_SECRET`(HMAC 전용 시크릿) 신규. 또는 `AUTH_SECRET` 파생 결정. **`.env.local` + Vercel/GHA 동시 반영**(불일치 금지).

### 6-5. iOS scheme (딥링크)
- `ios/App/App/Info.plist`에 `CFBundleURLTypes` / `CFBundleURLSchemes = com.agenotmatter.app` 등록(custom scheme). 또는 Universal Links(apple-app-site-association) 채택 시 도메인 연결 — 정책 결정 필요.
- `@capacitor/browser`, `@capacitor/app` 설치(현재 **미설치**, 2-2에서 추가).

---

## 7. 4대 시나리오 충족

| 시나리오 | 경로 | 결과 |
|---|---|---|
| 신규 여성 가입 | signIn 통과 → user.create(needsOnboarding=true) → token → app-handoff 로그인 → `/onboarding?callbackUrl=cb` | ✅ |
| 신규 남성 차단 | signIn male → `/auth/error?error=FemaleOnly` (bridge 미도달) → app_login 쿠키 → `…://auth?error=FemaleOnly` → 앱 안내. **user 미생성·토큰 0** | ✅ |
| 기존 회원 로그인 | signIn 통과 → needsOnboarding=false → token → 로그인 → `cb` | ✅ |
| 온보딩 callbackUrl 보존 | `cb`(safeKakaoCallbackUrl 검증)를 token payload에 → 로그인 후 needsOnboarding? `/onboarding?callbackUrl=cb` : `cb` | ✅ |

---

## 8. 검증 계획 (구현 후)

- **4 시나리오** 각 PASS(시뮬레이터/실기기).
- **보안**: replay(같은 token 2회 → 2회차 거부) / 만료(>90s 거부) / 위변조(서명 변조 거부) / 발급 후 BANNED → 거부.
- **에러 경로**: 남성 계정 → 앱에 FemaleOnly 안내 도달 / 사용자 브라우저 닫기 → 취소 처리(`browserFinished`).
- **회귀 0**: 웹·TWA 카카오 로그인(`/api/login/kakao`) 그대로 / `/auth/error` 웹 UI 그대로 / Edge 미들웨어 정상(Credentials가 authConfig 미오염).

---

## 9. 외부 선결 (창업자) / 금지

### 9-1. 구현 착수 전 창업자 선결
- `APP_HANDOFF_SECRET` 발급(or AUTH_SECRET 재활용 결정) — `.env.local` + Vercel + GHA.
- `prisma migrate deploy`(AppHandoffToken).
- iOS custom scheme vs Universal Links 정책 결정.
- Apple Developer bundle id `com.agenotmatter.app` 사용 가능 여부(2-1과 동일 미해결).

### 9-2. 금지 (본 문서는 설계만)
- **2-2 구현 착수 금지** — `auth.ts` / `prisma/schema.prisma` / migration은 승인 게이트 영역(autonomy.md 2-B).
- `auth.config.ts` 수정 금지(Edge). main merge·production 배포 금지. 2-3(push)·2-4(딥링크 실구현)은 후속.
