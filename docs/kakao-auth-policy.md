# 카카오 로그인 정책 문서

> 최초 작성: 2026-05-18  
> 이 문서는 **카카오 인증 관련 코드를 수정하기 전 반드시 읽어야 하는** 단일 진실의 원천입니다.  
> 위반 시 전체 로그인 불가 사태가 발생합니다. (실제 발생 이력: 2026-03-20, 2026-05-18)

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [카카오 콘솔 확정 설정](#2-카카오-콘솔-확정-설정)
3. [Vercel 환경변수 확정값](#3-vercel-환경변수-확정값)
4. [DB 스키마 — 인증 관련 필드](#4-db-스키마--인증-관련-필드)
5. [로그인/가입 플로우](#5-로그인가입-플로우)
6. [온보딩 플로우](#6-온보딩-플로우)
7. [미들웨어 로직](#7-미들웨어-로직)
8. [핵심 코드 설명](#8-핵심-코드-설명)
9. [알려진 문제와 해결책](#9-알려진-문제와-해결책)
10. [절대 금지사항](#10-절대-금지사항)
11. [변경 전 체크리스트](#11-변경-전-체크리스트)
12. [변경 후 검증 절차](#12-변경-후-검증-절차)

---

## 1. 아키텍처 개요

### 파일 구조 (2개 파일로 분리 — 절대 합치지 말 것)

```
src/lib/auth.config.ts   ← Edge Runtime용 경량 설정 (Prisma 없음)
src/lib/auth.ts          ← Node.js 전용 전체 설정 (Prisma DB 접근)
src/middleware.ts        ← Edge Runtime, auth() 호출 안 함
```

| 파일 | 실행 환경 | Prisma | 역할 |
|------|----------|--------|------|
| `auth.config.ts` | Edge Runtime (Vercel Edge) | ❌ 사용 불가 | Kakao provider 설정, 세션/쿠키 설정, authorized 콜백 |
| `auth.ts` | Node.js (Vercel Serverless) | ✅ 사용 | DB 조회/생성, JWT 토큰 생성, signIn 콜백 |
| `middleware.ts` | Edge Runtime | ❌ | JWT 쿠키 직접 복호화 (`getToken()`), 온보딩 리다이렉트 |

### 왜 두 파일로 나뉘는가

미들웨어는 Edge Runtime에서 실행되는데, Prisma는 Edge Runtime에서 동작하지 않는다. NextAuth v5는 이를 해결하기 위해 `authConfig`(Edge OK)와 전체 `auth`(Node only)를 분리하는 패턴을 권장한다. `middleware.ts`는 `auth.config.ts`의 설정을 직접 사용하지 않고, `getToken()`으로 JWT 쿠키만 복호화한다.

---

## 2. 카카오 콘솔 확정 설정

> ⚠️ 이 정보는 2026-05-18 실제 검증된 값입니다.

### 앱 정보

| 항목 | 값 |
|------|----|
| 앱 이름 | 우리 나이가 어때서 |
| 앱 ID (내부) | 1409330 |
| 콘솔 URL | https://developers.kakao.com/app/1409330 |

### REST API 키 — 반드시 이 키 사용

```
앱 내 플랫폼 키 탭에 2개 존재:

[1] Default REST API Key
    키: 3a0c2b623c95e823970b95ff61c97625
    ⚠️ 절대 사용 금지 — 이 키의 client_secret은 우리 것과 다름

[2] 우리 나이가 어때서  ← ✅ 실제 사용하는 키
    키: 4ec06c8a15dbb67bd92701f51c38ec2e
    client_secret: REDACTED_재발급완료_2026-06-07_env전용 (활성화 ON)
```

> **핵심 규칙**: `KAKAO_CLIENT_ID`와 `KAKAO_CLIENT_SECRET`은 반드시 **같은 플랫폼 키 박스**에 속해야 한다. 다른 키의 시크릿을 혼용하면 KOE010 발생 (2026-05-18 실제 사고 원인).

### 카카오 로그인 설정

| 항목 | 설정값 |
|------|--------|
| Redirect URI (개발) | `http://localhost:3000/api/auth/callback/kakao` |
| Redirect URI (프로덕션) | `https://age-doesnt-matter.com/api/auth/callback/kakao` |
| Redirect URI (www) | `https://www.age-doesnt-matter.com/api/auth/callback/kakao` |
| PKCE 지원 | ❌ 미지원 → `checks: ['state']` 강제 |

### 동의항목 (현재 활성 상태)

| 항목 | 동의 유형 | 비고 |
|------|----------|------|
| 닉네임 | 필수 | |
| 프로필 사진 | 선택 | |
| 카카오계정(이메일) | 필수 | |
| 성별 | 권한 없음 | 현재 미활성 (DB 필드는 있음) |
| 생일(출생연도) | 권한 없음 | 현재 미활성 (DB 필드는 있음) |
| 전화번호 | 권한 없음 | 비즈앱 심사 필요, Phase 1 예정 |

---

## 3. Vercel 환경변수 확정값

> ⚠️ 프로덕션 전용 환경변수입니다. `.env.local` 값과 다를 수 있습니다.

| 변수명 | 값 | 적용 환경 |
|--------|----|----------|
| `KAKAO_CLIENT_ID` | `4ec06c8a15dbb67bd92701f51c38ec2e` | Production Only |
| `KAKAO_CLIENT_SECRET` | `REDACTED_재발급완료_2026-06-07_env전용` | Production Only |
| `AUTH_SECRET` | (랜덤 문자열) | All Environments |
| `AUTH_URL` | **설정하지 말 것** | — |

### 환경변수 확인 방법 (변경 전 필수)

```bash
# 프로덕션 실제값 로컬로 가져오기
vercel env pull --environment=production

# 가져온 .env.production.local에서 확인
cat .env.production.local | grep KAKAO
```

> `AUTH_URL`이 설정되어 있으면 쿠키 domain 불일치로 `InvalidCheck: state value could not be parsed` 발생. **절대 설정하지 말 것.**

---

## 4. DB 스키마 — 인증 관련 필드

파일: `prisma/schema.prisma` — User 모델

```prisma
model User {
  id           String     @id @default(cuid())
  providerId   String     @unique   // 카카오 숫자 User ID (문자열로 저장)
  nickname     String     @unique   // 임시: "user_{providerId 끝 8자리}", 온보딩 완료 시 교체
  profileImage String?              // 카카오 프로필 사진 URL
  email        String?              // 카카오 선택 동의 이메일
  birthYear    Int?                 // 카카오 선택 동의 생일(년도)
  gender       String?              // 카카오 선택 동의 성별
  phone        String?   @unique   // 카카오 선택 동의 전화번호, 정규화: "01012345678"

  role         Role      @default(USER)
  grade        Grade     @default(SPROUT)
  fontSize     FontSize  @default(NORMAL)

  status         UserStatus @default(ACTIVE)
  suspendedUntil DateTime?            // SUSPENDED 상태일 때 정지 해제 시각
  withdrawnAt    DateTime?            // WITHDRAWN 상태일 때 탈퇴 요청 시각
  isOnboarded    Boolean   @default(false)  // DB 저장용 (런타임은 nickname 패턴으로 판단)

  lastLoginAt    DateTime  @default(now())
  nicknameChangedAt DateTime?
  createdAt      DateTime  @default(now())
}
```

### `needsOnboarding` 판단 로직

> **DB `isOnboarded` 필드가 아닌 `nickname` 패턴으로 판단한다.**

```typescript
// auth.ts, middleware.ts 모두 동일한 패턴 사용
token.needsOnboarding = user.nickname.startsWith('user_')
```

이유: 온보딩 완료 시 닉네임이 `user_XXXXXXXX` → 실제 닉네임으로 바뀌므로, DB 추가 조회 없이 토큰만으로 판단 가능.

---

## 5. 로그인/가입 플로우

### 전체 플로우 다이어그램

```
사용자 → /login 페이지
       → "카카오로 로그인" 버튼 클릭
       → /api/auth/signin/kakao (NextAuth 시작)
       → 카카오 인증 서버 (kauth.kakao.com/oauth/authorize)
       → 사용자 동의 화면 (닉네임, 프로필, 이메일, 성별, 생일, 전화번호)
       → 카카오 콜백 → /api/auth/callback/kakao
       → NextAuth: oauth4webapi → token 교환 (kauth.kakao.com/oauth/token)
                                                    ↑ conform 함수 실행
       → NextAuth: signIn 콜백 (auth.ts)
                 → 기존 유저? 상태 확인 (BANNED/SUSPENDED/WITHDRAWN)
                 → WITHDRAWN: 복구 후 통과
                 → BANNED: false 반환 → /auth/error
                 → SUSPENDED 기간 중: false 반환 → /auth/error
       → NextAuth: jwt 콜백 (auth.ts)
                 → 신규 유저: DB create, nickname="user_{last8}", needsOnboarding=true
                 → 기존 유저: lastLoginAt 업데이트, needsOnboarding=nickname.startsWith('user_')
       → JWT 쿠키 발급 (authjs.session-token / __Secure-authjs.session-token)
       → middleware.ts: needsOnboarding=true → /onboarding 리다이렉트
       → middleware.ts: needsOnboarding=false → 원래 경로 or /
```

### Token 교환 시 핵심 처리 (conform 함수)

카카오 서버가 `Content-Type: application/json;charset=UTF-8`을 반환하는데, oauth4webapi v3는 `application/json`만 허용한다. 또한 카카오는 `WWW-Authenticate` 헤더를 보내는데 이것도 제거해야 한다.

```typescript
// auth.config.ts의 conform 함수가 하는 일:
// 1. Content-Type charset 정규화: "application/json;charset=UTF-8" → "application/json"
// 2. WWW-Authenticate 헤더 제거
// 이 함수 없이는 oauth4webapi가 카카오 응답을 파싱 실패
```

---

## 6. 온보딩 플로우

```
신규 유저 첫 로그인
  → JWT에 needsOnboarding=true
  → middleware: 모든 요청을 /onboarding으로 리다이렉트
  → /onboarding 페이지: 닉네임, 나이, 지역 설정
  → 완료 시: unstable_update() 호출 → JWT의 needsOnboarding=false, nickname 갱신
  → token.tokenRefreshedAt = 0 강제 → 다음 요청에 DB 재조회
  → 이후 원래 경로 or / 로 이동
```

### 온보딩 완료 감지 (middleware)

```typescript
// middleware.ts
const token = await getToken({
  req: request,
  secret: process.env.AUTH_SECRET,
  cookieName: request.cookies.has('__Secure-authjs.session-token')
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token',
})

if (token?.needsOnboarding && pathname !== '/onboarding') {
  return redirect('/onboarding')
}
```

---

## 7. 미들웨어 로직

파일: `src/middleware.ts`

### 처리 순서

1. **레거시 경로 301** (아임웹 URL → 현재 URL)
2. **어드민 라우트** (`/admin/*`) — 별도 admin-token 쿠키 검증
3. **Magazine/Community CUID → slug 리다이렉트** (Supabase REST API 조회)
4. **보호된 경로** (`/my`, `/community/write`) — 세션 쿠키 존재 여부만 확인
5. **온보딩 리다이렉트** — JWT 복호화 후 `needsOnboarding` 확인
6. **익명 세션 쿠키** (`_anon_sid`) 발급

### 중요: 미들웨어에서 `auth()` 함수를 사용하지 않는다

`authConfig.callbacks.authorized`는 사용하지 않는다. Edge Runtime에서 Prisma 없이 JWT만으로 처리해야 하므로 `getToken()`을 직접 사용한다.

### 세션 쿠키 이름

| 환경 | 쿠키 이름 |
|------|----------|
| 개발 (http) | `authjs.session-token` |
| 프로덕션 (https) | `__Secure-authjs.session-token` |

---

## 8. 핵심 코드 설명

### auth.config.ts — Kakao Provider 설정 핵심

```typescript
Kakao({
  clientId: process.env.KAKAO_CLIENT_ID ?? '',
  clientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
  checks: ['state'],   // ← 카카오 PKCE 미지원, 반드시 state만 사용
  token: {
    url: 'https://kauth.kakao.com/oauth/token',  // ← 명시 필수 (없으면 authjs.dev fallback)
    conform: async (response: Response) => { ... },  // ← Content-Type + WWW-Auth 처리
  },
})
```

### JWT 콜백 — 토큰 갱신 최적화

매 HTTP 요청마다 DB 조회하면 성능 문제가 생긴다. 30분 이내 갱신된 토큰은 DB 재조회를 건너뛴다.

```typescript
const TOKEN_REFRESH_WINDOW_MS = 30 * 60 * 1000  // 30분

// 기존 세션 요청에서:
const lastRefresh = (token.tokenRefreshedAt as number) ?? 0
if (Date.now() - lastRefresh < TOKEN_REFRESH_WINDOW_MS) {
  return token  // DB 스킵
}
// 30분 경과 시 DB 재조회 → token.tokenRefreshedAt = Date.now()
```

### 유저 상태 처리 (signIn 콜백)

| 상태 | 처리 |
|------|------|
| ACTIVE | 정상 통과 |
| WITHDRAWN | 복구 후 통과 (30일 유예 기간 중 재로그인 = 탈퇴 취소) |
| BANNED | 로그인 거부 → `/auth/error` |
| SUSPENDED (기간 중) | 로그인 거부 → `/auth/error` |
| SUSPENDED (기간 만료) | 자동 ACTIVE 전환 후 통과 |

### 전화번호 정규화 (normalizeKakaoPhone)

```typescript
// 카카오 제공 형식: "+82 10-1234-5678"
// 저장 형식: "01012345678"
function normalizeKakaoPhone(raw: string | undefined): string | null {
  if (!raw) return null
  return raw.replace(/^\+82\s?/, '0').replace(/[^0-9]/g, '') || null
}
```

---

## 9. 알려진 문제와 해결책

### 사고 1: `Configuration` 에러 (2026-03-20)

**증상**: 로그인 시 "Configuration" 에러 페이지  
**원인**: `authorization: { params: { scope: '...' } }` 추가 시 카카오 provider의 string URL이 빈 객체로 대체됨  
**해결**: `authorization` 블록 전체 제거  
**교훈**: 카카오 scope는 `authorization.params`로 추가 불가 (URL 소실)

---

### 사고 2: `InvalidCheck: state value could not be parsed` (2026-03-20)

**증상**: 카카오 인증 후 콜백에서 state 검증 실패  
**원인**: `AUTH_URL=https://www.age-doesnt-matter.com` 설정 → 쿠키 domain이 www와 비-www 간 불일치  
**해결**: `vercel env rm AUTH_URL production --yes`  
**교훈**: `AUTH_URL` 절대 설정 금지

---

### 사고 3: `KOE010 invalid_client Bad client credentials` (2026-05-18, 하루 종일)

**증상**: 카카오 token 교환 단계에서 KOE010 에러 → 전체 로그인 불가  
**원인**: Vercel Production의 `KAKAO_CLIENT_ID`가 Default REST API Key(`3a0c2b...`)였는데, `KAKAO_CLIENT_SECRET`은 우리 나이가 어때서 플랫폼 키(`4ec06c8a...`)의 시크릿 → ID와 Secret이 서로 다른 키에 속함  
**해결**:
```bash
vercel env rm KAKAO_CLIENT_ID production --yes
printf "4ec06c8a15dbb67bd92701f51c38ec2e" | vercel env add KAKAO_CLIENT_ID production
vercel --prod --force
```
**교훈**:
- 카카오 authorize 엔드포인트는 client_id를 검증하지 않는다 (가짜 ID도 동의 화면 표시됨)
- token 엔드포인트에서만 ID+Secret 쌍 검증 → curl로 직접 테스트해야 정확
- `vercel env pull --environment=production`으로 실제 프로덕션 값을 먼저 확인해야 한다
- 카카오 콘솔 스크린샷만 보고 "맞겠지"라고 가정하면 안 된다

#### KOE010 발생 시 즉시 체크리스트

```bash
# 1. 프로덕션 실제 환경변수 확인
vercel env pull --environment=production
cat .env.production.local | grep KAKAO

# 2. 해당 KAKAO_CLIENT_ID가 카카오 콘솔 어느 키 박스에 속하는지 확인
#    카카오 콘솔 > 앱 1409330 > 플랫폼 키 탭

# 3. KAKAO_CLIENT_SECRET이 그 키 박스의 시크릿인지 확인
#    같은 키 박스 > 보안 탭 > client_secret 값 비교

# 4. curl로 직접 token 교환 테스트
curl -X POST https://kauth.kakao.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&redirect_uri=https://age-doesnt-matter.com/api/auth/callback/kakao&code=TEMP_CODE"
# KOE010 → ID/Secret 불일치
# KOE320 → code 만료 (정상, ID/Secret은 맞음)
```

---

### 비호환성 이슈: oauth4webapi v3 + 카카오

| 문제 | 원인 | 해결 |
|------|------|------|
| Content-Type 거부 | 카카오가 `application/json;charset=UTF-8` 반환 | `conform` 함수로 charset 제거 |
| WWW-Authenticate 헤더 | 카카오가 불필요한 헤더 추가 | `conform` 함수로 헤더 삭제 |
| token URL fallback | token을 객체로 설정 시 url 소실 | `token.url` 명시 필수 |

---

## 10. 절대 금지사항

> 아래 항목을 수정하면 **전체 로그인 불가** 사태가 발생합니다.

### 코드 수준

| 금지 | 이유 |
|------|------|
| `checks: ['pkce']` 또는 `checks: []` | 카카오 PKCE 미지원, state 필수 |
| `authorization: { params: { scope: '...' } }` 추가 | Kakao authorization URL 소실 → Configuration 에러 |
| `conform` 함수 제거 | oauth4webapi v3 파싱 실패 |
| `token.url` 제거 | authjs.dev로 fallback → token 교환 실패 |
| `auth.config.ts`에 Prisma 임포트 | Edge Runtime에서 Prisma 불가 → 미들웨어 크래시 |

### 환경변수 수준

| 금지 | 이유 |
|------|------|
| `AUTH_URL` 설정 | cookie domain 불일치 → InvalidCheck |
| `NEXTAUTH_SECRET` 사용 | NextAuth v5는 `AUTH_SECRET`만 인식 |
| Default REST API Key(`3a0c2b...`) KAKAO_CLIENT_ID 사용 | 시크릿이 다른 키 박스에 속함 → KOE010 |
| ID와 Secret을 다른 플랫폼 키에서 조합 | KOE010 |

### 카카오 콘솔 수준

| 금지 | 이유 |
|------|------|
| Redirect URI 삭제 | 콜백 실패 |
| client_secret 비활성화 | KOE010 |
| 플랫폼 키("우리 나이가 어때서") 삭제 | 전체 로그인 불가 |

---

## 11. 변경 전 체크리스트

### auth.config.ts 또는 auth.ts 수정 시

```
□ vercel env pull --environment=production 실행 → KAKAO_CLIENT_ID 실제값 확인
□ 카카오 콘솔 > 앱 1409330 > 플랫폼 키 탭에서 해당 키 확인
□ ID와 Secret이 같은 키 박스에 속하는지 확인
□ 10. 절대 금지사항 전체 검토
□ checks: ['state'] 유지 확인
□ token.url 유지 확인
□ conform 함수 유지 확인
□ AUTH_URL이 환경변수에 없는지 확인
```

### 카카오 콘솔 설정 변경 시

```
□ 창업자 사전 승인 필수 (CLAUDE.md 규정)
□ Redirect URI 추가/변경은 기존 URI 유지한 채 추가
□ 동의항목 변경 시 앱 심사 필요 여부 확인
□ 플랫폼 키 신규 생성 시 KAKAO_CLIENT_ID 업데이트 필요
```

### Vercel 환경변수 변경 시

```
□ vercel env pull --environment=production으로 현재값 백업
□ 변경 후 vercel --prod --force 재배포 필수
□ /api/health/auth 200 응답 확인 후 완료 선언
```

---

## 12. 변경 후 검증 절차

### 즉시 확인 (배포 직후)

```bash
# 1. 헬스체크 엔드포인트
curl -I https://age-doesnt-matter.com/api/health/auth
# → 200 OK 확인

# 2. 실기기 로그인 테스트 (필수 2가지)
# - Android Chrome (갤럭시 S 시리즈)
# - iOS Safari (iPhone)
# → 카카오 동의 화면 → 로그인 성공 → 홈 도달 확인
```

### 1시간 모니터링

```bash
# BotLog에서 AUTH_FAILURE 발생 여부 확인 (Supabase 대시보드 또는)
SELECT * FROM "BotLog"
WHERE action = 'AUTH_FAILURE'
AND "createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY "createdAt" DESC;
```

### 완료 기준

모두 충족해야 "변경 완료" 선언 가능:
- [ ] `/api/health/auth` 200 응답
- [ ] Android Chrome 실기기 로그인 성공
- [ ] iOS Safari 실기기 로그인 성공
- [ ] 1시간 이내 BotLog AUTH_FAILURE 0건

---

## 부록: 관련 파일 경로

| 용도 | 경로 |
|------|------|
| Edge Runtime 설정 | `src/lib/auth.config.ts` |
| 전체 Auth 설정 (Prisma) | `src/lib/auth.ts` |
| 미들웨어 | `src/middleware.ts` |
| 로그인 페이지 | `src/app/(main)/login/page.tsx` |
| 온보딩 페이지 | `src/app/(main)/onboarding/page.tsx` |
| 에러 페이지 | `src/app/auth/error/page.tsx` |
| DB 스키마 | `prisma/schema.prisma` |
| Auth 모니터 | `src/lib/auth-monitor.ts` |
| 헬스체크 API | `src/app/api/health/auth/route.ts` |
| OAuth 참고 메모리 | `memory/reference_kakao_oauth.md` |
