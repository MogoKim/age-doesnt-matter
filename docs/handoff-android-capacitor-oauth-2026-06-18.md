# Android Capacitor OAuth Handoff Handoff

작성일: 2026-06-18 KST  
대상 저장소: `/Users/yanadoo/Documents/New_Claude_agenotmatter`  
현재 브랜치: `poc/ios-capacitor-2-1`  
현재 최우선 목표: Android TWA를 Android Capacitor 앱으로 안전하게 전환하고, 카카오 로그인까지 내부 테스트에서 검증한다.

---

## 0. 새 세션에서 가장 먼저 할 일

새 세션의 Codex는 이 문서를 먼저 읽고, 바로 코드 수정하지 말 것.

1. `git status --short`로 현재 dirty 상태를 확인한다.
2. `capacitor.config.ts`, `android/app/build.gradle`, `src/lib/app-handoff.ts`, `src/lib/auth.ts`를 직접 읽는다.
3. 이 문서와 실제 코드/콘솔/로그가 다르면 실제 상태를 우선한다.
4. 현재 문제는 Kakao Developers 설정 단계가 아니라, 카카오 인증 이후 우리 서버 callback/auth/handoff 단계로 넘어온 상태다.
5. 다음 조사는 read-only로 시작한다. Vercel Preview logs와 Supabase `AppHandoffToken` 상태를 먼저 본다.

---

## 1. Codex 역할 정의

이 저장소에서 Codex는 단순 코드 보조자가 아니다. Codex의 역할은 `우리 나이가 어때서`의 운영 마스터다.

Codex는 CTO, CPO, COO 관점으로 다음을 책임진다.

- 목적/목표를 먼저 확정한다.
- AS-IS를 직접 확인한다.
- Claude Code 또는 사용자의 보고를 그대로 믿지 않고 코드, DB, 로그, 실제 화면, 외부 콘솔 설정을 대조한다.
- 정책, 코드 경로, 데이터, 워크플로우, 사용자 화면을 분리해서 판단한다.
- 창업자의 판단 피로를 줄인다.
- Claude Code에게 단순 지시가 아니라 read-only 범위, 수정 금지, 확인 파일, 산출물 형식을 명확히 준다.
- 한 파일을 두 agent가 동시에 수정하지 않게 관리한다.
- 운영 리스크가 큰 작업은 승인 게이트를 둔다.

이번 Android Capacitor 전환에서 Codex의 핵심 책임:

- Android 배포 경로가 기존 Play 사용자에게 이어지는지 확인한다.
- AdSense OFF, Coupang CPS 분리, 로그인, 온보딩, 남성 차단, callbackUrl 보존을 각각 따로 검증한다.
- Kakao Developers, Vercel env, Supabase schema, NextAuth flow를 하나의 흐름으로 연결해 판단한다.
- 실패 시 “Kakao 문제”라고 뭉뚱그리지 않고 정확히 어느 hop에서 끊기는지 특정한다.

Claude Code의 역할:

- Codex가 정한 범위 안에서 빠르게 코드 조사, 구현, 빌드, 문서화를 수행한다.
- Claude Code의 결론은 증거가 아니다. Codex가 코드/로그/콘솔로 검증해야 한다.
- 현재처럼 실기기 수동 테스트가 필요한 영역에서는 창업자 화면과 로그를 바탕으로 원인을 좁힌다.

창업자의 역할:

- Play Console, Kakao Developers, Vercel, Supabase처럼 외부 콘솔 권한이 필요한 작업을 수행한다.
- 실기기 내부 테스트 앱에서 로그인/렌더/광고/온보딩 시나리오를 실행한다.
- secret 값은 채팅에 붙이지 않는다.

---

## 2. 현재 판정

현재 Android Capacitor 전환은 “앱 설치/렌더/광고OFF”까지는 통과했다.

확인 완료:

- Play 내부 테스트 앱 설치 성공.
- Android 앱 package/update path 유효.
- Samsung SM-N971N 실기기에서 앱 버전 `1.0.5` 설치 확인.
- 홈/베스트/사는이야기/글상세/댓글/footer 렌더 확인.
- Google/Temu류 AdSense 광고는 미노출.
- Coupang CPS는 노출. 이는 Day1 차단 사유가 아니며 별도 정책 트랙이다.
- Kakao Developers의 잘못된 REST key/redirect URI 문제는 지나갔다.

