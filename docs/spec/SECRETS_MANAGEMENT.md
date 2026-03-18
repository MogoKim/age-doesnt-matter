# 크레덴셜 & 시크릿 관리 정책

> **v1.0** | 2026-03-17
> **목적**: 모든 API 토큰/키/시크릿의 생성·저장·갱신·폐기 절차를 정의하여 분실·유출 사고를 원천 방지

---

## 1. 핵심 원칙

| # | 원칙 |
|:-:|:---|
| 1 | 시크릿은 **`.env.local`에만** 저장. 코드/문서/채팅에 직접 기록 금지 |
| 2 | `.env.local`은 **절대 git 커밋 금지** (`.gitignore` 필수) |
| 3 | `.env.example`에는 **키 이름만** 기록 (값은 공백) |
| 4 | 모든 토큰에는 **만료일 주석** 기록 |
| 5 | 갱신 절차는 이 문서에 기록, 갱신 실행은 **창업자만** |

---

## 2. 시크릿 인벤토리

### Phase 1 (현재)

| 서비스 | 변수명 | 타입 | 생성 시점 | 만료 | 갱신 주기 |
|:---|:---|:---|:---|:---|:---|
| **GitHub** | `GITHUB_TOKEN` | Personal Access Token (Fine-grained) | B0 | 90일 | 만료 2주 전 |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` | Project URL | B3 ✅ | 없음 | 프로젝트 변경 시 |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable Key (구 anon) | B3 ✅ | 없음 | 프로젝트 변경 시 |
| **Supabase** | `SUPABASE_SERVICE_ROLE_KEY` | Secret Key (구 service_role) | B3 ✅ | 없음 | 수동 로테이션 |
| **Supabase** | `DATABASE_URL` | Pooler 연결 (port 6543) | B3 ✅ | 없음 | 비밀번호 변경 시 |
| **Supabase** | `DIRECT_URL` | Direct 연결 (port 5432) | B3 ✅ | 없음 | 비밀번호 변경 시 |
| **Kakao** | `KAKAO_CLIENT_ID` | REST API Key | B4 | 없음 | 앱 재생성 시 |
| **Kakao** | `KAKAO_CLIENT_SECRET` | Client Secret | B4 | 없음 | 수동 로테이션 |
| **NextAuth** | `NEXTAUTH_SECRET` | 랜덤 문자열 | B4 | 없음 | 유출 시 즉시 |
| **Cloudflare** | `CLOUDFLARE_R2_ACCESS_KEY` | API Token | B5 | 설정에 따름 | 90일 권장 |
| **Figma** | (OAuth 자동 관리) | OAuth Token | B0 | 자동 갱신 | — |

### Phase 2 (에이전트 시스템)

| 서비스 | 변수명 | 타입 | 생성 시점 | 만료 | 갱신 주기 |
|:---|:---|:---|:---|:---|:---|
| **Anthropic** | `ANTHROPIC_API_KEY` | API Key | E0 | 없음 | 유출 시 즉시 |
| **Telegram** | `TELEGRAM_BOT_TOKEN` | Bot Token | E0 | 없음 | 유출 시 즉시 |
| **Sentry** | `SENTRY_DSN` | DSN URL | 프로덕션 | 없음 | 프로젝트 변경 시 |
| **Sentry** | `SENTRY_AUTH_TOKEN` | Auth Token | 프로덕션 | 설정에 따름 | 수동 |

---

## 3. 파일 구조

```
프로젝트 루트/
├── .env.local            ← 실제 값 (git 무시, 로컬만)
├── .env.example          ← 키 이름 + 설명 (git 커밋)
├── .gitignore            ← .env.local 포함 필수
└── docs/spec/
    └── SECRETS_MANAGEMENT.md  ← 이 문서 (관리 정책, git 커밋)
```

---

## 4. 각 서비스별 갱신 절차

### GitHub Token

```
1. https://github.com/settings/tokens?type=beta 접속
2. "claude-code-unaeo" 토큰 선택 → Regenerate
3. 새 토큰 복사
4. .env.local의 GITHUB_TOKEN 값 교체
5. Claude MCP 업데이트:
   claude mcp remove github
   claude mcp add github -e GITHUB_TOKEN=새토큰 -- npx -y @modelcontextprotocol/server-github
