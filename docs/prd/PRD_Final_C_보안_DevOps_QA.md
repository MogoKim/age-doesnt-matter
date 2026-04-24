# 우리 나이가 어때서 — 자체 플랫폼 PRD (Final v3.1)

# Part C. 보안 + DevOps + QA + 개발 + DB + 로드맵

> v3.2 | 2026.03.14 — API 스펙 + Prisma + 성능 + 에이전트 인프라 통합  
> Part A: [고객 웹](file:///Users/yanadoo/.gemini/antigravity/brain/2d5a8b27-9e68-40f3-a9d5-d16a995a9858/PRD_Final_A_서비스_고객웹.md) | Part B: [어드민](file:///Users/yanadoo/.gemini/antigravity/brain/2d5a8b27-9e68-40f3-a9d5-d16a995a9858/PRD_Final_B_어드민_데이터.md) | Part D: [AI 에이전트](file:///Users/yanadoo/.gemini/antigravity/brain/2d5a8b27-9e68-40f3-a9d5-d16a995a9858/PRD_Final_D_AI에이전트운영.md)

---

## C1. 보안 설계 (7계층)

| 계층 | 위협 | 대응 | 구현 |
|:---|:---|:---|:---|
| ① 인증 | 무단접근 | 카카오 OAuth 2.0 + JWT | NextAuth v5, httpOnly+secure+sameSite 쿠키 |
| ② 인가 | 권한탈취 | Role(USER/ADMIN) + Grade 미들웨어 | `src/middleware.ts`에서 route별 체크 |
| ③ 데이터 | 유출 | 최소수집 + 전송/저장 암호화 | Supabase AES-256 + HTTPS(Vercel SSL) |
| ④ 콘텐츠 | 혐오/스팸 | AI필터 + 3회신고 자동숨김 | **Claude API (claude-haiku-4-5)** + DB 트리거 |
| ⑤ 인프라 | DDoS | CDN + 자동스케일 | Cloudflare + Vercel |
| ⑥ 모니터링 | 이상행위 | 실시간 알림 5종 | EventLog 분석 |
| ⑦ 법률 | 개인정보보호법 | 약관/동의/탈퇴 절차 | 법률 문서 + 탈퇴 30일 유예 삭제 |

**Rate Limiting**

| 대상 | 제한 | 초과 시 |
|:---|:---|:---|
| 일반 API | 분당 60요청/IP | 429 Too Many Requests |
| 봇 API | 분당 10요청 + API Key 필수 | 429 + 어드민 알림 |
| 로그인 시도 | 5분 내 5회 실패 | 15분 차단 |
| 글쓰기 | 분당 3건 | "잠시 후 다시 시도해주세요" |
| 댓글 | 분당 10건 | 동일 |

**봇 API 인증**: `Authorization: Bearer {BOT_API_KEY}` + GitHub Actions IP 대역 검증

**XSS 방어**: DOMPurify HTML Sanitize + CSP 헤더  
**SQL Injection**: Prisma ORM 파라미터 바인딩  
**파일 업로드**: jpg/png/gif/webp만, 최대 5MB, 서버 리사이즈 후 R2 저장  

---

## C2. API 엔드포인트 전체 목록

### 공개 API (인증 불필요)

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/posts` | 게시글 목록 (boardType, category, sort, page 쿼리) |
| GET | `/api/posts/[id]` | 게시글 상세 (+viewCount 증가) |
| GET | `/api/posts/hot` | 뜨는글 TOP N |
| GET | `/api/posts/hall-of-fame` | 명예의전당 |
| GET | `/api/jobs` | 일자리 목록 (region, jobType, tags 필터) |
| GET | `/api/jobs/[id]` | 일자리 상세 |
| GET | `/api/magazine` | 매거진 목록 (category 필터) |
| GET | `/api/magazine/[id]` | 매거진 상세 |
| GET | `/api/search` | 통합 검색 (query, type=all/job/post/magazine) |
| GET | `/api/banners` | 히어로 배너 목록 (활성만) |
| GET | `/api/ads/[slotId]` | 슬롯별 광고 (우선순위 로직) |

### 회원 API (로그인 필수)

| Method | Path | 설명 | 등급 |
|:---|:---|:---|:---|
| POST | `/api/posts` | 글 작성 | 🌱+ |
| PUT | `/api/posts/[id]` | 글 수정 (본인만) | 🌱+ |
| DELETE | `/api/posts/[id]` | 글 삭제 (본인만) | 🌱+ |
| POST | `/api/posts/[id]/like` | 공감 토글 | 🌱+ |
| POST | `/api/posts/[id]/scrap` | 스크랩 토글 | 🌱+ |
| POST | `/api/posts/[id]/report` | 신고 | 🌱+ |
| POST | `/api/comments` | 댓글 작성 | 🌱+ |
| PUT | `/api/comments/[id]` | 댓글 수정 (10분 이내) | 🌱+ |
| DELETE | `/api/comments/[id]` | 댓글 삭제 (본인만) | 🌱+ |
| POST | `/api/comments/[id]/like` | 댓글 공감 | 🌱+ |
| POST | `/api/comments/[id]/report` | 댓글 신고 | 🌱+ |
| POST | `/api/upload/image` | 이미지 업로드 (R2) | 🌿+ |
| GET | `/api/my/scraps` | 스크랩 목록 | 🌱+ |
| GET | `/api/my/posts` | 내 글 목록 | 🌱+ |
| GET | `/api/my/comments` | 내 댓글 목록 | 🌱+ |
| GET | `/api/my/notifications` | 알림 목록 | 🌱+ |
| PUT | `/api/my/notifications/read` | 알림 읽음 처리 | 🌱+ |
| PUT | `/api/my/settings` | 설정 변경 | 🌱+ |
| POST | `/api/my/block` | 사용자 차단 | 🌱+ |
| DELETE | `/api/my/block/[userId]` | 차단 해제 | 🌱+ |
| POST | `/api/events` | 이벤트 로그 기록 (프론트→서버) | — |

### 봇 전용 API (API Key 필수)

| Method | Path | 설명 |
|:---|:---|:---|
| POST | `/api/bot/jobs` | 일자리 발행 |
| POST | `/api/bot/posts` | 유머/이야기 발행 |
| GET | `/api/bot/check` | 중복 체크 (title+company) |
| POST | `/api/bot/images` | 이미지 업로드 (R2 presigned) |
| POST | `/api/bot/logs` | 실행 로그 기록 |

### 어드민 API (ADMIN 권한 필수)

| Method | Path | 설명 |
|:---|:---|:---|
| GET | `/api/admin/dashboard` | 대시보드 KPI |
| GET/PUT/DELETE | `/api/admin/content/*` | 콘텐츠 CRUD + 일괄 액션 |
| GET/POST/DELETE | `/api/admin/picks` | 에디터스 픽 관리 |
| GET | `/api/admin/bots/status` | 봇 상태 |
| POST | `/api/admin/bots/[type]/rerun` | 봇 수동 재실행 |
| GET/PUT | `/api/admin/bots/review` | 검수 큐 조회 + 승인/거부 |
| GET/PUT | `/api/admin/reports` | 신고 목록 + 처리 |
| GET/PUT | `/api/admin/members/[id]` | 회원 상세 + 제재 |
| GET/POST/PUT/DELETE | `/api/admin/banners/*` | 배너 관리 |
| GET/POST/PUT/DELETE | `/api/admin/ads/*` | 광고 관리 |
| GET | `/api/admin/analytics/*` | 분석 데이터 |
| PUT | `/api/admin/settings/*` | 설정 변경 (추천컷, 말머리, 등급조건 등) |

---

## C3. Prisma 스키마 (핵심 발췌)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role        { USER ADMIN }
enum Grade       { SPROUT REGULAR VETERAN WARM_NEIGHBOR }
enum BoardType   { JOB STORY HUMOR MAGAZINE WEEKLY }
enum PostSource  { BOT USER ADMIN }
enum PostStatus  { DRAFT PUBLISHED HIDDEN DELETED }
enum Promotion   { NORMAL HOT HALL_OF_FAME }
enum TargetType  { POST COMMENT }
enum ReportReason { PROFANITY POLITICS HATE SPAM ADULT OTHER }
enum FontSize    { NORMAL LARGE XLARGE }

model User {
  id             String    @id @default(uuid())
  email          String    @unique
  nickname       String    @unique
  profileImage   String?
  providerId     String
  role           Role      @default(USER)
  grade          Grade     @default(SPROUT)
  birthYear      Int?
  gender         String?
  regions        String[]
  interests      String[]
  fontSize       FontSize  @default(NORMAL)
  postCount      Int       @default(0)
  commentCount   Int       @default(0)
  receivedLikes  Int       @default(0)
  status         String    @default("ACTIVE")
  suspendedUntil DateTime?
  lastLoginAt    DateTime  @default(now())
  createdAt      DateTime  @default(now())

  posts          Post[]
  comments       Comment[]
  notifications  Notification[]

  @@index([grade])
  @@index([status])
}

model Post {
  id              String     @id @default(uuid())
  boardType       BoardType
  category        String?
  title           String
  content         String
  summary         String?
  thumbnailUrl    String?
  authorId        String
  author          User       @relation(fields: [authorId], references: [id])
  source          PostSource
  originalUrl     String?
  status          PostStatus @default(PUBLISHED)
  isPinned        Boolean    @default(false)
  pinnedPosition  Int?
  promotionLevel  Promotion  @default(NORMAL)
  viewCount       Int        @default(0)
  likeCount       Int        @default(0)
  commentCount    Int        @default(0)
  scrapCount      Int        @default(0)
  reportCount     Int        @default(0)
  seoTitle        String?
  seoDescription  String?
  publishedAt     DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  jobDetail       JobDetail?
  comments        Comment[]

  @@index([boardType, status, createdAt])
  @@index([promotionLevel])
  @@index([likeCount])
  @@index([authorId])
}

model JobDetail {
  id          String   @id @default(uuid())
  postId      String   @unique
  post        Post     @relation(fields: [postId], references: [id])
  company     String
  salary      String
  workHours   String
  workDays    String?
  location    String
  region      String
  jobType     String
  applyUrl    String
  pickPoints  Json
  qna         Json
  quickTags   String[]
  tier        Int      @default(4)
  expiresAt   DateTime?

  @@index([region, jobType])
  @@index([company, title]) // title from Post for dedup
}

model Comment {
  id          String  @id @default(uuid())
  postId      String
  post        Post    @relation(fields: [postId], references: [id])
  authorId    String
  author      User    @relation(fields: [authorId], references: [id])
  content     String
  imageUrl    String?
  parentId    String?
  parent      Comment? @relation("Replies", fields: [parentId], references: [id])
  replies     Comment[] @relation("Replies")
  likeCount   Int     @default(0)
  reportCount Int     @default(0)
  isFiltered  Boolean @default(false)
  status      String  @default("VISIBLE")
  createdAt   DateTime @default(now())

  @@index([postId, createdAt])
  @@index([authorId])
}

model EventLog {
  id         BigInt   @id @default(autoincrement())
  eventName  String
  userId     String?
  sessionId  String
  properties Json     @default("{}")
  path       String?
  referrer   String?
  userAgent  String?
  ip         String?
  createdAt  DateTime @default(now())

  @@index([eventName, createdAt])
  @@index([userId])
  @@index([sessionId])
}
```

> 그 외 Like, Scrap, Report, Notification, BotLog, Banner, AdBanner, CpsLink, UserBlock 테이블은 Part C v3.0과 동일.

### DB 인덱스 전략

| 테이블 | 인덱스 | 목적 |
|:---|:---|:---|
| Post | `[boardType, status, createdAt]` | 게시판별 최신글 목록 |
| Post | `[promotionLevel]` | 뜨는글/명예의전당 조회 |
| Post | `[likeCount]` | 인기순 정렬 |
| JobDetail | `[region, jobType]` | 필터 검색 |
| Comment | `[postId, createdAt]` | 게시글 댓글 목록 |
| EventLog | `[eventName, createdAt]` | 분석 쿼리 |
| Like | `unique[userId, targetType, targetId]` | 중복 방지 |

---

## C4. 성능 목표

| 지표 | 목표 | 측정 |
|:---|:---|:---|
| LCP (Largest Contentful Paint) | < 2.5초 (모바일) | Lighthouse |
| FID (First Input Delay) | < 100ms | Core Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | Core Web Vitals |
| TTFB (Time to First Byte) | < 500ms | Vercel Analytics |
| 번들 크기 | < 150KB (초기 JS) | `next build` 분석 |
| 이미지 | WebP, lazy load, 반응형 srcset | next/image |
| API 응답 | < 200ms (p95) | 서버 로그 |

### 성능 최적화 전략

| 전략 | 구현 |
|:---|:---|
| **SSG** | 서비스소개/약관/FAQ 등 정적 페이지 빌드 타임 생성 |
| **ISR** | 홈 화면 60초 재검증, 매거진 목록 5분 재검증 |
| **SSR** | 게시글 상세 (SEO 필수, 실시간 데이터) |
| **CSR** | 마이페이지, 어드민 (로그인 필수, SEO 불필요) |
| **이미지** | next/image로 WebP 변환 + srcset + lazy load |
| **캐싱** | Vercel Edge Cache + revalidate 설정 |
| **코드 분할** | 라우트별 자동 코드 스플리팅 (Next.js 기본) |

---

## C5. DevOps

### 3환경

| 환경 | URL | DB | 배포 |
|:---|:---|:---|:---|
| **Dev** | localhost:3000 | 로컬 Docker PostgreSQL | 수동 |
| **Preview** | `*.vercel.app` | Supabase Preview (분기) | PR push 자동 |
| **Prod** | age-doesnt-matter.com | Supabase Prod | main merge 자동 |

### CI/CD

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main, develop]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint          # ESLint
      - run: npm run type-check    # tsc --noEmit
      - run: npm run test          # Vitest unit+integration
      - run: npm run build         # Next.js 빌드 검증
```

### 환경 변수 (13개)

| 변수 | 저장소 |
|:---|:---|
| DATABASE_URL | Vercel (Preview/Prod 분리) |
| NEXTAUTH_SECRET | Vercel |
| KAKAO_CLIENT_ID / SECRET | Vercel |
| BOT_API_KEY_JOB / HUMOR / STORY | GitHub Secrets |
| R2_ACCESS_KEY / SECRET | Vercel |
| R2_BUCKET_URL | Vercel |
| TELEGRAM_BOT_TOKEN | Vercel (긴급 알림용) |
| **ANTHROPIC_API_KEY** | **GitHub Secrets + Vercel (에이전트 두뇌)** |
| **CLAUDE_MODEL_HEAVY** | `claude-sonnet-4-6` (CEO/전략 판단) |
| **CLAUDE_MODEL_LIGHT** | `claude-haiku-4-5` (필터/빠른 작업) |

### 롤백

| 방법 | 시간 | 상황 |
|:---|:---|:---|
| Vercel Instant Rollback | ~30초 | 배포 직후 장애 |
| Git Revert PR | ~5분 | 특정 커밋 문제 |
| Prisma migrate down | ~10분 | 스키마 변경 문제 |

### 장애 대응

| 상황 | 자동 | 수동 |
|:---|:---|:---|
| 500 급증 | 어드민 알림 + 텔레그램 | Vercel 로그 → 핫픽스/롤백 |
| DB 연결 실패 | Supabase 상태 확인 | Supabase 재시작 |
| 봇 실패 | 재시도 1회 → 어드민 알림 | 어드민 수동 재실행 |
| DDoS | Cloudflare 자동 | 규칙 강화 |

---

## C6. QA

### 테스트 4계층

| 계층 | 도구 | 대상 | 목표 |
|:---|:---|:---|:---|
| Unit | Vitest | 등급계산, 포텐판정, AI필터, 광고우선순위 | 핵심 로직 90%+ |
| Integration | Vitest+Prisma | 모든 API 엔드포인트 (42개) | 전체 |
| E2E | Playwright | 5대 시나리오 | 핵심 플로우 |
| Visual | Playwright Screenshot | 5페이지+어드민 | 회귀 방지 |

### E2E 5대 시나리오

| # | 시나리오 | 검증 |
|:-:|:---|:---|
| 1 | 비회원→카카오가입→온보딩 | 가입, 등급=새싹 |
| 2 | 새싹→글작성→에디터→등록→목록 | 글쓰기, 이미지불가 |
| 3 | 글→공감10회→포텐→홈반영 | 승격, 알림 |
| 4 | 일자리상세→지원클릭→외부이동 | 전환추적 |
| 5 | 어드민→대시보드→신고처리→경고 | 어드민 워크플로우 |

### 접근성: axe-core + Lighthouse 90+ + 수동(글자크기3단/터치52px)

### QA 체크리스트 (13항목)

카카오로그인 / 비회원제한 / 등급별권한 / 포텐시스템 / 댓글정책 / AI필터 / 신고3회 / 봇API / 광고5슬롯 / 글자크기 / 모바일반응형 / OG태그 / SEO

---

## C7. 개발 표준

**Git**: main(prod) ← develop ← feature/* / hotfix/* → main  
**PR**: `[영역] 설명` + 변경사항 + 스크린샷 + CI통과 + Preview확인  
**코드**: 컴포넌트 PascalCase / 파일 kebab-case / CSS camelCase / API REST / DB PascalCase/camelCase  
**에러**: 커스텀 에러 클래스 (`AppError`, `NotFoundError`, `ForbiddenError`)

---

## C8. 기술 스택

| 계층 | 기술 |
|:---|:---|
| Runtime | Node.js 20 LTS |
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Style | CSS Modules + CSS Variables |
| DB | PostgreSQL 15 (Supabase) |
| ORM | Prisma 5 |
| Auth | NextAuth v5 (카카오) |
| Storage | Cloudflare R2 |
| Deploy | Vercel |
| CI | GitHub Actions |
| Test | Vitest + Playwright |
| AI (콘텐츠 필터/빠른 작업) | **Claude API (claude-haiku-4-5)** |
| **AI (에이전트/전략 판단)** | **Claude API (claude-sonnet-4-6)** |
| **Agent Protocol** | **MCP (Supabase/GitHub/Analytics/R2)** |
| **Agent Scheduler** | **GitHub Actions Cron** |
| **Project Instructions** | **CLAUDE.md (루트 + /agents)** |
| **Agent Hooks** | **Claude Code Pre/Post Tool Hooks** |
| Monitor | Vercel Analytics + 텔레그램 + Sentry(선택) |

---

## C9. 로드맵 (6 Phase, 12주)

| Phase | 기간 | 핵심 산출물 |
|:---|:---|:---|
| **0: 기반** | 1.5주 | Next.js+Prisma+Supabase+디자인시스템+레이아웃+카카오로그인+CI/CD |
| **1: 고객웹** | 2.5주 | 홈/일자리/소통마당/매거진/마이페이지/검색/소개/약관 |
| **2: 커뮤니티** | 2주 | 공감+승격+댓글+에디터+등급+신고+AI필터+공유+알림+차단 |
| **3: 어드민** | 2주 | 대시보드+콘텐츠+모더레이션+회원+봇+설정+매거진에디터+배너광고+분석 |
| **4: 봇+데이터+에이전트** | 2주 | 봇API+publisher교체+이벤트트래킹+이상감지+CPS+**에이전트 기반(헌법+COO+CDO+CTO)+MCP서버** |
| **5: 품질+배포+에이전트고도화** | 2.5주 | 테스트+접근성+성능+SEO+보안감사+마이그레이션+배포+**CEO/CMO/CPO/CFO 에이전트+모닝사이클** |

> **총 13주 (3개월+1주)**
