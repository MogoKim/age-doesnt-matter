# 우리 나이가 어때서 (우나어) — 서비스 아키텍처 종합 문서

> **최종 업데이트**: 2026-03-25
> **문서 관리자**: Claude Code (자동화) + 창업자 (승인)
> **변경 시**: 이 문서 하단 [문서 업데이트 가이드](#문서-업데이트-가이드) 참고

---

## 1. 서비스 개요

| 항목 | 내용 |
|------|------|
| **서비스명** | 우리 나이가 어때서 (우나어) |
| **도메인** | age-doesnt-matter.com |
| **한줄 소개** | 50·60대를 위한 제2의 인생 플랫폼 — 일자리 + 커뮤니티 + 매거진 |
| **타겟** | 50~60대, 여성 70~80% / 남성 20~30% |
| **핵심 페르소나** | 1순위: 외로움 해소형 → 2순위: 체면중시형 → 3순위: 건강걱정형 → 4순위: 능동적 시니어 |

### 1.1 미션 & 비전

| | 내용 |
|---|------|
| **미션** | "나이는 숫자일 뿐" — 50·60대가 자신감 있게 새로운 도전을 시작할 수 있는 공간을 만든다 |
| **비전** | 시니어 세대의 디지털 허브 — 일자리, 정보, 소통을 하나의 플랫폼에서 |
| **핵심 가치** | 실용, 따뜻함, 연결, 용기, 존중, 현실성 |

### 1.2 수익 모델

| 수익원 | 구현 상태 | 설명 |
|--------|----------|------|
| Google AdSense | 컴포넌트 준비, 승인 대기 | 게시글 하단, 목록 인라인, 모바일 스티키 |
| Coupang CPS | 컴포넌트 준비, 가입 대기 | 매거진 내 상품 링크 수수료 |

---

## 2. 기술 스택

### 2.1 핵심 스택

| 영역 | 기술 | 버전 |
|------|------|------|
| **프레임워크** | Next.js (App Router) | 14.2.35 |
| **언어** | TypeScript (strict) | 5.9.3 |
| **DB** | Supabase PostgreSQL | - |
| **ORM** | Prisma | 7.5.0 |
| **인증** | NextAuth v5 (카카오 전용) | beta.30 |
| **CSS** | Tailwind CSS + shadcn/ui | - |
| **폰트** | Pretendard Variable (next/font/local) | - |
| **스토리지** | Cloudflare R2 (이미지) | - |
| **AI** | Anthropic Claude (Sonnet 4.6 / Haiku 4.5) | - |
| **배포** | Vercel (Hobby Plan) | - |
| **CI/CD** | GitHub Actions | - |
| **알림** | Telegram Bot | - |

### 2.2 테스팅

| 도구 | 용도 |
|------|------|
| Vitest | 유닛 테스트 |
| Playwright | E2E 테스트 |
| axe-core | 접근성 테스트 |
| Lighthouse CI | 성능 테스트 |
| Secretlint | 시크릿 스캐닝 |
| Husky | Git hooks (pre-commit) |

### 2.3 보안 헤더 (next.config.js)

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=63072000; preload`
- CSP: Kakao SDK, YouTube, Telegram API 허용

---

## 3. 인프라 구조

```
┌─────────────────────────────────────────────────────────┐
│                      사용자 (브라우저)                       │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare (DNS + CDN)                                  │
│  age-doesnt-matter.com → CNAME → Vercel                 │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Vercel (Hobby Plan)                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Next.js SSR  │  │ API Routes   │  │ Middleware     │  │
│  │ (App Router) │  │ /api/*       │  │ (인증 체크)    │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
│         │                │                               │
│         ▼                ▼                               │
│  ┌──────────────────────────┐                           │
│  │ Serverless Functions      │                           │
│  │ - Telegram Webhook        │                           │
│  │ - Bot API endpoints       │                           │
│  └──────────┬───────────────┘                           │
└─────────────┼───────────────────────────────────────────┘
              │
    ┌─────────┼──────────────────┐
    ▼         ▼                  ▼
┌────────┐ ┌──────────┐ ┌──────────────┐
│Supabase│ │Cloudflare│ │  Anthropic   │
│Postgres│ │    R2    │ │  Claude API  │
│(DB)    │ │(이미지)  │ │  (AI 에이전트)│
└────────┘ └──────────┘ └──────────────┘

┌─────────────────────────────────────────────────────────┐
│  GitHub Actions (자동화 크론)                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ CEO  │ │ CTO  │ │ CMO  │ │ COO  │ │ SEED │  ...    │
│  │09:00 │ │2h마다│ │10:00 │ │3회/일│ │6회/일│         │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
└─────────────────────────┬───────────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Telegram │ │ Supabase │ │ Anthropic│
      │ (알림)   │ │ (DB R/W) │ │ (AI)     │
      └──────────┘ └──────────┘ └──────────┘
```

### 3.1 환경 변수

| 변수 | 용도 | 사용처 |
|------|------|--------|
| `DATABASE_URL` | Supabase 연결 (트랜잭션 풀러 6543) | Prisma, 에이전트 |
| `DIRECT_URL` | Supabase 직접 연결 (5432) | 마이그레이션 |
| `AUTH_SECRET` | NextAuth 세션 암호화 | 인증 |
| `KAKAO_CLIENT_ID` / `SECRET` | 카카오 OAuth | 로그인 |
| `ANTHROPIC_API_KEY` | Claude API | 에이전트 |
| `CLAUDE_MODEL_HEAVY` | 전략 판단 모델 (claude-sonnet-4-6) | 에이전트 |
| `CLAUDE_MODEL_LIGHT` | 빠른 작업 모델 (claude-haiku-4-5) | 에이전트 |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 | 알림, 커맨드 |
| `TELEGRAM_CHAT_ID` | 텔레그램 채팅방 | 알림 |
| `CLOUDFLARE_R2_*` | R2 스토리지 | 이미지 업로드 |
| `ADMIN_JWT_SECRET` | 어드민 JWT | 어드민 인증 |
| `BOT_API_KEY_*` | 봇 API 인증 | 봇 엔드포인트 |

---

## 4. 데이터베이스 스키마

### 4.1 전체 모델 맵

```
┌── 사용자 ──────────────────────┐
│ User          사용자 (등급 시스템) │
│ AdminAccount  어드민 계정         │
│ Agreement     이용약관 동의        │
│ UserBlock     사용자 차단          │
└────────────────────────────────┘

┌── 콘텐츠 ──────────────────────┐
│ Post          게시글 (5개 보드)   │
│ JobDetail     일자리 상세 (1:1)  │
│ Comment       댓글 (대댓글 지원)  │
│ DraftPost     임시저장            │
└────────────────────────────────┘

┌── 상호작용 ────────────────────┐
│ Like          좋아요             │
│ Scrap         스크랩             │
│ Report        신고               │
│ Notification  알림               │
└────────────────────────────────┘

┌── 운영 ────────────────────────┐
│ BoardConfig   게시판 설정         │
│ BannedWord    금칙어              │
│ Banner        프로모션 배너        │
│ AdBanner      광고 배너           │
│ CpsLink       쿠팡 CPS 링크      │
└────────────────────────────────┘

┌── 분석·로그 ───────────────────┐
│ BotLog        봇 실행 로그       │
│ EventLog      분석 이벤트         │
│ AdminAuditLog 어드민 감사 로그    │
└────────────────────────────────┘

┌── 카페 인텔리전스 ──────────────┐
│ CafePost      카페 크롤링 원본    │
│ CafeTrend     일별 트렌드 분석    │
└────────────────────────────────┘
```

### 4.2 핵심 Enum 값

| Enum | 값 |
|------|-----|
| **BoardType** | JOB, STORY, HUMOR, MAGAZINE, WEEKLY |
| **Grade** | SPROUT(새싹) → REGULAR(단골) → VETERAN(베테랑) → WARM_NEIGHBOR(따뜻한이웃) |
| **PostStatus** | DRAFT, PUBLISHED, HIDDEN, DELETED |
| **PostSource** | USER, BOT, ADMIN |
| **PromotionLevel** | NORMAL, HOT, HALL_OF_FAME |
| **AdSlot** | HERO, HOME_INLINE, SIDEBAR, LIST_INLINE, POST_BOTTOM, MOBILE_STICKY, MAGAZINE_CPS |
| **BotType** | JOB, HUMOR, STORY, THREAD, CEO, CTO, CMO, CPO, CDO, CFO, COO, SEED, CAFE_CRAWLER |

### 4.3 주요 관계

- `User` 1:N `Post`, `Comment`, `Like`, `Scrap`, `Notification`
- `Post` 1:1 `JobDetail` (boardType=JOB인 경우만)
- `Post` 1:N `Comment`, `Like`, `Scrap`, `CpsLink`
- `Comment` 자기참조 (parent → replies, 대댓글)

---

## 5. AI 에이전트 시스템

### 5.1 에이전트 조직도

```
                    ┌─────────┐
                    │ 창업자    │ Telegram 커맨드
                    │ (Human)  │ /status /approve /stop
                    └────┬────┘
                         │ 승인·지시
                         ▼
              ┌──────────────────────┐
              │    CEO (전략총괄)      │ 매일 09:00
              │  morning-cycle.ts     │ KPI 분석 + 브리핑
              └──────────┬───────────┘
                         │
    ┌────────┬───────────┼───────────┬────────┬────────┐
    ▼        ▼           ▼           ▼        ▼        ▼
┌───────┐┌───────┐┌──────────┐┌───────┐┌───────┐┌───────┐
│ CTO   ││ CMO   ││   COO    ││ CPO   ││ CDO   ││ CFO   │
│기술총괄││마케팅 ││  운영총괄  ││제품총괄││데이터 ││재무총괄│
│       ││       ││          ││       ││       ││       │
│헬스체크││트렌드 ││일자리수집 ││UX분석 ││KPI수집││비용   │
│에러감시││SNS포스││모더레이션 ││       ││이상감지││추적   │
│       ││팅     ││콘텐츠편성 ││       ││       ││       │
└───────┘└───────┘└────┬─────┘└───────┘└───────┘└───────┘
                       │
                       ▼
              ┌──────────────────┐
              │   SEED (시드봇)    │ 하루 6회
              │  10명 페르소나     │ 커뮤니티 활성화
              └──────────────────┘
```

### 5.2 에이전트 상세

| 에이전트 | 파일 | 스케줄 | AI 모델 | 역할 |
|---------|------|--------|---------|------|
| **CEO** | `ceo/morning-cycle.ts` | 매일 09:00 | Sonnet | DAU/게시글/댓글 KPI 분석, 창업자 브리핑 |
| **CTO** | `cto/health-check.ts` | 2시간마다 | Haiku | 서비스 헬스체크 (API, DB 응답속도) |
| **CTO** | `cto/error-monitor.ts` | 2시간마다 | Haiku | 에러 로그 분석 + 알림 |
| **CMO** | `cmo/trend-analyzer.ts` | 매일 10:00 | Sonnet | 시니어 트렌드 분석, 콘텐츠 주제 제안 |
| **CMO** | `cmo/social-poster.ts` | 매일 15:00 | Haiku | Threads/X 자동 포스팅 |
| **CPO** | `cpo/ux-analyzer.ts` | 매일 11:00 | Sonnet | UX 패턴 분석, 개선 제안 |
| **CDO** | `cdo/kpi-collector.ts` | 매일 22:00 | Haiku | DAU, 게시글, 댓글 등 KPI 수집 |
| **CDO** | `cdo/anomaly-detector.ts` | 2시간마다 | Haiku | KPI 이상치 감지 + 알림 |
| **CFO** | `cfo/cost-tracker.ts` | 매일 23:00 | Haiku | API 비용 추적 + 예산 경고 |
| **COO** | `coo/job-scraper.ts` | 12/16/20시 | Haiku | 50plus.or.kr 일자리 크롤링 → AI 가공 → DB |
| **COO** | `coo/moderator.ts` | 09/15/21시 | Haiku | 신고 처리, 콘텐츠 모더레이션 |
| **COO** | `coo/content-scheduler.ts` | 매일 14:00 | Haiku | 에디터스 픽 + 시드 콘텐츠 편성 |
| **SEED** | `seed/scheduler.ts` | 하루 6회 | Haiku | 10명 페르소나 활동 (게시글, 댓글, 좋아요) |

### 5.3 에이전트 기반 구조 (core/)

| 파일 | 역할 |
|------|------|
| `core/agent.ts` | **BaseAgent** 추상 클래스 — 모든 에이전트가 상속. AI 호출, 로깅, 에러 처리 |
| `core/constitution.yaml` | **회사 헌법** — 모든 에이전트 System Prompt에 주입. 서비스 정체성, 가드레일, 콘텐츠 정책 |
| `core/types.ts` | 타입 정의 (AgentResult, AgentConfig, NotifyPayload 등) |
| `core/db.ts` | Prisma 클라이언트 초기화 |
| `core/notifier.ts` | 텔레그램 + 어드민큐 알림 |
| `core/telegram-commander.ts` | 텔레그램 양방향 커맨드 (/status, /agents, /stop 등) |

### 5.4 일자리 파이프라인 (COO)

```
GitHub Actions Cron (12:00, 16:00, 20:00 KST)
  └→ coo/job-scraper.ts
      ├→ Step 1: 50plus.or.kr Playwright 크롤링 (최대 30건)
      ├→ Step 2: DB 중복 체크 (JobDetail.sourceUrl)
      ├→ Step 3: Waterfall 4단계 필터링
      │   ├ Tier 1: 대기업/공공기관 (삼성, LG, 공단 등)
      │   ├ Tier 2: Sweet-Spot (사무, 안내, 경비 등)
      │   ├ Tier 3: 광역시 소재
      │   └ Tier 4: Safety-Net
      │   + 여성 쿼터 60% + 수도권:비수도권 5:5
      ├→ Step 4: AI 가공 (Claude Haiku x 4 병렬 호출)
      │   ├ 제목 정제: "[지역] 직무명" (25자 이내)
      │   ├ SEO 키워드 4개 (숨김)
      │   ├ Pick 포인트 5개 (이모지 + 한줄)
      │   └ Q&A 3개 (시니어 눈높이)
      │   + 규칙 기반: displayTags 최대 3개, 급여 정규화
      ├→ Step 5: Post + JobDetail DB INSERT (Prisma)
      └→ Step 6: Telegram 요약 알림
```

### 5.5 시드 페르소나 (SEED)

| ID | 닉네임 | 나이/성별 | 보드 | 성격 | 주요 주제 |
|----|--------|----------|------|------|----------|
| A | 영숙이맘 | 58/여 | STORY | 따뜻, 수다 | 손주, 요리, 시장 |
| B | 은퇴신사 | 63/남 | STORY | 차분, 정보형 | 퇴직, 재테크 |
| C | 웃음보 | 55/여 | HUMOR | 유쾌, 밝음 | 짧은 리액션 |
| D | 꼼꼼이 | 60/여 | JOB | 꼼꼼, 질문 | 일자리 질문 댓글 |
| E | 동네언니 | 52/여 | STORY | 다정, 공감 | 긴 공감 댓글 |
| F | 텃밭아저씨 | 62/남 | STORY | 소박, 자연파 | 텃밭, 채소 |
| G | 여행매니아 | 57/여 | STORY | 활발, 열정 | 여행, 맛집 |
| H | 건강박사 | 65/남 | STORY | 꼼꼼, 실용 | 건강, 운동 |
| I | 책벌레 | 59/여 | STORY | 지적, 감성 | 독서, 영화 |
| J | 요리왕 | 54/여 | STORY | 친근, 실용 | 레시피, 반찬 |

### 5.6 에이전트 규칙 (헌법 핵심)

| 규칙 | 내용 |
|------|------|
| **DB 쓰기** | COO 에이전트만 가능, 나머지 읽기 전용 |
| **비용 상한** | $50/월, $40 도달 시 경고, 초과 시 즉시 중단 |
| **승인 필요** | UI/UX 변경, DB 스키마 변경, 새 에이전트 추가, 자동화 시작/중단 |
| **헌법 수정** | 창업자 승인 없이 수정 불가 |
| **콘텐츠 금지** | 정치, 혐오, 도박, 성인콘텐츠 (ABSOLUTE_ZERO) |
| **자동화 상태** | ACTIVE (2026-03-24 승인), 1클릭 긴급 중지 가능 |

---

## 6. GitHub Actions 워크플로우

### 6.1 CI/CD

| 파일 | 트리거 | 내용 |
|------|--------|------|
| `ci.yml` | PR, push to main | Lint → Typecheck → Test → Build |
| `lighthouse.yml` | PR, push to main | Lighthouse 접근성 감사 |

### 6.2 에이전트 크론

| 파일 | 스케줄 (KST) | 에이전트 |
|------|-------------|---------|
| `agents-daily.yml` | 09, 10, 11, 14, 22, 23시 | CEO, CMO, CPO, COO, CDO, CFO |
| `agents-hourly.yml` | 2시간마다 | CTO (헬스체크, 에러감시), CDO (이상감지) |
| `agents-jobs.yml` | 12, 16, 20시 | COO (일자리 수집) |
| `agents-moderation.yml` | 09, 15, 21시 | COO (모더레이션) |
| `agents-seed.yml` | 09, 10, 14, 16, 19, 21시 | SEED (시드 콘텐츠) |
| `agents-social.yml` | 15시 | CMO (SNS 포스팅) |
| `agents-cafe.yml` | 09, 13, 19시 | CAFE (네이버 카페 크롤링) |

### 6.3 전체 타임라인 (KST)

```
08:30  ░░ CAFE 크롤링 (로컬)
09:00  ██ CEO 모닝사이클 | SEED 활동 | COO 모더레이션
10:00  ██ CMO 트렌드분석 | SEED 활동
11:00  ██ CPO UX분석
12:00  ██ COO 일자리수집
12:30  ░░ CAFE 크롤링 (로컬)
13:00  ░░ CAFE 크롤링 (Actions)
14:00  ██ COO 콘텐츠편성 | SEED 활동
15:00  ██ CMO SNS포스팅 | COO 모더레이션
16:00  ██ COO 일자리수집 | SEED 활동
18:30  ░░ CAFE 크롤링 (로컬)
19:00  ██ SEED 활동 | CAFE 크롤링 (Actions)
20:00  ██ COO 일자리수집
21:00  ██ COO 모더레이션 | SEED 활동
22:00  ██ CDO KPI수집
23:00  ██ CFO 비용추적
(2h)   ▒▒ CTO 헬스체크 + 에러감시 + CDO 이상감지
```

---

## 7. Webhook & 외부 연동

| 연동 | 엔드포인트 | 방향 | 용도 |
|------|-----------|------|------|
| **Kakao OAuth** | `/api/auth/[...nextauth]` | 인바운드 | 사용자 로그인 |
| **Telegram Webhook** | `/api/telegram` | 인바운드 | 모바일 커맨드 (/status 등) |
| **Telegram Bot API** | `api.telegram.org` | 아웃바운드 | 알림 발송 |
| **Anthropic API** | `api.anthropic.com` | 아웃바운드 | AI 에이전트 호출 |
| **Cloudflare R2** | `*.r2.cloudflarestorage.com` | 아웃바운드 | 이미지 업로드/서빙 |
| **50plus.or.kr** | 웹 크롤링 | 아웃바운드 | 일자리 수집 |

### 7.1 Telegram 커맨드

| 커맨드 | 기능 |
|--------|------|
| `/status` | 현재 KPI 요약 (DAU, 게시글, 수익) |
| `/agents` | 에이전트 상태 (마지막 실행, 성공/실패) |
| `/approve N` | 어드민 큐 항목 승인 |
| `/stop` | 전체 자동화 긴급 중지 |
| `/run CEO` | 특정 에이전트 수동 실행 |
| `/cost` | 이번 달 비용 현황 |

---

## 8. MCP 서버

| MCP | 용도 | 상태 |
|-----|------|------|
| **context7** | 라이브러리 문서 조회 | 활성 |
| **figma-write** | Figma 디자인 연동 | 활성 |
| **github** | GitHub 이슈/PR 관리 | 활성 |
| **sequential-thinking** | 복잡한 추론 체이닝 | 활성 |

---

## 9. 시니어 친화 UI 원칙

| 항목 | 규칙 |
|------|------|
| **터치 타겟** | 최소 52×52px |
| **폰트 최소** | 15px (caption/배지만), 본문 18px 베이스 |
| **브랜드 컬러** | `--color-primary: #FF6F61` (코랄) |
| **버튼 높이** | 52px (모바일) / 48px (데스크탑) |
| **모달** | 모바일=하단 풀스크린 시트, 데스크탑=중앙 팝업 |
| **네비게이션** | 상단 아이콘 메뉴 + 플로팅 FAB (하단 탭바 없음) |
| **폰트 크기 설정** | 사용자가 NORMAL / LARGE / XLARGE 선택 가능 |

---

## 10. 페이지 구조

### 10.1 사용자 페이지 (47개)

| 경로 | 설명 |
|------|------|
| `/` | 홈 (히어로 슬라이더, 일자리, 커뮤니티, 매거진, 트렌딩) |
| `/about` | 서비스 소개 |
| `/login` | 카카오 로그인 |
| `/onboarding` | 신규 회원 온보딩 (닉네임, 관심사) |
| `/jobs` | 일자리 목록 (필터, 퀵태그) |
| `/jobs/[id]` | 일자리 상세 (JSON-LD, Pick포인트, Q&A) |
| `/magazine` | 매거진 목록 |
| `/magazine/[id]` | 매거진 상세 |
| `/best` | 인기글 |
| `/search` | 통합 검색 |
| `/community/[boardSlug]` | 게시판 (stories, humor, weekly) |
| `/community/[boardSlug]/[postId]` | 게시글 상세 |
| `/community/[boardSlug]/[postId]/edit` | 게시글 수정 |
| `/community/write` | 글쓰기 (TipTap 에디터) |
| `/my` | 마이페이지 |
| `/my/posts` | 내 게시글 |
| `/my/comments` | 내 댓글 |
| `/my/scraps` | 스크랩 |
| `/my/notifications` | 알림 |
| `/my/settings` | 설정 (닉네임, 폰트, 차단, 탈퇴) |
| `/faq` | 자주 묻는 질문 |
| `/terms` | 이용약관 |
| `/privacy` | 개인정보처리방침 |
| `/rules` | 커뮤니티 규칙 |
| `/contact` | 문의 |
| `/offline` | 오프라인 안내 |

### 10.2 어드민 페이지

| 경로 | 설명 |
|------|------|
| `/admin/login` | 어드민 로그인 |
| `/admin` | 대시보드 |
| `/admin/members` | 회원 관리 |
| `/admin/content` | 콘텐츠 관리 |
| `/admin/reports` | 신고 관리 |
| `/admin/analytics` | 분석 |
| `/admin/banners` | 배너 관리 |
| `/admin/settings` | 설정 (게시판, 금칙어, 광고) |

### 10.3 API 라우트 (17+개)

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/api/auth/[...nextauth]` | * | NextAuth 핸들러 |
| `/api/health` | GET | 헬스체크 |
| `/api/posts` | GET, POST | 게시글 목록/생성 |
| `/api/posts/[postId]` | GET, PATCH, DELETE | 게시글 CRUD |
| `/api/comments` | GET, POST | 댓글 CRUD |
| `/api/drafts/[id]` | GET, PUT, DELETE | 임시저장 |
| `/api/best` | GET | 인기글 |
| `/api/jobs` | GET | 일자리 목록 |
| `/api/magazine` | GET | 매거진 |
| `/api/search` | GET | 통합 검색 |
| `/api/notifications` | GET, PATCH | 알림 |
| `/api/notifications/unread-count` | GET | 읽지 않은 알림 수 |
| `/api/uploads` | POST | 이미지 업로드 (R2) |
| `/api/ad-click` | POST | 광고 클릭 추적 |
| `/api/events` | POST | 분석 이벤트 로깅 |
| `/api/telegram` | POST | Telegram Webhook |
| `/api/bot/*` | * | 봇 API (check, jobs, posts, logs) |

---

## 11. 컴포넌트 구조

### 11.1 카테고리별

| 카테고리 | 개수 | 주요 컴포넌트 |
|---------|------|-------------|
| **UI (공통)** | 12개 | Button, Card, Input, Badge, BottomSheet, Toast, Skeleton |
| **레이아웃** | 6개 | Header, GNB, Footer, MainLayout, FAB, IconMenu |
| **홈** | 9개 | HeroSlider, JobSection, CommunitySection, MagazineSection, TrendingSection |
| **커뮤니티** | 13개 | PostCard, CommentSection, ActionBar, TipTapEditor, ReportModal |
| **일자리** | 3개 | JobFilterButton, JobFilterPanel, JobQuickTags |
| **검색** | 3개 | SearchForm, SearchResults, SearchTabs |
| **마이페이지** | 8개 | NicknameSettings, FontSizeSettings, BlockedUserList, WithdrawSection |
| **인증** | 3개 | LoginForm, LoginPromptModal, OnboardingForm |
| **광고** | 3개 | AdSlot, AdClickTracker, CoupangCPS |
| **어드민** | 11개 | MemberTable, ContentTable, ReportTable, BannerManager |
| **공통** | 7개 | UserAvatar, ShareButton, OfflineBanner, PageViewTracker |

---

## 12. 폴더·파일 구조

```
/Users/yanadoo/Documents/New_Claude_agenotmatter/
│
├── 📁 src/                          # 메인 애플리케이션
│   ├── 📁 app/                      # Next.js App Router
│   │   ├── layout.tsx               # 루트 레이아웃 (폰트, 메타데이터)
│   │   ├── error.tsx                # 글로벌 에러 바운더리
│   │   ├── not-found.tsx            # 404
│   │   ├── sitemap.ts              # 동적 사이트맵
│   │   ├── robots.ts               # SEO robots
│   │   ├── 📁 (main)/              # 메인 레이아웃 그룹
│   │   │   ├── page.tsx            # 홈
│   │   │   ├── 📁 jobs/            # 일자리
│   │   │   ├── 📁 magazine/        # 매거진
│   │   │   ├── 📁 community/       # 커뮤니티 (게시판)
│   │   │   ├── 📁 best/            # 인기글
│   │   │   ├── 📁 search/          # 검색
│   │   │   ├── 📁 my/              # 마이페이지
│   │   │   └── 📁 about|faq|...    # 정보 페이지
│   │   ├── 📁 admin/               # 어드민 패널
│   │   │   ├── login/
│   │   │   └── (panel)/            # 어드민 대시보드 그룹
│   │   ├── 📁 api/                 # API 라우트
│   │   │   ├── auth/               # NextAuth
│   │   │   ├── posts/              # 게시글 CRUD
│   │   │   ├── comments/           # 댓글
│   │   │   ├── jobs/               # 일자리
│   │   │   ├── telegram/           # Telegram Webhook
│   │   │   ├── bot/                # 봇 API
│   │   │   └── ...                 # 기타 (uploads, events, ad-click)
│   │   ├── login/
│   │   └── onboarding/
│   │
│   ├── 📁 components/              # React 컴포넌트 (77+개)
│   │   ├── 📁 ui/                  # 공통 UI (Button, Card, Input...)
│   │   ├── 📁 layouts/             # 레이아웃 (Header, GNB, Footer, FAB)
│   │   ├── 📁 icons/               # SVG 아이콘
│   │   ├── 📁 ad/                  # 광고 (AdSlot, CoupangCPS)
│   │   ├── 📁 common/              # 공통 기능 (Avatar, Toast, Tracker)
│   │   ├── 📁 admin/               # 어드민 전용
│   │   └── 📁 features/            # 기능별
│   │       ├── home/               # 홈 섹션들
│   │       ├── community/          # 커뮤니티 (PostCard, ActionBar...)
│   │       ├── jobs/               # 일자리 필터
│   │       ├── search/             # 검색
│   │       ├── my/                 # 마이페이지
│   │       ├── auth/               # 인증
│   │       ├── login/              # 로그인
│   │       └── onboarding/         # 온보딩
│   │
│   ├── 📁 lib/                     # 유틸리티 & 비즈니스 로직
│   │   ├── prisma.ts               # Prisma 클라이언트 (Supabase 풀링)
│   │   ├── auth.ts                 # NextAuth 설정 (카카오)
│   │   ├── auth.config.ts          # NextAuth 컨피그
│   │   ├── admin-auth.ts           # 어드민 인증
│   │   ├── bot-auth.ts             # 봇 API 인증
│   │   ├── format.ts               # 날짜/급여 포맷팅
│   │   ├── sanitize.ts             # HTML 새니타이즈
│   │   ├── grade.ts                # 등급 계산
│   │   ├── banned-words.ts         # 금칙어 필터
│   │   ├── rate-limit.ts           # Rate limiting
│   │   ├── r2.ts                   # Cloudflare R2
│   │   ├── utils.ts                # cn() 유틸
│   │   ├── errors.ts               # 커스텀 에러 클래스
│   │   ├── 📁 actions/             # Server Actions (13개)
│   │   └── 📁 queries/             # DB 쿼리 함수 (6개)
│   │
│   ├── 📁 types/                   # 타입 정의
│   │   ├── api.ts                  # API 타입
│   │   └── next-auth.d.ts          # NextAuth 타입 확장
│   │
│   ├── 📁 generated/prisma/        # Prisma 자동 생성
│   ├── 📁 __tests__/               # 테스트 (10개)
│   └── middleware.ts               # 라우트 보호 미들웨어
│
├── 📁 agents/                       # AI 에이전트 시스템
│   ├── 📁 core/                    # 기반 인프라
│   │   ├── agent.ts                # BaseAgent 추상 클래스
│   │   ├── constitution.yaml       # 회사 헌법
│   │   ├── types.ts                # 에이전트 타입
│   │   ├── db.ts                   # Prisma 클라이언트
│   │   ├── notifier.ts             # 알림 (Telegram + DB)
│   │   └── telegram-commander.ts   # 텔레그램 커맨드
│   ├── 📁 cron/                    # 크론 스케줄러
│   │   ├── runner.ts
│   │   └── schedules.yaml
│   ├── 📁 ceo/                     # CEO 에이전트
│   ├── 📁 cto/                     # CTO 에이전트
│   ├── 📁 cmo/                     # CMO 에이전트
│   ├── 📁 cpo/                     # CPO 에이전트
│   ├── 📁 cdo/                     # CDO 에이전트
│   ├── 📁 cfo/                     # CFO 에이전트
│   ├── 📁 coo/                     # COO 에이전트 (일자리, 모더레이션)
│   ├── 📁 seed/                    # 시드봇 (10명 페르소나)
│   └── 📁 cafe/                    # 카페 크롤러
│
├── 📁 prisma/                       # DB 스키마
│   ├── schema.prisma               # 22개 모델, 20개 Enum
│   ├── seed.ts                     # 시드 데이터
│   └── 📁 migrations/             # 마이그레이션 히스토리
│
├── 📁 scripts/                      # 유틸리티 스크립트
│   ├── create-admin.ts             # 어드민 계정 생성
│   └── fix-existing-jobs.ts        # 기존 일자리 데이터 정리
│
├── 📁 public/                       # 정적 파일
│   ├── logo.svg                    # 로고
│   ├── manifest.json               # PWA 매니페스트
│   └── sw.js                       # 서비스 워커
│
├── 📁 .github/workflows/           # CI/CD + 에이전트 크론 (9개)
│
├── 📁 docs/                         # 문서
│   ├── 📁 prd/                     # PRD 문서 (A~G)
│   ├── 📁 reports/                 # 작업 보고서
│   └── SERVICE_ARCHITECTURE.md     # ← 이 문서
│
├── 📁 e2e/                          # E2E 테스트
├── CLAUDE.md                        # Claude Code 지시사항
├── next.config.js                   # Next.js 설정
├── tailwind.config.ts               # Tailwind 설정
├── tsconfig.json                    # TypeScript 설정
├── .env.example                     # 환경변수 템플릿
└── package.json                     # 의존성 + 스크립트
```

---

## 13. 예산

| 항목 | 월 비용 |
|------|--------|
| 에이전트 AI (7 C-level + SEED) | ~$15 (최적화 후) |
| 일자리 스크래퍼 AI | ~$3 |
| SNS 자동화 AI | ~$2 |
| Vercel Hosting | $0 (Hobby) |
| Supabase DB | $0 (Free tier) |
| GitHub Actions | $0 (Free 2,000분/월) |
| Cloudflare R2 | $0 (Free tier) |
| Cloudflare DNS | $0 |
| 도메인 (가비아) | ~$1.5 (연 $18) |
| **합계** | **~$21.5/월** |
| **예산 상한** | **$50/월** |

---

## 14. 현재 상태 & 남은 작업

### 완료됨
- 전체 코드 구현 (47페이지, 17+ API, 77+ 컴포넌트)
- 에이전트 시스템 ACTIVE
- 일자리 자동 수집 파이프라인
- 시드 페르소나 10명
- 카페 크롤링 파이프라인
- 수익 컴포넌트 (AdSlot, CoupangCPS)
- SNS 자동 포스팅 에이전트
- SEO JSON-LD + sitemap 최적화

### 창업자 대기 작업
- [ ] 도메인 만기 연장 (2026-04-25)
- [ ] 커스텀 도메인 연결 (Cloudflare → Vercel)
- [ ] Telegram Webhook 등록
- [ ] GitHub Actions secrets 설정
- [ ] Google AdSense 승인 신청
- [ ] 쿠팡 파트너스 가입

### 향후 확장 (Phase 3+)
- 페르소나 20~30명 확장
- CEO 자동 의사결정 프레임워크
- CDO 퍼널 분석기
- A/B 테스트 시스템
- Google Analytics / Search Console MCP 연동

---

## 문서 업데이트 가이드

### 이 문서를 언제 업데이트해야 하는가?

| 변경 사항 | 업데이트할 섹션 |
|-----------|---------------|
| 새 에이전트 추가 | 5. AI 에이전트 시스템 |
| 새 페이지/API 추가 | 10. 페이지 구조, 12. 폴더 구조 |
| 새 컴포넌트 추가 | 11. 컴포넌트 구조 |
| DB 모델 변경 | 4. 데이터베이스 스키마 |
| 워크플로우 변경 | 6. GitHub Actions |
| 외부 연동 추가 | 7. Webhook & 외부 연동 |
| MCP 추가/제거 | 8. MCP 서버 |
| 환경변수 추가 | 3.1 환경 변수 |

### 업데이트 방법

Claude Code에게 다음과 같이 요청:

```
docs/SERVICE_ARCHITECTURE.md 에 [변경 내용] 반영해줘
```

예시:
- "새 에이전트 추가했으니 SERVICE_ARCHITECTURE.md 업데이트해줘"
- "새 API 라우트 만들었으니 SERVICE_ARCHITECTURE.md에 반영해줘"

### 관련 문서 위치

| 문서 | 경로 | 용도 |
|------|------|------|
| **이 문서 (종합 아키텍처)** | `docs/SERVICE_ARCHITECTURE.md` | 전체 서비스 구조 |
| Claude Code 지시사항 | `CLAUDE.md` | 코딩 규칙, 기술 스택 |
| 에이전트 지시사항 | `agents/CLAUDE.md` | 에이전트 작성 규칙 |
| 회사 헌법 | `agents/core/constitution.yaml` | 서비스 정체성, 가드레일 |
| PRD 문서 | `docs/prd/` | 기능별 상세 기획 |
| 작업 보고서 | `docs/reports/` | 작업 이력 |
| DB 스키마 | `prisma/schema.prisma` | 테이블 정의 |
| 환경변수 템플릿 | `.env.example` | 필요한 환경변수 목록 |