6. Vercel 환경변수 업데이트 (배포 환경)
7. GitHub Actions 시크릿 업데이트 (CI/CD)
```

### Supabase Keys

> **참고**: 2026년 기준 Supabase 키 체계가 변경됨
> - `sb_publishable_*` = 구 `anon key` (클라이언트용, 공개 가능)
> - `sb_secret_*` = 구 `service_role key` (서버용, 비밀)
> - Pooler: `aws-1-{region}.pooler.supabase.com` (aws-0이 아닌 aws-1일 수 있음, 반드시 대시보드에서 확인)

```
1. Supabase Dashboard → Settings → API Keys
2. Publishable key / Secret key 복사
3. .env.local 업데이트
4. DB 비밀번호 변경 시: DATABASE_URL, DIRECT_URL 모두 업데이트
5. Vercel 환경변수 업데이트
6. secret key 변경 시: 모든 서버 사이드 코드 동작 확인
```

### Kakao OAuth

```
1. https://developers.kakao.com → 내 애플리케이션 → 우나어
2. 앱 키 → REST API 키 확인
3. 보안 → Client Secret 재생성 (필요시)
4. .env.local 업데이트
5. Vercel 환경변수 업데이트
```

### NextAuth Secret

```
1. 새 시크릿 생성: openssl rand -base64 32
2. .env.local의 NEXTAUTH_SECRET 교체
3. Vercel 환경변수 업데이트
4. 주의: 변경 시 기존 세션 모두 무효화됨
```

### Cloudflare R2

```
1. Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. 새 토큰 생성 또는 기존 토큰 재생성
3. .env.local 업데이트
4. Vercel 환경변수 업데이트
```

---

## 5. 에이전트 역할 (Phase 2)

> Phase 1에서는 창업자가 직접 관리. Phase 2에서 CTO 에이전트가 모니터링 담당.

### CTO 에이전트 — 크레덴셜 모니터링

| 태스크 | 주기 | 액션 |
|:---|:---|:---|
| 토큰 만료일 체크 | 매일 09시 | DB의 `Setting` 테이블에서 만료일 조회 |
| 만료 2주 전 알림 | 실시간 | 텔레그램: "GitHub Token 2주 후 만료, 갱신 필요" |
| 만료 3일 전 긴급 알림 | 실시간 | 텔레그램 + 어드민 대시보드 빨간 배너 |
| 유출 감지 | 실시간 | GitHub Secret Scanning 알림 연동 |
| 갱신 완료 확인 | 갱신 후 | API 호출 테스트 → 정상 동작 확인 |

**CTO는 "알림"만 한다. 실제 갱신은 창업자가 직접 수행.**

### Setting 테이블 활용

```sql
-- 토큰 만료일 관리용 (Phase 2)
INSERT INTO "Setting" (key, value) VALUES
  ('github_token_expires', '2026-06-15'),
  ('cloudflare_token_expires', '2026-06-15');
```

---

## 6. 배포 환경별 시크릿 위치

| 환경 | 저장 위치 | 관리자 |
|:---|:---|:---|
| **로컬 개발** | `.env.local` (프로젝트 루트) | 창업자 |
| **Vercel (프로덕션)** | Vercel Dashboard → Settings → Environment Variables | 창업자 |
| **Vercel (프리뷰)** | 같은 위치 (Preview 환경 선택) | 창업자 |
| **GitHub Actions** | Repository → Settings → Secrets and variables → Actions | 창업자 |
| **Claude MCP** | `~/.claude.json` (로컬 머신) | 창업자 |

---

## 7. 사고 대응 — 시크릿 유출 시

```
1. [즉시] 유출된 토큰 무효화 (해당 서비스 대시보드에서)
2. [즉시] 새 토큰 생성
3. [5분 내] 모든 환경(.env.local, Vercel, GitHub Actions, MCP) 업데이트
4. [1시간 내] git 히스토리 확인 — 커밋에 시크릿 포함 여부 체크
   - 포함 시: git filter-branch 또는 BFG Repo-Cleaner로 제거
5. [당일] 사고 로그 작성 → 어드민 대시보드 기록
```

---

## 8. 백업 정책

> **시크릿은 백업하지 않는다.** 분실 시 재생성이 원칙.

| 상황 | 대응 |
|:---|:---|
| `.env.local` 분실 | 이 문서(SECRETS_MANAGEMENT.md)의 갱신 절차를 따라 전체 재생성 |
| Vercel 환경변수 확인 불가 | Vercel Dashboard에서 직접 확인 (마스킹되어 있으나 Edit으로 재설정 가능) |
| GitHub Token 만료 | 새로 생성 (위 절차 참조) |
| Supabase 비밀번호 분실 | Supabase Dashboard → Database → Settings → Reset password |

**핵심: 이 문서가 있으면 모든 시크릿을 처음부터 다시 만들 수 있다.**

---

## 9. 체크리스트

### 새 시크릿 추가 시

- [ ] `.env.local`에 값 추가
- [ ] `.env.example`에 키 이름(값 없이) 추가
- [ ] 이 문서의 인벤토리 테이블에 추가
- [ ] 만료일이 있으면 주석으로 기록
- [ ] Vercel 환경변수에 추가 (배포 환경)
- [ ] CLAUDE.md에 관련 설정 반영 (필요시)

### 시크릿 갱신 시

- [ ] 해당 서비스에서 새 토큰 생성
- [ ] `.env.local` 업데이트
- [ ] Vercel 환경변수 업데이트
- [ ] GitHub Actions 시크릿 업데이트 (해당 시)
- [ ] Claude MCP 설정 업데이트 (해당 시)
- [ ] 동작 확인 (로컬 + 배포)