아직 미통과:

- Android 내부 테스트 앱에서 카카오 OAuth handoff 로그인 완료.
- 기존 여성 계정 로그인 후 앱 복귀/세션 유지.
- 신규 여성 온보딩 이동.
- 신규 남성 FemaleOnly 차단 및 user 미생성.
- replay/만료 token 거부.

최신 실패 지점:

- 사용자가 내부 테스트 앱 `1.0.5`에서 카카오 로그인 버튼을 눌렀다.
- `kauth.kakao.com`까지 진입했다.
- Kakao KOE101/KOE006 같은 Kakao 설정 에러는 사라졌다.
- 이후 `projects.vercel.app` callback 화면으로 갔다.
- 최종적으로 우리 앱의 `/auth/error` 화면으로 보이는 페이지가 표시됐다.
- 문구: `로그인 중 문제가 생겼어요 / 카카오 로그인 처리 중 오류가 발생했습니다. 다시 한번 시도해 주세요.`

따라서 현재는 Kakao Developers 설정 화면을 더 만지는 단계가 아니다. 실패는 우리 서버의 NextAuth callback, app-login bridge, credentials exchange, 또는 error redirect 단계에서 찾아야 한다.

---

## 3. 절대 지켜야 할 금지사항

- `git add .` 금지.
- dirty worktree의 타 세션 변경을 되돌리지 말 것.
- `auth.config.ts`에 Prisma/server-only 코드를 넣지 말 것. Edge 보호.
- Kakao Native key, JS key, Android key hash 문제로 바로 몰지 말 것. 현재 흐름은 REST API 기반 시스템 브라우저 OAuth다.
- Kakao Developers 설정을 더 바꾸기 전에 Vercel/Supabase/NextAuth 로그를 먼저 확인할 것.
- production 배포, main merge, Play production release는 아직 금지.
- secret 값을 채팅에 쓰거나 문서에 기록하지 말 것.

---

## 4. 현재 dirty worktree 요약

마지막 확인된 `git status --short` 기준:

Day2/검증 관련으로 보이는 변경:

- `M capacitor.config.ts`
- `M android/app/build.gradle`

현재 `capacitor.config.ts`는 Android 검증용 Preview URL을 보고 있다.

```ts
server: {
  url: 'https://age-doesnt-matter-yfqzk0hao-mogoyongseok-8318s-projects.vercel.app',
  cleartext: false,
},
```

현재 `android/app/build.gradle`:

```gradle
applicationId "com.agenotmatter.app"
versionCode 9
versionName "1.0.5"
```

무관하거나 타 세션 변경으로 보존해야 하는 항목:

- `D assets/logo.png`
- `M src/app/(main)/community/[boardSlug]/[postId]/page.tsx`
- `M src/components/features/community/CommentSection.tsx`
- `M src/components/features/community/GuestCommentInput.tsx`
- `?? agents/scripts/_*.mjs`
- `?? docs/analysis/*`
- `?? mockup/`
- `?? scripts/ga4-*.ts`
- `?? ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`
- 여러 이미지/문서 untracked

새 세션은 반드시 다시 `git status --short`를 찍고, 이 문서 작성 이후 생긴 변경까지 확인해야 한다.

---

## 5. 지금까지 완료된 주요 커밋

### Day1: Android Capacitor shell

커밋:

```text
5d4f561 feat(android): add capacitor shell internal test build
```

핵심:

- `@capacitor/android` 추가.
- `android/` 프로젝트 생성.
- Play package `com.agenotmatter.app` 유지.
- 기존 TWA production versionCode 5보다 높은 내부 테스트 AAB 업로드 성공.
- Play App Signing/update path 실질 검증.
- 실기기 렌더 정상.
- AdSense OFF 확인.
- Coupang CPS는 별도 정책 트랙으로 남김.

### Day2: Android OAuth handoff

커밋:

```text
8e47896 feat(android): add oauth handoff for capacitor login
```

Claude Code 보고 기준 static 검증:

- `npx tsc --noEmit` pass.
- ESLint pass.
- `npm run build` pass.
- `auth.config.ts` 무변경.

