# 보안 & 크레덴셜 관리 스펙

> 2026-03-16 작성 | 솔로 창업자 / 소규모 팀 기준 실용적 보안 가이드

---

## 1. 환경변수 관리 원칙

### NEXT_PUBLIC_ 절대 규칙

| 접두사 | 의미 | 안전한 것 | 위험한 것 (절대 X) |
|:---|:---|:---|:---|
| `NEXT_PUBLIC_` | 클라이언트 번들에 포함 (누구나 볼 수 있음) | Supabase URL, Supabase Anon Key, 사이트 URL | ❌ API Secret, Service Key, 비밀번호 |
| 접두사 없음 | 서버에서만 접근 | 모든 API Secret Key | — |

### 빌드 시 환경변수 검증 (`@t3-oss/env-nextjs`)

```typescript
// src/env.ts — 빌드 시 필수 환경변수 누락되면 즉시 실패
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(32),
    KAKAO_CLIENT_SECRET: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: { /* process.env 매핑 */ },
});
```

### `server-only` 패키지

```typescript
// lib/supabase-admin.ts — 이 파일이 클라이언트에서 import되면 빌드 에러
import "server-only";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // 서비스 키는 서버에서만
);
```

---

## 2. GitHub 보안 설정

### 필수 (즉시 설정)

- [x] **Private Repository**
- [x] **2FA (2단계 인증)** 활성화
- [x] **Secret Scanning + Push Protection** 활성화
  - Settings > Code security > Secret scanning > Enable
  - 실수로 API 키 커밋하면 push 자동 차단
- [x] **Dependabot alerts** 활성화
  - 취약한 패키지 자동 감지 + PR 생성

### 배포 전 (Branch Protection)

- [x] `main` 브랜치 보호
  - PR 필수 (직접 push 금지)
  - Status checks 통과 필수 (lint, typecheck, test)
  - Force push 금지
- [x] Fine-grained PAT 사용 (레포별 최소 권한)

---

## 3. Vercel 보안

- **환경변수**: Production / Preview / Development 별도 설정
- **Sensitive 마크**: 민감한 변수는 "Sensitive" 체크 → 대시보드에서도 값 확인 불가
- **Preview 배포 보호**: Authentication 필수 (크롤러/외부 접근 차단)
- **환경별 크레덴셜 분리**:

| 변수 | Production | Preview | Local Dev |
|:---|:---|:---|:---|
| DATABASE_URL | Supabase Prod | Supabase Preview | Docker 로컬 |
| NEXTAUTH_SECRET | 고유값 A | 고유값 B | 고유값 C |
| KAKAO_CLIENT_* | 운영 앱 | 테스트 앱 | 테스트 앱 |

---

## 4. .gitignore (필수)

```gitignore
# dependencies
node_modules/
.pnp
.pnp.js

# environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local
.env*.local

# next.js
.next/
out/

# vercel
.vercel

# prisma
prisma/.env

# OS
.DS_Store
*.pem

# IDE
.idea/
.vscode/settings.json
*.swp

# Supabase local
supabase/.temp/

# debug
npm-debug.log*
yarn-debug.log*
```

---

## 5. Pre-commit 훅 (비밀 유출 방지)

```bash
# husky + secretlint 설치
npm install -D husky secretlint @secretlint/secretlint-rule-preset-recommend

# .husky/pre-commit
npx secretlint '**/*'
```

→ 커밋 시 자동으로 API 키/시크릿 패턴 스캔. 감지되면 커밋 차단.

---

## 6. NEXTAUTH_SECRET 생성

```bash
# 각 환경별로 고유한 값 생성
openssl rand -base64 32
```

환경마다 다른 시크릿 사용. 절대 재사용 금지.

---

## 7. 서비스별 API 키 관리

| 서비스 | 키 종류 | 보안 수칙 |
|:---|:---|:---|
| **카카오** | Client ID (공개 가능) + Secret (서버만) | dev/prod 앱 분리, 리디렉트 URI 제한 |
| **텔레그램** | Bot Token (서버만) | dev/prod 봇 분리 |
| **Anthropic** | API Key `sk-ant-*` (서버만) | 사용량 한도 설정, dev/prod 키 분리 |
| **Cloudflare R2** | Access Key + Secret (서버만) | 버킷 단위 최소 권한 토큰 사용 |
| **Supabase** | Anon Key (공개 OK) + Service Key (서버만) | RLS 정책으로 anon key 범위 제한 |

---

## 8. 한국 개인정보보호법 (PIPA) 준수

### 필수 구현 항목

| # | 항목 | 구현 위치 |
|:-:|:---|:---|
| 1 | **개인정보 처리방침** 페이지 | `/privacy` (한국어, SSG) |
| 2 | **회원가입 시 동의 체크박스** | 온보딩 Step 1 (필수/선택 분리) |
| 3 | **수집 항목 명시** | 카카오 프로필, 닉네임, 이메일(선택), 성별(선택), 출생연도(선택) |
| 4 | **제3자 제공 명시** | Supabase(DB), Vercel(호스팅), Anthropic(AI필터), Cloudflare(이미지) |
| 5 | **마이데이터** (열람/수정/삭제) | 마이페이지에서 제공 |
| 6 | **탈퇴 시 30일 유예 → 완전 삭제** | 배치잡으로 처리 |
| 7 | **데이터 위반 시 72시간 내 신고** | PIPC + 사용자 통보 |

### 처리방침에 포함할 내용

```
1. 수집하는 개인정보 항목
2. 수집 목적
3. 보유 기간
4. 제3자 제공 현황
5. 이용자의 권리 (열람, 수정, 삭제, 동의 철회)
6. 개인정보 보호책임자 연락처
7. 쿠키 사용 여부
```

---

## 9. 시크릿 매니저 필요성

### 현재 (솔로 창업자): 불필요

Vercel 환경변수 + GitHub Secrets로 충분.

### 팀 확장 시 (3명+): Doppler 추천

| 도구 | 장점 | 무료 |
|:---|:---|:---|
| **Doppler** | Vercel 네이티브 통합, 5분 세팅 | 5명까지 무료 |
| **Infisical** | 오픈소스, 셀프호스트 가능 | 커뮤니티 에디션 무료 |

> HashiCorp Vault, AWS Secrets Manager는 현재 오버킬.

---

## 10. 보안 체크리스트

### 즉시 (첫 배포 전)

- [ ] `.gitignore` 설정
- [ ] `.env.example` 커밋 (실제 값 X)
- [ ] `.env.local` 생성 (커밋 X)
- [ ] GitHub Secret Scanning + Push Protection 활성화
- [ ] GitHub 2FA 활성화
- [ ] Vercel 환경변수 환경별 설정
- [ ] `NEXTAUTH_SECRET` 환경별 고유값 생성
- [ ] `server-only` 패키지 설치
- [ ] `@t3-oss/env-nextjs`로 환경변수 검증

### 배포 전

- [ ] Branch Protection 설정
- [ ] Dependabot 활성화
- [ ] CI 파이프라인 (lint + typecheck)
- [ ] 개인정보 처리방침 작성/게시
- [ ] 동의 플로우 구현
- [ ] 마이데이터 기능 (열람/삭제)
- [ ] Vercel Preview 배포 보호

### 분기별 (3개월마다)

- [ ] API 키 로테이션 (Supabase Service Key, Anthropic, R2, Telegram)
- [ ] GitHub Access Token 감사
- [ ] Dependabot 미해결 알림 확인
- [ ] Vercel 팀 멤버 접근 감사