구현 파일:

신규:

- `src/lib/app-handoff.ts`
- `src/app/api/app-login/start/route.ts`
- `src/app/app-login/bridge/route.ts`
- `src/app/auth/error/AppAuthErrorRedirect.tsx`
- `src/components/features/auth/AppDeepLinkHandler.tsx`
- `prisma/migrations/20260618120000_add_app_handoff_token/migration.sql`

수정:

- `src/lib/auth.ts`
- `src/app/auth/error/page.tsx`
- `src/lib/kakao-start.ts`
- `prisma/schema.prisma`
- `package.json`
- `package-lock.json`
- `src/app/layout.tsx`
- `android/app/src/main/AndroidManifest.xml`
- Android gradle files

---

## 6. Android OAuth handoff 설계 요약

문제:

- Android Capacitor WebView와 시스템 브라우저의 cookie jar가 분리된다.
- Kakao OAuth를 시스템 브라우저에서 완료해도 WebView에는 NextAuth session cookie가 없다.

해결 구조:

```text
앱 WebView 로그인 버튼
  -> @capacitor/browser 시스템 브라우저
  -> /api/app-login/start?cb=...
  -> NextAuth Kakao OAuth
  -> /api/auth/callback/kakao
  -> /app-login/bridge
  -> auth()로 시스템 브라우저 세션 확인
  -> HMAC one-time handoff token 발급
  -> com.agenotmatter.app://auth?token=...
  -> 앱 AppDeepLinkHandler 수신
  -> signIn('credentials', { token })
  -> WebView session cookie 발급
  -> callbackUrl 또는 onboarding 이동
```

에러 흐름:

```text
Kakao / NextAuth signIn 실패
  -> /auth/error
  -> app_login cookie 감지
  -> com.agenotmatter.app://auth?error=...
  -> 앱에서 에러 안내
```

남성 차단:

- 신규 남성은 기존 Kakao signIn callback에서 `FemaleOnly`로 차단한다.
- user 생성 전 차단해야 한다.
- 이 경우 bridge를 거치지 않는 것이 정상이다.

보안:

- `APP_HANDOFF_SECRET` 기반 HMAC-SHA256.
- token TTL 90초.
- nonce one-time consume.
- consume 시 atomic update.
- exchange 시 user status 재확인.

---

## 7. 핵심 코드 경로

### `src/lib/app-handoff.ts`

핵심 상수/동작:

- `TOKEN_TTL_MS = 90_000`
- `APP_HANDOFF_SECRET` 없으면 throw.
- token payload: `userId`, `needsOnboarding`, `cb`, `nonce`, `exp`
- `issueHandoffToken()`:
  - nonce 생성.
  - `AppHandoffToken` row 생성.
  - `base64url(payload).signature` 반환.
- `verifyAndConsumeHandoffToken()`:
  - token format 검증.
  - HMAC 검증.
  - exp 검증.
  - `updateMany`로 `consumedAt: null`이고 `expiresAt > now`인 nonce만 consume.
  - 성공 시 payload 반환.
  - 실패 시 null.

### `src/lib/auth.ts`

중요:

- full NextAuth 설정 파일이다.
- Prisma, `verifyAndConsumeHandoffToken`, Credentials provider가 여기 들어간다.
- `auth.config.ts`는 Edge 보호 때문에 건드리지 않는다.

Credentials provider:

- id: `app-handoff`
- token verify.
- user exists/status recheck.
- BANNED/SUSPENDED 차단.

Kakao signIn:

- 신규 남성은 user 생성 전 차단.
- 기존 WITHDRAWN 복구.
- BANNED false.
- SUSPENDED는 until 확인.

JWT:

- app-handoff login이면 `token.userId = user.id`, `tokenRefreshedAt = 0`.
- Kakao login이면 user create/update, P2002 race 회복, email collision 처리.

---

## 8. 외부 콘솔 / 환경 상태

### Play Console

앱:

- package: `com.agenotmatter.app`
- 기존 TWA production versionCode: 5
- Android Capacitor internal test:
  - `1.0.3` Day1 설치 확인
  - `1.0.4` Day2 AAB 준비/업로드
  - `1.0.5` 현재 실기기 설치 확인

의미:

- 서명 SHA/update path는 실질적으로 통과했다.
- 기존 앱을 새 앱으로 분리하지 않고 update할 수 있는 경로가 살아 있다.

### Supabase

사용자가 SQL Editor에서 migration SQL을 실행했다.

생성된 테이블:

```sql
CREATE TABLE "AppHandoffToken" (
  "nonce" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppHandoffToken_pkey" PRIMARY KEY ("nonce")
);

CREATE INDEX "AppHandoffToken_expiresAt_idx"
  ON "AppHandoffToken"("expiresAt");
```

화면 결과:

```text
Success. No rows returned
```

주의:

- runtime 테이블은 존재한다.
- `npx prisma migrate resolve --applied 20260618120000_add_app_handoff_token`은 bookkeeping상 아직 미완일 수 있다.
- 지금 로그인 실패를 migration 미적용으로 단정하면 안 된다. 먼저 table row 생성 여부를 확인해야 한다.

### Vercel env

필수:

- `APP_HANDOFF_SECRET`
- Kakao REST API key env
- Kakao client secret env, 코드가 요구한다면 필요
- `AUTH_SECRET`
- `NEXTAUTH_URL`/Auth URL 계열 env가 Preview에서 올바른지 확인 필요

중요 히스토리:

- 한때 OAuth URL에 `client_id=`가 비어 있었다.
- 이는 Kakao env가 Preview에 없거나 잘못된 key를 보고 있었다는 뜻이다.
- 이후 correct REST key가 들어간 URL까지는 확인됐다.

절대 문서에 secret 값 기록하지 말 것.

---

## 9. Kakao Developers 상태

Kakao app:

- App ID: `1409330`
- App name: `우리 나이가 어때서`

현재 OAuth에서 사용해야 하는 key:

- REST API key named `우리 나이가 어때서`
- prefix: `4ec06...`

주의:

- Default REST key prefix `3a0c...`가 따로 있다.
- 이번 Android Capacitor OAuth는 REST API 기반 시스템 브라우저 OAuth다.
- Native key, JS key, Android key hash는 현재 로그인 실패의 1차 원인이 아니다.

현재 올바른 REST API key에 등록된 Kakao login redirect URI:

```text
http://localhost:3000/api/auth/callback/kakao
https://age-doesnt-matter.com/api/auth/callback/kakao
https://www.age-doesnt-matter.com/api/auth/callback/kakao
https://age-doesnt-matter-yfqzk0hao-mogoyongseok-8318s-projects.vercel.app/api/auth/callback/kakao
```

이전 에러와 의미:

- `KOE101`: `client_id` empty 또는 Kakao app/admin setting 문제. 실제로 OAuth URL에 `client_id=`가 비어 있던 시점이 있었다.
- `KOE006`: redirect URI mismatch. Preview callback URL이 Kakao Developers에 없거나 다른 REST key에 추가된 상태였다.
- 현재 최신 화면에서는 Kakao error가 아니라 우리 앱의 로그인 에러 화면으로 넘어왔다. 즉 Kakao settings는 일단 통과한 것으로 본다.

참고 문서:

- `/Users/yanadoo/Documents/New_Claude_agenotmatter/docs/kakao-auth-policy.html`

이 문서는 이전 시행착오 히스토리다. 새 세션은 반드시 참고하되, 현재 로그와 코드 경로를 더 우선해야 한다.

---

## 10. 현재 실패 분석

최신 사용자의 실기기 흐름:

1. Android 내부 테스트 앱 `1.0.5` 설치.
2. 앱 렌더 정상.
3. 로그인/온보딩 화면에서 `카카오로 3초 만에 시작하기` 클릭.
4. 시스템 브라우저 또는 Custom Tab에서 `kauth.kakao.com` 진입.
5. Kakao 설정 오류 화면은 더 이상 나오지 않음.
6. `projects.vercel.app` blank/loading 화면을 거침.
7. 최종적으로 우리 앱의 에러 화면:

```text
로그인 중 문제가 생겼어요
카카오 로그인 처리 중 오류가 발생했습니다.
다시 한번 시도해 주세요.
```

판정:

- Kakao Developers redirect URI 문제는 거의 통과.
- 실패는 `NextAuth callback -> bridge -> credentials handoff -> app session` 중 하나다.
- 사용자는 기존 여성 계정 `하이요`로 테스트하려 했다.
- 이 계정이 실제 DB에서 어떤 providerId/gender/status인지 확인 전까지 “기존 여성”이라고 단정하지 말 것.

가능한 실패 지점:

1. `/api/auth/callback/kakao`
   - Kakao token exchange 실패.
   - client secret mismatch.
   - Preview env missing.
   - NextAuth redirect/callbackUrl issue.
2. `signIn` callback in `auth.ts`
   - 기존 user status 문제.
   - gender 판단 문제.
   - DB query/update 실패.
3. `/app-login/bridge`
   - `auth()` session 없음.
   - session은 있으나 handoff issue 실패.
   - `APP_HANDOFF_SECRET` runtime missing.
   - `AppHandoffToken` insert 실패.
4. app deep link receive
   - token deep link가 앱으로 안 돌아옴.
   - 하지만 현재 우리 `/auth/error` 화면이 보이는 양상이라 bridge 전 실패일 가능성이 더 큼.
5. credentials exchange
   - token verify/consume 실패.
   - status recheck 실패.
   - WebView session cookie 발급 실패.

---

## 11. 다음 세션의 read-only 진단 순서

코드 수정 전에 아래만 한다.

### 1단계: Vercel Preview logs 확인

대상 Preview:

```text
https://age-doesnt-matter-yfqzk0hao-mogoyongseok-8318s-projects.vercel.app
```

확인 대상 시간:

```text
2026-06-18 16:22 KST 전후
```

확인 route:

- `/api/app-login/start`
- `/api/auth/callback/kakao`
- `/app-login/bridge`
- `/api/auth/callback/credentials`
- `/auth/error`

로그에서 찾아야 할 것:

- Kakao callback error name/message.
- NextAuth error code.
- Prisma error.
- missing env.
- app-handoff token issue/verify failure.
- redirect target.

### 2단계: Supabase `AppHandoffToken` read-only 확인

SQL Editor에서 조회:

```sql
SELECT
  nonce,
  "userId",
  "expiresAt",
  "consumedAt",
  "createdAt"
FROM "AppHandoffToken"
ORDER BY "createdAt" DESC
LIMIT 20;
```

판정:

- row 없음: `/app-login/bridge` 전 또는 token issue 전 실패.
- row 있음 + `consumedAt` null: token 발급은 됐지만 앱 딥링크/credentials exchange가 실패.
- row 있음 + `consumedAt` 채워짐: token consume까지 됐고, 이후 session/callbackUrl/UI 문제.

### 3단계: 테스트 계정 확인

닉네임 `하이요`가 실제 기존 여성 계정인지 DB에서 read-only 확인한다.

추정 조회 방향:

- `User`
- `Account`
- provider `kakao`
- gender/status/onboarding 관련 필드

정확한 schema는 `prisma/schema.prisma`를 읽고 조회문을 만든다.

### 4단계: 코드 경로 대조

읽을 파일:

- `src/lib/kakao-start.ts`
- `src/app/api/app-login/start/route.ts`
- `src/app/app-login/bridge/route.ts`
- `src/app/auth/error/page.tsx`
- `src/app/auth/error/AppAuthErrorRedirect.tsx`
- `src/components/features/auth/AppDeepLinkHandler.tsx`
- `src/lib/app-handoff.ts`
- `src/lib/auth.ts`
- `android/app/src/main/AndroidManifest.xml`

목표:

- 지금 화면이 `/auth/error`인지.
- `app_login` cookie가 있는 경우 error deep link를 보내는지.
- `callbackUrl`이 어디로 잡히는지.
- Preview env/URL과 build server.url이 일치하는지.

---

## 12. Claude Code에 줄 프롬프트

아래를 그대로 새 Claude Code 세션에 붙여도 된다.

```text
코드 수정 금지. read-only 진단만 해라.

상황:
- Android Capacitor 내부 테스트 앱 1.0.5 설치/렌더/광고OFF는 PASS.
- Kakao KOE101/KOE006은 해결됐다.
- Kakao Developers의 올바른 REST API 키(우리 나이가 어때서, 4ec06... 키)에 Preview callback URI를 추가했다.
- 현재 Preview: https://age-doesnt-matter-yfqzk0hao-mogoyongseok-8318s-projects.vercel.app
- 앱에서 카카오 로그인 시 kauth.kakao.com을 거쳐 projects.vercel.app callback까지 갔다가, 우리 앱의 "로그인 중 문제가 생겼어요" 화면으로 돌아온다.
- 이 화면은 우리 /auth/error 계열 화면으로 보인다.

해야 할 일:
1. Vercel Preview yfqzk0hao deployment의 runtime/function logs를 read-only로 확인하라.
2. 아래 경로 중 어디서 실패하는지 특정하라.
   - /api/app-login/start
   - /api/auth/callback/kakao
   - /app-login/bridge
   - /api/auth/callback/credentials
   - /auth/error
3. Supabase AppHandoffToken 테이블을 read-only로 확인해서 로그인 시도 시 nonce row가 생성되는지, consumedAt이 채워지는지 확인하라.
4. 닉네임 하이요 계정이 실제 기존 여성 계정인지 DB에서 read-only로 확인하라.
5. 코드 수정하지 말고 원인, 증거 로그, 다음 수정 후보만 보고하라.

추가 조건:
- Kakao Developers 설정은 더 건드리지 않는다.
- Native key, JS key, Android key hash 문제로 몰지 말고 현재 REST API OAuth 흐름 기준으로 판단한다.
- docs/kakao-auth-policy.html을 참고하되, 문서보다 현재 로그와 코드 경로를 우선한다.
- auth.config.ts는 Edge 보호 파일이므로 건드리면 안 된다.
- git add . 금지. dirty worktree의 타 세션 변경 보존.

산출물 형식:
1. 현재 실패 hop
2. 근거 로그/DB row
3. 원인 후보 우선순위
4. 수정이 필요하다면 최소 수정 파일
5. 수정 전 창업자/코덱스 승인 필요 여부
```

---

## 13. Codex가 새 세션에서 해야 할 판단

Claude Code가 위 read-only 진단을 가져오면 Codex는 그대로 믿지 말고 다음 기준으로 판정한다.

### 경우 A: `AppHandoffToken` row 없음

뜻:

- token 발급 전 실패.
- Kakao callback, `signIn` callback, session creation, bridge auth read 중 하나.

우선 볼 것:

- `/api/auth/callback/kakao` 로그.
- `signIn` callback return.
- `jwt` callback 예외.
- `auth()`가 bridge에서 session을 읽는지.
- Kakao provider env/client secret.

### 경우 B: row 있음, `consumedAt` null

뜻:

- bridge에서 token 발급은 됐다.
- 앱으로 deep link 복귀 또는 `signIn('credentials')` 호출이 실패했을 가능성.

우선 볼 것:

- AndroidManifest custom scheme.
- `AppDeepLinkHandler`.
- deep link URL parse.
- WebView console.
- `/api/auth/callback/credentials` 로그 존재 여부.

### 경우 C: row 있음, `consumedAt` 채워짐

뜻:

- token verify/consume까지 됐다.
- 이후 session 발급, callbackUrl 이동, client-side session refresh 문제.

우선 볼 것:

- Credentials authorize return user shape.
- NextAuth jwt/session callback.
- client redirect handling.
- cookie domain/path/SameSite.

### 경우 D: `/auth/error?error=FemaleOnly`

뜻:

- 테스트 계정이 신규 남성으로 판정됐거나 gender 데이터가 잘못 들어왔다.
- user 미생성 보장은 확인해야 하지만, 기존 여성 테스트 시나리오로는 실패다.

우선 볼 것:

- Kakao account gender value.
- 기존 `하이요` Account mapping.
- providerId collision.
- DB user status/gender.

---

## 14. 실기기 검증 시나리오

Day2가 pass 되려면 아래를 확인해야 한다.

### 1. 기존 여성 계정 로그인

테스트 계정:

- 닉네임: `하이요`

기대:

- 앱 로그인 버튼 클릭.
- 시스템 브라우저/Kakao OAuth.
- 앱으로 자동 복귀.
- 로그인 상태 유지.
- 원래 화면 또는 홈/callbackUrl로 정상 이동.

### 2. 신규 여성 가입

기대:

- Kakao OAuth 통과.
- user 생성.
- 앱으로 복귀.
- `needsOnboarding`이면 온보딩 이동.
- callbackUrl 보존.

### 3. 신규 남성 차단

기대:

- Kakao signIn callback에서 `FemaleOnly`.
- user 미생성.
- token 미발급.
- 앱으로 error deep link.
- 여성전용 안내.

### 4. 기존 사용자 callbackUrl

기대:

- 특정 글/화면에서 로그인 시작.
- 로그인 완료 후 원래 화면 또는 safe callbackUrl로 복귀.

### 5. replay/만료

기대:

- 같은 token 2회 사용 시 2회차 실패.
- 90초 이후 token 사용 실패.

---

## 15. production 전환 조건

아직 production 정식 빌드로 넘어가면 안 된다.

production 전환 전 필수 조건:

- Day2 OAuth handoff 실기기 pass.
- Kakao callback Preview 테스트 완료.
- main merge 승인.
- production env에 `APP_HANDOFF_SECRET` 등 누락 없음.
- production Kakao redirect URI는 이미 존재:
  - `https://age-doesnt-matter.com/api/auth/callback/kakao`
  - `https://www.age-doesnt-matter.com/api/auth/callback/kakao`
- `capacitor.config.ts` server.url을 production으로 변경.
- versionCode를 현재 Play production보다 높게 유지.
- AAB 재빌드/서명/내부테스트 후 production rollout.

production rollout은 한 번에 100%보다 내부 테스트 -> 제한 rollout -> production 확대가 안전하다.

---

## 16. 남은 우선순위

1. Android Day2 OAuth handoff 실패 지점 read-only 특정.
2. 최소 수정으로 로그인 완료.
3. 실기기 4~5개 시나리오 pass.
4. Day2 fix commit.
5. production cutover 계획 수립.
6. production AAB build/sign/internal test.
7. Play production rollout.
8. Day3 FCM push는 Android 로그인 안정화 후 진행.
9. iOS는 Android production 전환 이후 재개.

---

## 17. 참고 명령

상태 확인:

```bash
git status --short
```

주요 파일 읽기:

```bash
sed -n '1,220p' capacitor.config.ts
sed -n '1,220p' android/app/build.gradle
sed -n '1,260p' src/lib/app-handoff.ts
sed -n '1,280p' src/lib/auth.ts
```

Prisma migration bookkeeping이 필요할 때:

```bash
npx prisma migrate resolve --applied 20260618120000_add_app_handoff_token
```

주의: Supabase direct connection이 느리거나 IPv6 문제로 hanging될 수 있다. runtime table 존재 여부와 migrate bookkeeping은 분리해서 판단한다.

Android AAB 서명 예시:

```bash
cd /Users/yanadoo/Documents/New_Claude_agenotmatter/android
rm -f app/build/outputs/bundle/release/app-release-signed.aab
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
jarsigner -keystore /Users/yanadoo/migration-backup/android/android.keystore \
  -signedjar app/build/outputs/bundle/release/app-release-signed.aab \
  app/build/outputs/bundle/release/app-release.aab android
```

keystore passphrase는 채팅/문서에 절대 기록하지 않는다.

---

## 18. 새 세션용 짧은 시작 프롬프트

새 Codex 세션을 열면 아래를 붙이면 된다.

```text
/Users/yanadoo/Documents/New_Claude_agenotmatter/docs/handoff-android-capacitor-oauth-2026-06-18.md 를 먼저 읽어라.

우리는 Android Capacitor 전환 중이고, 앱 설치/렌더/광고OFF는 PASS다.
현재 문제는 Kakao KOE 설정 에러가 아니라, 카카오 인증 이후 우리 /auth/error 화면으로 떨어지는 OAuth handoff 실패다.

코드 수정하지 말고 먼저:
1. git status --short
2. handoff 문서와 핵심 파일 확인
3. Vercel Preview yfqzk0hao logs와 Supabase AppHandoffToken row 상태 기준으로 실패 hop 특정

Codex는 운영 마스터로 판단하고, Claude Code 보고를 그대로 믿지 말고 코드/로그/DB/화면을 대조해라.
```

