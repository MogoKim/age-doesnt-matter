# 우리 나이가 어때서 (우나어) — 서비스 아키텍처 종합 문서

> **최종 업데이트**: 2026-03-25 (v5 — SNS 바이럴 마케팅 실험 시스템 + Skills 레지스트리)
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
| **운영 커뮤니케이션** | Slack (Bot + Webhook) | - |

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
- CSP: Kakao SDK, YouTube, Slack API 허용

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
│  │ - Slack Webhook            │                           │
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
      │  Slack   │ │ Supabase │ │ Anthropic│
      │ (운영)   │ │ (DB R/W) │ │ (AI)     │
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
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | 에이전트 운영 채널 |
| `SLACK_SIGNING_SECRET` | Slack 서명 시크릿 | Webhook 검증 |
| `SLACK_CHANNEL_*` | 채널별 ID | 각 채널 메시지 발송 |
| `X_API_KEY` / `X_API_SECRET` | X (Twitter) OAuth 1.0a | CMO SNS 포스팅 |
| `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | X 사용자 토큰 | CMO SNS 포스팅 |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | Threads OAuth | CMO SNS 포스팅 |
| `THREADS_ACCESS_TOKEN` | Threads 장기 토큰 (60일) | CMO SNS 포스팅 |
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

┌── SNS 마케팅 실험 ─────────────┐
│ SocialPost       SNS 게시물      │
│ SocialExperiment A/B 실험 관리   │
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
| **SocialPlatform** | THREADS, X |
| **SocialPostStatus** | DRAFT, QUEUED, APPROVED, POSTED, FAILED |
| **ExperimentStatus** | PLANNING, ACTIVE, COMPLETED, ANALYZED |

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
                    │ 창업자    │ Slack #ceo-창업자
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
│       ││팅+실험││콘텐츠편성 ││       ││       ││       │
│       ││전략+리││          ││       ││       ││       │
│       ││뷰+메트││          ││       ││       ││       │
│       ││릭수집 ││          ││       ││       ││       │
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
| **CMO** | `cmo/social-poster.ts` | 매일 09/15/19시 | Haiku | Threads/X 실험 인식 게시 (홍보 믹스 60/25/15) |
| **CMO** | `cmo/social-metrics.ts` | 매일 20:00 | AI 불필요 | 48시간 내 게시물 Threads/X 메트릭 수집 |
| **CMO** | `cmo/social-reviewer.ts` | 월요일 10:00 | Haiku | 주간 실험 분석 — 통제/실험군 비교, 인사이트 도출 |
| **CMO** | `cmo/social-strategy.ts` | 월요일 10:15 | Sonnet | 주간 전략 설계 — 실험 로드맵 + 트렌드 교차 참조 |
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
| `core/notifier.ts` | Slack + 어드민큐 알림 |
| `core/slack-commander.ts` | Slack 양방향 커맨드 (/status, /agents, /stop 등) |
| `cmo/platforms/x-client.ts` | X (Twitter) API v2 래퍼 — OAuth 1.0a 서명 + 게시 + 메트릭 |
| `cmo/platforms/threads-client.ts` | Threads API 래퍼 — 게시 + 메트릭 + 토큰 60일 갱신 |
| `skills/registry.ts` | 검증된 SNS 전략 스킬 레지스트리 (승률 기반 가중 선택) |
| `skills/types.ts` | ProvenSkill, SkillSuggestion 타입 정의 |

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
      └→ Step 6: Slack #로그-일자리 요약 알림
```

### 5.5 SNS 바이럴 마케팅 파이프라인 (CMO)

```
┌─────────────────────────────────────────────────────┐
│              OBSERVE (매일 20:00)                     │
│  social-metrics.ts                                   │
│  → Threads/X API에서 메트릭 수집                       │
│  → SocialPost.metrics 업데이트                        │
│  → 이상치 감지 시 Slack 알림 (참여 ≥ 10)               │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│              ANALYZE (매주 월 10:00)                   │
│  social-reviewer.ts                                  │
│  → 통제군 vs 실험군 비교 (A/B 테스트)                   │
│  → 콘텐츠 유형/톤/시간/페르소나별 성과 랭킹               │
│  → AI 인사이트 도출 → SocialExperiment.learnings       │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│              ACT (매주 월 10:15)                       │
│  social-strategy.ts                                  │
│  → 누적 학습 + 카페 트렌드 + CMO 트렌드 교차 참조       │
│  → 8주 로드맵 기반 다음 실험 설계                       │
│  → 새 SocialExperiment 생성                           │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─────────────────────────────────────────────────────┐
│              EXECUTE (매일 09/15/19시)                 │
│  social-poster.ts                                    │
│  → 활성 실험 config 읽기 → 콘텐츠 유형/톤/페르소나 결정  │
│  → 홍보 믹스: 60% PURE / 25% SOFT / 15% DIRECT        │
│  → 4명 SNS 페르소나 (영숙이맘, 은퇴신사, 웃음보, 건강박사)│
│  → Threads + X 게시 → SocialPost DB 저장               │
└─────────────────────────────────────────────────────┘
```

**8주 실험 로드맵**:

| 주차 | 실험 변수 | 통제군 | 실험군 |
|------|----------|--------|--------|
| Week 1 | 베이스라인 | 모든 유형 골고루 | (없음) |
| Week 2 | 콘텐츠 유형 | PERSONA | COMMUNITY |
| Week 3 | 톤/어조 | warm | humorous |
| Week 4 | 게시 시간 | afternoon | evening |
| Week 5 | 홍보 강도 | PURE | SOFT |
| Week 6 | 포맷 | short | list |
| Week 7 | 페르소나 | A (영숙이맘) | C (웃음보) |
| Week 8 | 인터랙션 | statement | question |
| Week 9+ | **AI 자동 결정** | 이전 우승자 | 새 변수 |

**졸업 기준**: 8주 후 70% exploit (검증된 우승 공식) + 30% explore (새 실험). 우승 공식이 2주 연속 하락 시 재탐색.

**Skills 레지스트리**: 반복 우승 패턴 → `agents/skills/registry.ts`에 코드화 → 승률 기반 가중 랜덤 선택으로 exploit 모드 자동 적용.

### 5.6 시드 페르소나 (SEED)

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

### 5.7 에이전트 규칙 (헌법 핵심)

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
| `agents-social.yml` | 09/15/19시 + 20시 + 월 10:00/10:15 | CMO (SNS 포스팅·메트릭·리뷰·전략) |
| `agents-cafe.yml` | 09, 13, 19시 | CAFE (네이버 카페 크롤링) |

### 6.3 전체 타임라인 (KST)

```
08:30  ░░ CAFE 크롤링 (로컬)
09:00  ██ CEO 모닝사이클 | SEED 활동 | COO 모더레이션 | CMO SNS포스팅(아침)
10:00  ██ CMO 트렌드분석 | SEED 활동
 (월)  ██ CMO 리뷰(10:00) → 전략(10:15) [주간 실험 분석 + 설계]
10:30  ██ CEO 주간리포트 (월요일, SNS 메트릭 포함)
11:00  ██ CPO UX분석
12:00  ██ COO 일자리수집
12:30  ░░ CAFE 크롤링 (로컬)
13:00  ░░ CAFE 크롤링 (Actions)
14:00  ██ COO 콘텐츠편성 | SEED 활동
15:00  ██ CMO SNS포스팅(오후) | COO 모더레이션
16:00  ██ COO 일자리수집 | SEED 활동
18:30  ░░ CAFE 크롤링 (로컬)
19:00  ██ CMO SNS포스팅(저녁) | SEED 활동 | CAFE 크롤링 (Actions)
20:00  ██ COO 일자리수집 | CMO SNS메트릭수집
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
| **Slack Events** | `/api/slack` | 인바운드 | 슬래시 커맨드, 인터랙티브 |
| **Slack Web API** | `slack.com/api/*` | 아웃바운드 | 메시지 발송, 채널 관리 |
| **Anthropic API** | `api.anthropic.com` | 아웃바운드 | AI 에이전트 호출 |
| **Cloudflare R2** | `*.r2.cloudflarestorage.com` | 아웃바운드 | 이미지 업로드/서빙 |
| **Threads API** | `graph.threads.net/*` | 아웃바운드 | SNS 게시 + 메트릭 수집 (OAuth 2.0, 60일 토큰) |
| **X API v2** | `api.x.com/2/*` | 아웃바운드 | SNS 게시 + 메트릭 수집 (OAuth 1.0a HMAC-SHA1) |
| **Threads OAuth** | `/api/threads/auth`, `/api/threads/callback` | 인바운드 | Threads 토큰 발급 (1회성) |
| **50plus.or.kr** | 웹 크롤링 | 아웃바운드 | 일자리 수집 |

### 7.1 Slack 운영 채널 아키텍처

Telegram에서 Slack으로 전환한 이유:
- 에이전트 간 **구조화된 채널 분리** 필요 (회의, 로그, 알림이 한 곳에 섞이면 관리 불가)
- **미팅 로그 아카이브** (스레드 기반으로 회의별 기록 분리)
- 창업자 ↔ CEO **전용 채널** (지시/보고가 알림과 섞이지 않음)
- **알림 수준 분리** (긴급 vs 일반 vs 로그)

#### 채널 구조 전체 맵

```
Slack Workspace: 우나어-ops

┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  ★ 창업자 전용 (최우선 확인)                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ #ceo-창업자       │  │ #일일-브리핑      │  │ #주간-리포트   │  │
│  │ CEO↔창업자 양방향 │  │ CEO→창업자 매일   │  │ CEO→창업자 주간│  │
│  │ 지시·승인·KPI    │  │ 09:00 KPI 스냅샷  │  │ 월 10:00 종합 │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                  │
│  ★ 에이전트 협업                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ #에이전트-회의실   │  │ #회의록           │                     │
│  │ 주간/긴급/1:1    │  │ 스레드 기반 아카이브│                     │
│  │ CEO 의장         │  │ 자동 정리         │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                  │
│  ★ 알림 (심각도별 분리)                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ #알림-긴급        │  │ #알림-시스템       │  │ #알림-KPI     │  │
│  │ 🔴 서비스다운     │  │ 🟡 헬스체크       │  │ 🟡 KPI 변동  │  │
│  │ KPI 20%+하락     │  │ 에러로그          │  │ 임계값 근접    │  │
│  │ 비용 $40 초과    │  │ 배포결과          │  │ 트렌드 변화    │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│                                                                  │
│  ★ 자동화 로그 (묵음 가능, 필요 시 확인)                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │#로그-일자리 │ │#로그-콘텐츠│ │#로그-마케팅│ │#로그-비용  │   │
│  │COO 수집결과│ │SEED/매거진 │ │CMO SNS결과 │ │CFO 비용/수익│  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│                                                                  │
│  ★ 성장                                                          │
│  ┌──────────────────┐                                           │
│  │ #실험-보드        │                                           │
│  │ Gate1→진행→Gate2 │                                           │
│  │ →회고 전체 관리   │                                           │
│  └──────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 채널별 상세 설계

#### 카테고리 A: 창업자 전용 채널

| 채널 | 용도 | 발신→수신 | 빈도 | 알림 설정 |
|------|------|----------|------|----------|
| **#ceo-창업자** | CEO ↔ 창업자 양방향 소통. KPI 지시, 전략 논의, Gate 1 승인(/approve), 긴급 보고, 피드백 | 양방향 | 수시 | 모든 메시지 |
| **#일일-브리핑** | CEO 일일 KPI 스냅샷 + 에이전트 활동 요약 + 창업자 대기건 | CEO→창업자 | 매일 09:00 | 모든 메시지 |
| **#주간-리포트** | CEO 주간 KPI 종합 + 에이전트 회의 결과 + Gate 1 대기 | CEO→창업자 | 매주 월 10:00 | 모든 메시지 |

```
#ceo-창업자 사용 예시:

[창업자 → CEO]
  "이번 달은 DAU보다 리텐션에 집중해"
  → CEO: 확인 → 주간 회의에서 전 에이전트에 방향 전파

[CEO → 창업자]
  "⛔ Gate 1 대기: 모바일 UX 가설 — 승인/피드백 선택"
  → 창업자: /approve 또는 /feedback "검색이 더 중요하다"

[CEO → 창업자 긴급]
  "🚨 DAU 3일 연속 하락. 원인 분석 중. 회의 소집합니다."
```

#### 카테고리 B: 에이전트 협업 채널

| 채널 | 용도 | 참여자 | 빈도 |
|------|------|--------|------|
| **#에이전트-회의실** | 주간/긴급/1:1 회의 진행. CEO가 의장. | 전체 에이전트 | 주 1~2회 + 긴급 |
| **#회의록** | 회의 결과 자동 정리. 스레드 기반으로 회의별 분리. | CEO(작성), 전체(열람) | 회의 후 |

```
#에이전트-회의실 메시지 예시:

📋 주간 회의 시작 (2026-03-31 월)
─────────────────────────────
참석: CEO, CTO, CMO, CPO, CDO, CFO, COO

[CDO 보고] KPI: DAU 45(+5), 댓글 -10%, UGC 비율 12%
[CTO 보고] 헬스체크 정상, 에러 2건(재시도 성공)
[CMO 보고] 트렌드: '봄 나들이', X 팔로워 +12
[CPO 보고] /jobs 바운스율 38%(-2%p)
[CFO 보고] 이번 달 $19.5 / $50
[COO 보고] 일자리 38건 수집, 모더레이션 정상

[문제 정의] 댓글 -10% — 커뮤니티 활성화 약화
[가설 초안] "게시글에 질문형 마무리 추가 시 댓글 +20%"
→ #ceo-창업자 로 Gate 1 전달 완료
─────────────────────────────
```

#### 카테고리 C: 알림 채널 (심각도별)

| 채널 | 트리거 | 발신 에이전트 | 알림 수준 |
|------|--------|-------------|----------|
| **#알림-긴급** | 서비스 다운, KPI 20%+ 하락 2일 연속, 비용 $40 초과, 법적 리스크 콘텐츠 | CTO/CDO/CFO/COO | 🔴 **즉시 알림** (소리+배너) |
| **#알림-시스템** | 헬스체크 결과, 에러 로그, 배포 결과, 응답 속도 | CTO | 🟡 묵음 가능 |
| **#알림-KPI** | KPI 일일 변동, 임계값 근접, 이상치 감지, 트렌드 변화 | CDO/CEO | 🟡 묵음 가능 |

```
#알림-긴급 메시지 예시:

🚨 [CTO] 서비스 헬스체크 실패
  시각: 2026-03-31 14:02 KST
  증상: /api/health 응답 시간 초과 (>10초)
  DB 상태: 커넥션 풀 90% 사용 중
  조치: CEO에게 긴급 회의 소집 요청
  → #ceo-창업자 에도 동시 알림
```

#### 카테고리 D: 자동화 로그 채널

| 채널 | 내용 | 발신 | 빈도 |
|------|------|------|------|
| **#로그-일자리** | 일자리 스크래핑 결과 (수집 건수, 성공/실패, Waterfall 통계) | COO | 3회/일 |
| **#로그-콘텐츠** | SEED 페르소나 활동 결과, 매거진 편성, 콘텐츠 스케줄 | COO/SEED | 하루 6회+ |
| **#로그-마케팅** | SNS 포스팅 결과, SEO 분석 결과, 트렌드 리포트 | CMO | 매일 |
| **#로그-비용** | 일일 API 비용, 월 누적, 수익 데이터 (AdSense/CPS) | CFO | 매일 23:00 |

#### 카테고리 E: 성장 채널

| 채널 | 용도 | 참여 |
|------|------|------|
| **#실험-보드** | 실험 라이프사이클 전체 관리. Gate 1 제출 → 승인 → 실험 설계 → 실행 → Gate 2 → 회고. 각 실험을 스레드로 관리. | CEO(주도), 전체 |

### 7.3 Slack 커맨드 (슬래시 커맨드)

| 커맨드 | 채널 | 기능 |
|--------|------|------|
| `/status` | #ceo-창업자 | 현재 KPI 요약 (DAU, 게시글, 수익) |
| `/agents` | #ceo-창업자 | 에이전트 상태 (마지막 실행, 성공/실패) |
| `/approve` | #ceo-창업자 | Gate 1 승인 (실험 진행 허가) |
| `/feedback [내용]` | #ceo-창업자 | Gate 1 피드백 (가설 수정 요청) |
| `/reject [이유]` | #ceo-창업자 | Gate 1 기각 |
| `/stop` | #ceo-창업자 | 전체 자동화 긴급 중지 |
| `/run [에이전트명]` | #ceo-창업자 | 특정 에이전트 수동 실행 |
| `/cost` | #ceo-창업자 | 이번 달 비용 현황 |
| `/kpi` | #ceo-창업자 | KPI 전체 현황 (목표 vs 실적) |
| `/meeting` | #에이전트-회의실 | 수동 회의 소집 |
| `/social` | #ceo-창업자 | 이번 주 SNS 성과 요약 (게시 수, 참여, 최고 게시물) |
| `/experiment` | #ceo-창업자 | 현재 실험 상태 (가설, 진행률, 중간 결과) |

### 7.4 Slack Bot 기술 구현

```
[구현 방식]
1. Slack App 생성 (api.slack.com/apps)
   - Bot Token Scopes: chat:write, channels:read, commands, incoming-webhook
   - Event Subscriptions: slash commands → /api/slack

2. Vercel Serverless Function
   - /api/slack (POST) — Slack Events + 슬래시 커맨드 수신
   - Slack Signing Secret으로 요청 검증

3. 에이전트 → Slack 발송
   - core/notifier.ts에서 Slack Web API (chat.postMessage) 사용
   - 채널별 SLACK_CHANNEL_* 환경 변수로 라우팅

4. 채널 자동 라우팅 규칙
   notifier.send({
     channel: "CEO_FOUNDER",    // → #ceo-창업자
     channel: "DAILY_BRIEFING", // → #일일-브리핑
     channel: "ALERT_URGENT",   // → #알림-긴급
     channel: "LOG_JOBS",       // → #로그-일자리
     ...
   })
```

### 7.5 Telegram → Slack 마이그레이션 계획

| 항목 | 변경 전 (Telegram) | 변경 후 (Slack) |
|------|-------------------|----------------|
| 환경 변수 | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL_*` |
| 알림 발송 | `core/notifier.ts` → Telegram Bot API | `core/notifier.ts` → Slack Web API |
| 커맨드 수신 | `core/telegram-commander.ts` → `/api/telegram` | `core/slack-commander.ts` → `/api/slack` |
| 일일 브리핑 | 1개 채팅방에 모든 메시지 | #일일-브리핑 전용 채널 |
| 긴급 알림 | 일반 알림과 동일 채팅방 | #알림-긴급 (별도 알림 설정) |
| 회의록 | 없음 (메시지에 혼재) | #회의록 (스레드 기반 아카이브) |
| Gate 1 승인 | 채팅방 /approve | #ceo-창업자 /approve |
| API 엔드포인트 | `/api/telegram` (POST) | `/api/slack` (POST) |

```
마이그레이션 단계:
1. Slack Workspace 생성 (우나어-ops) ← 창업자
2. Slack App 생성 + Bot 설정 ← 창업자
3. 13개 채널 생성 ← 창업자 (또는 Claude가 API로)
4. 환경 변수 교체 (GitHub Secrets + Vercel) ← 창업자
5. notifier.ts 리팩토링 (Telegram → Slack API) ← Claude
6. slack-commander.ts 구현 ← Claude
7. /api/telegram → /api/slack 교체 ← Claude
8. 각 에이전트 알림 채널 매핑 ← Claude
9. 테스트: 각 채널에 테스트 메시지 발송 ← Claude
10. Telegram 코드 제거 ← Claude
```

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
| `/api/slack` | POST | Slack Events + 커맨드 |
| `/api/threads/auth` | GET | Threads OAuth 시작 (리다이렉트) |
| `/api/threads/callback` | GET | Threads OAuth 콜백 + 토큰 교환 |
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
│   │   │   ├── slack/              # Slack Events + 커맨드
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
│   │   ├── notifier.ts             # 알림 (Slack + DB)
│   │   └── slack-commander.ts      # Slack 커맨드
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
- 전체 코드 구현 (47페이지, 19+ API, 77+ 컴포넌트)
- 에이전트 시스템 ACTIVE
- 일자리 자동 수집 파이프라인
- 시드 페르소나 10명
- 카페 크롤링 파이프라인
- 수익 컴포넌트 (AdSlot, CoupangCPS)
- SEO JSON-LD + sitemap 최적화
- **SNS 바이럴 마케팅 실험 시스템** (2026-03-25 구축 완료)
  - DB: SocialPost + SocialExperiment 모델
  - 플랫폼 API: X (OAuth 1.0a) + Threads (OAuth 2.0) 클라이언트
  - 게시 에이전트: social-poster (실험 인식 + 홍보 믹스 + 4명 페르소나)
  - 메트릭 수집: social-metrics (매일 20:00)
  - 주간 분석: social-reviewer (월 10:00, A/B 비교 + AI 인사이트)
  - 주간 전략: social-strategy (월 10:15, 8주 로드맵 + AI 실험 설계)
  - CEO 주간 리포트 SNS 섹션 추가
  - Slack 커맨드: /social, /experiment
  - Skills 레지스트리: 검증된 전략 코드화 (승률 기반 가중 선택)
  - Threads OAuth 토큰 발급 플로우 (/api/threads/auth → callback)

### 창업자 대기 작업
- [ ] 도메인 만기 연장 (2026-04-25)
- [ ] 커스텀 도메인 연결 (Cloudflare → Vercel)
- [ ] Slack Workspace + App 설정
- [ ] GitHub Actions secrets 설정 (기존 + X/Threads 토큰)
- [ ] Threads OAuth 토큰 발급 (age-doesnt-matter.com/api/threads/auth 접속)
- [ ] Google AdSense 승인 신청
- [ ] 쿠팡 파트너스 가입

### 향후 확장 (Phase 3+)
- 페르소나 20~30명 확장
- CEO 자동 의사결정 프레임워크
- CDO 퍼널 분석기
- 카카오톡 채널 / 네이버 밴드 / YouTube Shorts 확장
- Google Analytics / Search Console MCP 연동

---

## 15. KPI 프레임워크 — CEO와 창업자의 공동 경영 언어

### 15.1 왜 KPI가 성장 루프보다 먼저인가

```
성장 루프의 DATA 단계가 "무엇을 수집할 것인가?"를 결정하려면
먼저 "우리가 지금 가장 중요하게 보는 숫자가 무엇인가?"가 정의되어야 한다.

KPI 없는 성장 루프:
  DATA(뭘 봐야 하지?) → PROBLEM(뭐가 문제지?) → HYPOTHESIS(감으로 추측)
  → 결국 방향 없이 돌아감

KPI 있는 성장 루프:
  KPI(DAU 500 목표인데 현재 120) → DATA(DAU 관련 지표 심층 수집)
  → PROBLEM(가입 후 7일 리텐션 15%가 병목) → HYPOTHESIS(온보딩 개선하면 25%로)
  → 방향이 명확함

결론: KPI는 성장 루프의 나침반이다. 나침반 없이 항해하지 않는다.
```

### 15.2 KPI 트리 — 우나어 버전

```
                    ┌─────────────────────┐
                    │  ⭐ North Star Metric │
                    │  주간 활성 사용자(WAU) │
                    │  (커뮤니티+일자리 활동) │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │  성장 지표     │  │  참여 지표     │  │  수익 지표     │
     │  (Growth)     │  │  (Engagement) │  │  (Revenue)   │
     └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
            │                 │                  │
     ┌──────┴──────┐   ┌─────┴──────┐   ┌──────┴──────┐
     │ DAU          │   │ 글/댓글 수  │   │ AdSense RPM │
     │ 신규 가입     │   │ 체류 시간   │   │ CPS 전환율   │
     │ SEO 유입     │   │ 좋아요/스크랩│   │ 월 수익      │
     │ 소셜 유입     │   │ 재방문율    │   │              │
     └─────────────┘   └────────────┘   └─────────────┘
```

### 15.3 KPI 정의 테이블

| 카테고리 | KPI | 정의 | 현재 값 | 1차 목표 | 3개월 목표 | 담당 에이전트 |
|---------|-----|------|---------|---------|-----------|-------------|
| **North Star** | WAU | 주 1회 이상 방문+활동(글/댓글/좋아요) | 측정 전 | 50 | 300 | CEO (종합) |
| **성장** | DAU | 일일 방문자 수 | 측정 전 | 20 | 100 | CDO |
| **성장** | 신규 가입/주 | 주간 신규 회원 | 측정 전 | 10 | 50 | CDO |
| **성장** | SEO 유입/일 | 검색 유입 수 | 측정 전 | 10 | 50 | CMO |
| **참여** | 게시글/일 | 일일 게시글 (SEED 포함) | ~5 | 8 | 15 | COO |
| **참여** | 댓글/일 | 일일 댓글 (SEED 포함) | ~10 | 15 | 30 | COO |
| **참여** | UGC 비율 | 실제 사용자 콘텐츠 비율 | 0% | 10% | 30% | CDO |
| **참여** | 평균 체류시간 | 세션당 체류 시간 | 측정 전 | 1분 | 3분 | CPO |
| **참여** | 7일 리텐션 | 가입 후 7일 내 재방문율 | 측정 전 | 15% | 30% | CPO |
| **수익** | 월 수익 | AdSense + CPS 합산 | $0 | $10 | $50 | CFO |
| **수익** | 페이지뷰/DAU | 사용자당 페이지 조회 수 | 측정 전 | 3 | 5 | CPO |
| **안정성** | 업타임 | 서비스 가용률 | 측정 전 | 99% | 99.5% | CTO |
| **안정성** | 에이전트 성공률 | 크론 실행 성공/전체 | 측정 전 | 90% | 95% | CTO |

### 15.4 CEO — 창업자 KPI 커뮤니케이션 구조

```
CEO 에이전트의 핵심 역할은 "KPI 기반 경영 파트너"이다.
CEO는 단순히 보고만 하는 게 아니라, 창업자와 수시로 대화하면서
KPI를 함께 설정하고, 조정하고, 그에 따라 다른 에이전트들을 이끈다.

┌──────────────────────────────────────────────────────────────┐
│                    CEO ↔ 창업자 소통 구조                       │
│                                                               │
│  [수시]  창업자 → CEO: KPI 방향 지시                            │
│         "이번 달은 DAU보다 리텐션에 집중해"                       │
│         "수익은 아직 신경 쓰지 마, 사용자 확보가 먼저야"            │
│         CEO: 이해함 → 주간 회의에서 전 에이전트에 방향 전파         │
│                                                               │
│  [수시]  CEO → 창업자: KPI 이상 징후 보고                       │
│         "DAU가 3일 연속 하락 중입니다. 원인 분석하겠습니다"         │
│         "리텐션이 목표 대비 절반입니다. 회의 소집하겠습니다"          │
│                                                               │
│  [Daily] CEO → 창업자: 일일 브리핑 (#일일-브리핑)                │
│         오늘의 KPI 스냅샷 + 에이전트 활동 요약                    │
│                                                               │
│  [Weekly] CEO → 창업자: 주간 리포트 + 회의 결과 공유              │
│         KPI 변동 추이 + 에이전트 회의 결과 + 다음 주 방향 제안      │
│         "이번 주 에이전트 회의에서 나온 가설입니다 (Gate 1 대기)"    │
│                                                               │
│  [Monthly] CEO ↔ 창업자: KPI 목표 재설정                        │
│         "1차 목표 달성했습니다. 다음 목표를 설정해주세요"            │
│         창업자: "다음 달은 UGC 비율 20% + SEO 유입 30/일"        │
│         CEO: 확인 → 전 에이전트에 신규 목표 전파                   │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 15.5 CEO 일일 브리핑 — Slack #일일-브리핑 포맷

```
────────────────────────────────────────────
📊 우나어 일일 브리핑 (2026-03-25 화)

📈 오늘의 KPI
  DAU: 45 (+5 vs 어제)  ▲
  신규 가입: 3명
  게시글: 7건 (UGC 2건, SEED 5건)
  댓글: 12건 (UGC 4건, SEED 8건)
  일자리 조회: 89회

⚡ 주목 포인트
  • SEO 유입 12건 (전주 대비 +40%) — CMO 키워드 최적화 효과
  • /jobs 바운스율 38% → 35% 개선 중

🤖 에이전트 활동
  ✅ COO: 일자리 4건 수집 완료
  ✅ SEED: 게시글 5건, 댓글 8건 생성
  ✅ CTO: 헬스체크 정상
  ⚠️ CMO: X API 429 에러 1회 (재시도 성공)

📋 창업자 대기 건
  • Gate 1 대기: 1건 (모바일 UX 가설 — /approve 또는 /feedback)

/detail — 상세 보기 (→ #ceo-창업자 에서)
/kpi — KPI 전체 현황 (→ #ceo-창업자 에서)
────────────────────────────────────────────
```

### 15.6 CEO 주간 KPI 리포트 + 회의 결과 공유

```
────────────────────────────────────────────
📋 주간 경영 리포트 (3/18 ~ 3/24)

━━ KPI 변동 ━━
  WAU: 120 → 135 (+12.5%) 🟢
  DAU 평균: 38 → 45 (+18%) 🟢
  신규 가입: 22명 (목표 10 달성) 🟢
  UGC 비율: 8% → 12% (+4%p) 🟢
  리텐션 7일: 14% (목표 15% 미달) 🟡
  월 수익: $4.2 (목표 $10 대비 42%) 🟡

━━ 이번 주 에이전트 회의 결과 ━━
  [문제 정의] 7일 리텐션 14%가 가장 큰 병목
  [가설 초안] 가입 후 24시간 내 환영 댓글 + 추천 게시글 알림 시
             리텐션 20%로 개선 가능
  [참여 에이전트] CEO, CPO, COO, CDO

  ⛔ Gate 1 대기: 위 가설에 대한 승인/피드백 필요
  /approve — 이 방향으로 실험 설계
  /feedback — 수정 의견
  /reject — 기각

━━ 다음 주 중점 ━━
  창업자 방향에 따라 결정 (Gate 1 응답 대기 중)

━━ 비용 현황 ━━
  이번 달 누적: $18.5 / $50 (37%)
────────────────────────────────────────────
```

### 15.7 KPI 설정/변경 프로세스

```
KPI는 창업자가 설정하고, CEO가 운영한다.

[KPI 신규 설정]
  1. 창업자 → CEO: "이번 달 KPI는 DAU 50, UGC 비율 15%에 집중해"
  2. CEO: KPI 테이블 업데이트 + 각 에이전트에 관련 목표 전파
     CEO → CDO: "DAU 50 모니터링 강화, 일일 리포트에 DAU 트렌드 포함"
     CEO → COO: "UGC 촉진 위한 SEED 전략 조정 (대화형 콘텐츠 증가)"
     CEO → CMO: "DAU 기여 채널별 분석 요청"
  3. 각 에이전트: 다음 실행 시 반영

[KPI 목표 변경]
  창업자: "DAU는 달성됐으니 이제 리텐션 30%에 집중해"
  CEO: 확인 → 리텐션 관련 데이터 수집 강화 지시
  → 다음 주간 회의에서 리텐션 중심 문제 정의 시작

[KPI 추가]
  창업자: "네이버 카페 유입도 트래킹하고 싶어"
  CEO: 확인 → CDO에게 카페 유입 메트릭 수집 요청
  → KPI 테이블에 추가 → 다음 리포트부터 포함

[KPI 폐기]
  창업자: "에이전트 성공률은 안 봐도 될 것 같아"
  CEO: 확인 → CTO에게 리포트에서 제외 통보
  → KPI 테이블에서 비활성화 (삭제 아닌 비활성화 — 나중에 다시 볼 수 있으므로)
```

### 15.8 KPI → 성장 루프 연결 — 전체 흐름

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│   [창업자]                                                            │
│   "이번 달 KPI: DAU 50, 리텐션 20%, UGC 15%"                         │
│       │                                                               │
│       ▼                                                               │
│   [CEO] KPI 수신 → 전 에이전트에 방향 전파                              │
│       │                                                               │
│       ▼                                                               │
│   ┌─────────── 성장 루프 시작 ───────────┐                            │
│   │                                       │                            │
│   │  DATA: CDO가 KPI 기준으로 데이터 수집   │ ← KPI가 수집 범위 결정    │
│   │  "DAU 45인데 목표 50. 격차 5."          │                            │
│   │       ↓                                │                            │
│   │  PROBLEM: CEO가 KPI 격차에서 문제 도출  │ ← KPI가 문제의 기준       │
│   │  "신규 유입은 충분한데 재방문이 약하다"   │                            │
│   │       ↓                                │                            │
│   │  HYPOTHESIS: CEO+에이전트 가설 수립     │ ← KPI 목표가 성공 기준    │
│   │  "환영 시스템 구축 시 리텐션 20% 달성"   │                            │
│   │       ↓                                │                            │
│   │  ⛔ Gate 1: 창업자 승인               │                            │
│   │       ↓ (승인)                         │                            │
│   │  EXPERIMENT → EXECUTE → Gate 2 → RETRO │                            │
│   │       ↓                                │                            │
│   │  RETRO 결과가 KPI에 반영               │ ← 실험 결과 → KPI 변동    │
│   │  "리텐션 14% → 19% (목표 20% 근접)"    │                            │
│   │       ↓                                │                            │
│   │  CEO → 창업자: 결과 보고 + 다음 제안    │                            │
│   │                                       │                            │
│   └───────── 다음 사이클로 ─────────────┘                             │
│                                                                       │
│   [창업자]                                                            │
│   "리텐션 거의 왔네. 이제 UGC에 집중하자" → KPI 우선순위 변경            │
│       │                                                               │
│       ▼                                                               │
│   다음 성장 루프에서 UGC 중심으로 DATA 수집 시작                        │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 15.9 CEO의 에이전트 리딩 구조

```
CEO는 단순 보고자가 아니라 "에이전트 조직의 리더"이다.

[CEO의 책임]
  1. 창업자로부터 KPI 방향을 받아 전 에이전트에 전파
  2. Daily/Weekly로 각 에이전트와 소통하며 KPI 진척 관리
  3. KPI 이상 징후 발견 시 즉시 창업자에게 보고
  4. 주간 회의를 소집하여 에이전트 간 시너지 창출
  5. 회의 결과를 창업자에게 공유하고 Gate 1 승인 요청
  6. 창업자 피드백을 다시 에이전트에 전달하여 가설 수정

[CEO의 일일 루틴]
  09:00 — Morning Cycle
    • 전일 KPI 확인 (CDO 데이터)
    • 에이전트 BotLog + AgentMessage 확인
    • 일일 브리핑 작성 → #일일-브리핑 채널 전송
    • UNREAD 에이전트 메시지 처리 (1:1 협의)

[CEO의 주간 루틴]
  월요일 09:00 — Weekly Meeting
    • 주간 KPI 리포트 작성
    • 에이전트 회의 소집 (전원 참석)
    • 문제 정의 + 가설 도출
    • 회의 결과 + 가설을 창업자에게 전달 (Gate 1)
    • 창업자 피드백 수신 대기

[CEO의 월간 루틴]
  월초 — Monthly Review
    • 월간 KPI 달성률 정리
    • 이번 달 실험 회고 종합
    • 창업자와 다음 달 KPI 목표 논의
    • 새 KPI 목표 확정 → 전 에이전트 전파

[에이전트별 CEO 소통 패턴]
  CEO ↔ CDO: "이 KPI 데이터 좀 더 깊이 봐줘" (수시)
  CEO ↔ CTO: "서비스 안정성 이슈 있어?" (매일)
  CEO ↔ CMO: "이번 주 SEO 성과 어때?" (주간)
  CEO ↔ CPO: "UX 개선 실험 결과 나왔어?" (주간)
  CEO ↔ CFO: "이번 달 비용 어디까지 갔어?" (주간)
  CEO ↔ COO: "일자리 수집 정상? UGC 촉진 아이디어?" (주간)
```

### 15.10 KPI 기반 의사결정 매트릭스

```
CEO가 KPI 변동을 보고 자동으로 판단하는 기준:

[즉시 행동 (자동)]
  KPI 20%+ 하락 2일 연속 → 긴급 회의 소집 + 창업자 즉시 알림
  에이전트 실패율 30%+ → CTO 긴급 점검 요청
  비용 $40 돌파 → 전 에이전트 활동 빈도 축소 검토

[주간 회의 의제]
  KPI 목표 대비 미달 항목 → 원인 분석 + 가설 수립
  KPI 목표 초과 달성 → 성공 요인 분석 + 목표 상향 검토
  새로운 KPI 요청 (창업자) → 수집 방법 설계

[월간 리뷰 의제]
  KPI 전체 달성률 → 목표 현실성 재평가
  KPI 항목 추가/폐기 → 사업 방향 변화 반영
  에이전트별 KPI 기여도 → 리소스 재배분

[CEO가 혼자 결정하지 않는 것]
  ⛔ KPI 목표 설정/변경 → 반드시 창업자 결정
  ⛔ 실험 시작 → 반드시 Gate 1 승인
  ⛔ 실험 정식 적용 → 반드시 창업자 판단
  ⛔ 비용 구조 변경 → 반드시 창업자 승인
```

### 15.11 구현에 필요한 것

| 항목 | 현재 | 필요한 것 | 우선순위 |
|------|------|----------|---------|
| KPI 테이블 (DB) | EventLog만 존재 | KpiTarget 모델 (목표+실적+기간) | P1 |
| CEO 일일 브리핑 | Morning Cycle에 없음 | CEO morning-cycle에 KPI 스냅샷 + Slack #일일-브리핑 발송 | P1 |
| CEO 주간 리포트 | 없음 | CEO weekly-report.ts 신규 | P1 |
| KPI 대시보드 (어드민) | 없음 | /admin/kpi 페이지 | P2 |
| KPI 히스토리 | 없음 | KpiSnapshot 모델 (일별 스냅샷) | P2 |
| 월간 KPI 리뷰 | 없음 | CEO monthly-review.ts | P2 |

```
KpiTarget {
  id          String
  name        String    // "DAU", "WAU", "7일 리텐션" 등
  category    String    // "growth" | "engagement" | "revenue" | "stability"
  current     Float     // 현재 값
  target      Float     // 목표 값
  period      String    // "2026-03" (월 단위)
  unit        String    // "명", "%", "$" 등
  isActive    Boolean   // 활성/비활성
  owner       String    // 담당 에이전트 "CDO", "CMO" 등
  updatedAt   DateTime
}

KpiSnapshot {
  id          String
  kpiName     String
  value       Float
  date        DateTime  // 스냅샷 일자
  note        String?   // "실험 X 적용 후 변동"
}
```

---

## 16. 성장 루프 — Data-Driven Growth Cycle

### 16.1 목표 프레임워크

서비스 성장의 핵심은 **반복 가능한 학습 루프**다. 감이 아니라 데이터로 의사결정하고, 실험으로 검증하고, 회고로 학습한다.

**절대 원칙: 에이전트는 독단적으로 실행하지 않는다. 창업자가 루프 안에 있다.**

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                       GROWTH LOOP (v2)                              │
  │                                                                     │
  │   ┌────────┐   ┌────────┐   ┌──────────┐   ┌──────────────────┐  │
  │   │ DATA   │──▶│PROBLEM │──▶│HYPOTHESIS│──▶│ 창업자 승인/피드백 │  │
  │   │ 수집   │   │ 정의   │   │ 수립     │   │ (Gate 1)         │  │
  │   └────────┘   └────────┘   └──────────┘   └────────┬─────────┘  │
  │       ▲                                              │             │
  │       │                                    ┌─────────┴─────────┐  │
  │       │                                    │ 승인    │ 피드백   │  │
  │       │                                    │  ▼      │  ▼      │  │
  │       │                                    │실험설계 │가설 재작성│  │
  │       │                                    └────┬────┴─────────┘  │
  │       │                                         │                  │
  │       │                                         ▼                  │
  │   ┌────────┐   ┌────────┐   ┌──────────┐   ┌──────────┐         │
  │   │ RETRO  │◀──│사용자   │◀──│EXECUTE   │◀──│EXPERIMENT│         │
  │   │ 회고   │   │피드백   │   │ 실행     │   │ 설계     │         │
  │   │        │   │(Gate 2) │   │          │   │          │         │
  │   └───┬────┘   └────────┘   └──────────┘   └──────────┘         │
  │       │                                                            │
  │       └──── 학습 → 다음 사이클 ─────────────────────────▶ DATA   │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘

  Gate 1: 창업자 승인 — 에이전트가 짠 문제정의/가설을 창업자가 검토
  Gate 2: 사용자 피드백 — 실행 결과에 대한 실제 사용자 반응 수집
```

### 16.2 두 개의 Gate — 왜 필요한가

#### Gate 1: 창업자 승인/피드백 (HYPOTHESIS → EXPERIMENT 사이)

```
에이전트가 하는 것:
  - DATA 수집 (자동)
  - PROBLEM 정의 (AI 분석)
  - HYPOTHESIS 수립 (AI 제안)

여기서 멈춘다. ⛔

창업자가 하는 것:
  - 문제 정의가 맞는지 판단 ("이건 문제가 아니라 자연스러운 변동이다")
  - 가설이 타당한지 판단 ("이 가설보다 이쪽이 더 본질적이다")
  - 인사이트 추가 ("실제로 사용자들이 이런 불만을 자주 하더라")
  - 우선순위 조정 ("지금 이건 중요하지 않다, 이걸 먼저 해라")
  - 피드백 → 에이전트가 가설 수정 → 다시 창업자 확인 (반복 가능)

승인 후에만 EXPERIMENT 단계로 진행.

이유:
  AI는 데이터에서 패턴을 찾는 건 잘하지만,
  "이게 지금 우리 상황에서 진짜 중요한 문제인가?"는 창업자만 판단할 수 있다.
  에이전트는 제안하고, 창업자는 결정한다.
```

#### Gate 2: 사용자 피드백 (EXECUTE → RETRO 사이)

```
실험 실행 후, 회고 전에 실제 사용자 반응을 수집:

  - 정량: KPI 변동 (DAU, 체류시간, CTR, 바운스율)
  - 정성: 댓글 반응, 커뮤니티 분위기 변화, 이탈 패턴
  - 간접: 검색 유입 키워드 변화, 재방문율

이유:
  숫자만으로 판단하면 "지표 올리기 게임"이 된다.
  실제 사용자(50·60대)가 어떻게 느끼는지가 핵심.
  사용자 피드백 없는 회고는 자기만족에 불과하다.
```

### 16.3 각 단계별 상세 프로세스

| 단계 | 주 담당 | 보조 | 산출물 | 창업자 역할 |
|------|---------|------|--------|------------|
| **DATA (수집)** | CDO | CTO, CFO | KPI 대시보드, EventLog, BotLog | 없음 (자동) |
| **PROBLEM (정의)** | CEO | CDO, CPO | 문제 정의서 | 없음 (자동) |
| **HYPOTHESIS (가설)** | CEO + CMO + CPO | CDO | 가설 초안 | 없음 (자동) |
| **Gate 1 (승인)** | — | — | — | **검토 + 피드백 + 승인** |
| **EXPERIMENT (설계)** | CPO | CTO | 실험 계획서 | 없음 (승인 후 자동) |
| **EXECUTE (실행)** | COO + CTO | CMO | 코드 배포, 콘텐츠 변경 | 없음 (자동) |
| **Gate 2 (피드백)** | CDO | CPO | 사용자 반응 데이터 | **결과 확인** |
| **RETRO (회고)** | CEO | 전체 | 결과 리포트 + 학습 + 다음 액션 | **최종 판단** |

### 16.4 Gate 1 실제 흐름 — Slack #ceo-창업자 기반

```
[에이전트 작업 — 자동]
CEO: 주간 회의에서 문제 정의 + 가설 수립
  │
  ▼
[Slack #ceo-창업자로 창업자에게 전달]
────────────────────────────────────────────
📋 주간 분석 결과 (승인 필요)

🔴 문제 정의:
  일자리 페이지 PV가 전주 대비 -25%.
  모바일 사용자의 평균 체류시간 12초 (목표: 30초).

💡 가설 (CEO + CPO 합의):
  "모바일에서 퀵태그 필터가 스크롤 아래에 숨어 있어
   사용자가 원하는 일자리를 찾지 못하고 이탈한다.
   퀵태그를 상단 고정하면 체류시간 30초 달성 가능."

📊 근거 데이터:
  - 모바일 바운스율 40% (데스크탑 22%)
  - 퀵태그 클릭률: 데스크탑 35%, 모바일 8%
  - 필터 사용 후 체류시간: 45초 (미사용: 12초)

👉 승인하시겠습니까?
  /approve — 이 가설로 실험 설계 진행
  /feedback — 피드백 입력 (가설 수정)
  /reject — 기각 (이유 입력)
────────────────────────────────────────────

[창업자 응답 시나리오]

시나리오 A — 승인:
  창업자: /approve
  → EXPERIMENT 단계로 자동 진행

시나리오 B — 피드백:
  창업자: /feedback 퀵태그보다 검색 기능이 없는게 더 문제다.
          내가 실제로 써보니까 "서울 경비" 이런 검색을 하고 싶은데
          검색이 안됨. 이쪽이 더 본질적인 문제 아닌가?
  → CEO가 피드백 반영하여 가설 재작성
  → 다시 #ceo-창업자로 수정 가설 전달
  → 창업자 재검토 (반복 가능)

시나리오 C — 기각:
  창업자: /reject 지금 이건 우선순위가 아님. 이번 주는 커뮤니티 활성화에 집중.
  → CEO가 기각 사유 기록
  → 창업자가 제시한 방향으로 새 PROBLEM 정의 시작
```

### 16.5 Gate 2 실제 흐름 — 사용자 피드백 수집

```
[실험 실행 완료 후 — 최소 3일 경과]

CDO가 자동 수집:
  ┌─────────────────────────────────────────┐
  │ 정량 데이터 (자동)                        │
  │  - 목표 지표 변동: 체류시간 12초 → ?초    │
  │  - 바운스율 변동: 40% → ?%               │
  │  - 퀵태그 클릭률 변동: 8% → ?%           │
  └─────────────────────────────────────────┘
  ┌─────────────────────────────────────────┐
  │ 정성 데이터 (반자동)                      │
  │  - 일자리 게시글 댓글 감정 분석            │
  │  - 커뮤니티 내 일자리 관련 게시글 변화     │
  │  - 검색 유입 키워드 변화                  │
  └─────────────────────────────────────────┘
  ┌─────────────────────────────────────────┐
  │ 간접 시그널 (수동 — 창업자 관찰)           │
  │  - 실제 사용자 반응 (커뮤니티 글)          │
  │  - 창업자 본인의 사용 경험                 │
  │  - 주변 시니어 피드백                     │
  └─────────────────────────────────────────┘

→ 이 데이터가 모여야 RETRO(회고) 진행
→ 숫자만으로 "성공/실패" 판단하지 않음
→ 창업자의 정성적 판단이 포함됨
```

### 16.6 현재 문제점 — 루프가 끊겨 있다

```
현재 실제 흐름:

CDO 데이터 수집 ──▶ BotLog에 저장 ──▶ 끝 ❌
CEO 모닝사이클 ──▶ "이슈 3건 발견" ──▶ Slack 알림 ──▶ 창업자가 읽음 ──▶ 끝 ❌
CMO 트렌드분석 ──▶ "이번주 인기: 건강" ──▶ 로그 저장 ──▶ 끝 ❌
CPO UX분석 ──▶ "바운스율 높음" ──▶ 로그 저장 ──▶ 끝 ❌

문제:
1. DATA → PROBLEM 전환 없음: 데이터는 쌓이지만 "문제"로 정의되지 않음
2. PROBLEM → HYPOTHESIS 없음: 문제를 발견해도 가설을 세우지 않음
3. 창업자 Gate 없음: 에이전트가 혼자 판단하거나, 아예 판단을 안 함
4. HYPOTHESIS → EXPERIMENT 없음: 실험 설계 프로세스가 없음
5. EXECUTE → 사용자 피드백 수집 없음: 실행 후 반응을 측정하지 않음
6. RETRO 없음: 학습이 축적되지 않음
7. 에이전트 간 데이터 전달 없음: 각자 DB에 쓰고 끝
```

### 16.7 루프를 닫기 위해 필요한 것

#### A. 에이전트 간 메시지 버스

```
현재: Agent → DB(BotLog) → 끝
목표: Agent → AgentMessage 테이블 → 다른 Agent가 다음 실행 시 읽음

AgentMessage {
  id          String
  fromAgent   String    // "CDO"
  toAgent     String    // "CEO"  (또는 "ALL" 또는 "FOUNDER")
  type        String    // "FINDING" | "QUESTION" | "PROPOSAL" | "DECISION" | "FOUNDER_FEEDBACK"
  subject     String    // "DAU 전일 대비 15% 하락"
  body        Json      // 상세 데이터
  priority    String    // "CRITICAL" | "HIGH" | "NORMAL"
  status      String    // "UNREAD" | "READ" | "ACTED_ON"
  meetingId   String?   // 어떤 회의에서 생성되었는가
  createdAt   DateTime
}

핵심: toAgent에 "FOUNDER"가 있음.
      창업자 피드백도 AgentMessage로 기록되어 에이전트가 학습함.
```

#### B. 실험(Experiment) 관리 — 창업자 Gate 포함

```
Experiment {
  id              String
  title           String    // "홈 히어로 CTA 문구 변경"
  hypothesis      String    // "CTA를 '일자리 보기'→'내 일자리 찾기'로 변경하면 CTR 20% 증가"
  proposedBy      String    // "CPO"

  // Gate 1: 창업자 승인
  founderStatus   String    // PENDING → APPROVED → FEEDBACK → REJECTED
  founderFeedback String?   // 창업자 피드백 내용
  founderApprovedAt DateTime? // 승인 시각
  revisionCount   Int       // 피드백 후 수정 횟수 (가설이 몇 번 다듬어졌는가)

  status          String    // DRAFT → FOUNDER_REVIEW → APPROVED → RUNNING → MEASURING → COMPLETED
  startDate       DateTime?
  endDate         DateTime?
  successMetric   String    // "jobs_page_ctr"
  successCriteria String    // ">= 20% uplift"
  variants        Json      // { A: "현재", B: "변경안" }

  // Gate 2: 사용자 피드백
  quantResult     Json?     // 정량 데이터 { metric: value }
  qualResult      Json?     // 정성 데이터 { comments: [...], sentiment: "positive" }
  founderJudgment String?   // 창업자 최종 판단 ("숫자는 좋지만 UX가 어색함")

  result          Json?     // 종합 결과
  learnings       String?   // 회고에서 도출된 학습
  nextActions     String[]  // 다음 실험 또는 정식 적용
}

상태 흐름:
  DRAFT ──▶ FOUNDER_REVIEW ──▶ APPROVED ──▶ RUNNING ──▶ MEASURING ──▶ COMPLETED
                │                                           │
                ▼ (피드백)                                   ▼ (사용자 피드백 수집)
              DRAFT (수정 후 재제출)                      RETRO 진행
                │
                ▼ (기각)
              REJECTED (사유 기록)
```

#### C. 피드백 반복 루프 (가설 다듬기)

```
에이전트와 창업자 간 가설 디벨롭 프로세스:

Round 1:
  CEO 제안: "모바일 퀵태그 상단 고정하면 체류시간 증가"
  창업자: "퀵태그보다 검색이 더 문제다"

Round 2:
  CEO 수정: "모바일 일자리 검색 기능 추가하면 체류시간 2배 증가"
  창업자: "검색은 좋은데, 시니어가 검색어를 잘 못 칠 수 있다.
           자동완성이나 추천 검색어가 같이 있어야 한다"

Round 3:
  CEO 최종: "모바일 일자리 검색 + 추천 검색어 5개 노출 시
            체류시간 2배 + 검색 사용률 30% 달성"
  창업자: /approve

→ 이 과정이 Slack #ceo-창업자에서 자연스럽게 이루어짐
→ 각 Round의 피드백이 AgentMessage로 기록됨
→ revisionCount: 3 (가설이 3번 다듬어짐)
→ 이 학습은 다음 가설 수립 시 참고됨
  ("창업자는 UX 관점에서 시니어 특성을 반영하길 원함")
```

#### D. 회고(Retrospective) 프로세스

```
매주 월요일 09:00 — CEO 주간 회고 사이클:

1. CDO: 지난주 KPI 변동 요약 → CEO에게 전달
2. CDO: 진행 중 실험의 Gate 2 데이터 (사용자 피드백) 수집
3. CEO: KPI + 실험 결과 + 사용자 피드백 종합 → 회고 리포트 작성
4. CEO → Slack #주간-리포트: 창업자에게 회고 리포트 발송
   - "이번 실험 결과: [정량] + [정성]"
   - "학습: [무엇을 배웠는가]"
   - "다음 제안: [새 문제 정의 + 새 가설]" ← 다시 Gate 1로
5. 창업자 확인 + 다음 사이클 방향 결정
6. CEO → 전체 에이전트: "이번 주 최우선 과제: [X]"
```

---

## 17. QA & 배포 안정성 시스템

### 17.1 현재 문제점

```
현재 배포 흐름:

코드 변경 → git push → Vercel 자동 배포 → 프로덕션 즉시 반영

문제점:
❌ QA 환경 없음 — 프로덕션에서 바로 테스트
❌ 스테이징 없음 — 변경사항 사전 검증 불가
❌ 스모크 테스트 없음 — 배포 후 핵심 기능 동작 확인 없음
❌ 롤백 전략 없음 — 문제 발생 시 수동 revert만 가능
❌ 에이전트 변경 검증 없음 — 에이전트 프롬프트 변경이 품질에 미치는 영향 미측정
```

### 17.2 목표 배포 파이프라인

```
┌──────────────────────────────────────────────────────────────────┐
│                     배포 파이프라인 (목표)                          │
│                                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │  개발     │──▶│  PR 검증  │──▶│ Preview  │──▶│ 프로덕션  │    │
│  │ (로컬)   │   │ (CI)     │   │ (QA)     │   │ (배포)    │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
│                                                                   │
│  Phase 1         Phase 2         Phase 3        Phase 4          │
│  코드 작성        자동 검증        수동 확인       프로덕션 배포     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 17.3 각 Phase 상세

#### Phase 1: 개발 (로컬)

| 검증 항목 | 도구 | 자동화 |
|-----------|------|--------|
| TypeScript 타입 체크 | `tsc --noEmit` | Husky pre-commit |
| ESLint | `eslint .` | Husky pre-commit |
| 유닛 테스트 | `vitest` | 수동 (→ pre-commit 추가 필요) |
| 시크릿 스캐닝 | `secretlint` | Husky pre-commit |

#### Phase 2: PR 검증 (CI — 현재 구축됨)

| 검증 항목 | 워크플로우 | 상태 |
|-----------|-----------|------|
| Lint + Typecheck + Build | `ci.yml` | ✅ 구축됨 |
| Lighthouse 접근성 | `lighthouse.yml` | ✅ 구축됨 |
| E2E 테스트 | Playwright | ⚠️ 테스트 존재, CI 미연동 |
| 접근성 테스트 | axe-core | ⚠️ 테스트 존재, CI 미연동 |

#### Phase 3: Preview/QA (현재 빠져 있음 ❌)

```
목표 구조:

main 브랜치  ──▶  프로덕션 (age-doesnt-matter.com)
PR 브랜치    ──▶  Preview URL (Vercel 자동 생성, 이미 가능)
                  ↑
                  이 URL에서 수동 QA 수행

QA 체크리스트 (PR마다):
□ 모바일 (375px) 레이아웃 깨짐 없음
□ 터치 타겟 52px 이상
□ 핵심 플로우 동작 (로그인 → 글쓰기 → 댓글)
□ 일자리 상세 페이지 렌더링
□ 에러 페이지 정상 작동
```

**Vercel Preview 활용 전략:**
- Vercel Hobby Plan은 모든 PR에 Preview URL 자동 생성
- 별도 스테이징 서버 불필요 (비용 $0)
- PR Description에 Preview URL + QA 체크리스트 자동 삽입 (GitHub Actions)

#### Phase 4: 프로덕션 배포 후 검증

```
배포 완료 → CTO deploy-verifier 자동 실행 (구축 필요):

1. 헬스체크: /api/health 200 응답 확인
2. 핵심 페이지 로드: /, /jobs, /magazine, /community/stories
3. DB 연결: 게시글 목록 API 응답 확인
4. 응답 속도: 각 페이지 < 3초
5. 결과 → Slack #알림-시스템 알림

실패 시:
→ Vercel 이전 배포로 즉시 롤백 (Vercel 대시보드에서 1클릭)
→ CTO → CEO 긴급 알림
```

### 17.4 에이전트 QA (프롬프트 변경 검증)

```
에이전트 프롬프트/로직 변경 시 QA 프로세스:

1. 변경 전 현재 에이전트 출력 3건 샘플 저장
2. 변경 적용
3. 동일 입력으로 신규 출력 3건 생성
4. 비교 검토:
   - 품질이 개선되었는가?
   - 헌법(constitution) 위반은 없는가?
   - 비용이 증가하지 않았는가?
5. 창업자 승인 → 프로덕션 적용

파일: agents/core/prompt-qa.ts (구축 필요)
```

### 17.5 현재 vs 목표 비교

| 항목 | 현재 | 목표 | 우선순위 |
|------|------|------|---------|
| tsc + ESLint (로컬) | ✅ Husky | ✅ 유지 | - |
| CI 빌드 검증 | ✅ ci.yml | ✅ 유지 | - |
| E2E in CI | ❌ 미연동 | Playwright CI | P2 |
| Preview QA | ⚠️ URL은 있으나 체크리스트 없음 | QA 체크리스트 자동화 | P1 |
| 배포 후 스모크 | ❌ 없음 | CTO deploy-verifier | P1 |
| 롤백 전략 | ⚠️ Vercel 수동 | 자동 감지 + 1클릭 롤백 | P2 |
| 에이전트 QA | ❌ 없음 | prompt-qa.ts | P2 |

---

## 18. 에이전트 협업 시스템 — C-level 회의 프레임워크

### 18.1 현재 문제: "회사인데 회의가 없다"

```
현재 에이전트 구조의 근본 문제:

CEO  ────▶ DB에 로그 ────▶ 끝
CTO  ────▶ DB에 로그 ────▶ 끝
CMO  ────▶ DB에 로그 ────▶ 끝
CPO  ────▶ DB에 로그 ────▶ 끝
CDO  ────▶ DB에 로그 ────▶ 끝
CFO  ────▶ DB에 로그 ────▶ 끝
COO  ────▶ DB에 로그 ────▶ 끝

→ 7명의 C-level이 같은 회사에 있지만 한 번도 대화하지 않음
→ CEO가 문제를 발견해도 CMO/CPO에게 지시할 수 없음
→ CMO가 트렌드를 발견해도 COO에게 콘텐츠 요청 불가
→ 결국 모든 판단이 "창업자"에게 집중됨 (병목)
```

### 18.2 목표: 에이전트 자율 협업 구조

```
┌─────────────────────────────────────────────────────────────┐
│              에이전트 협업 아키텍처 (목표)                      │
│                                                              │
│                    ┌──────────┐                              │
│                    │  창업자   │                              │
│                    │ (최종승인)│                              │
│                    └─────┬────┘                              │
│                          │ /approve                          │
│                          ▼                                   │
│              ┌───────────────────────┐                       │
│              │    CEO (의장)          │                       │
│              │  회의 소집 + 최종 결정  │                       │
│              └───────────┬───────────┘                       │
│                          │                                   │
│         ┌────────────────┼────────────────┐                 │
│         ▼                ▼                ▼                  │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐             │
│   │  정기 회의  │  │ 긴급 회의  │  │ 1:1 협의   │             │
│   │ (주1회)    │  │ (이슈 발생)│  │ (필요 시)  │             │
│   └───────────┘  └───────────┘  └───────────┘             │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              AgentMessage Bus                        │   │
│   │  FINDING → PROPOSAL → DECISION → ACTION → RESULT   │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 18.3 회의 유형 3가지

#### A. 정기 회의 — 주간 전략 회의 (매주 월요일 09:00)

```
참석: 전원 (CEO, CTO, CMO, CPO, CDO, CFO, COO)
의장: CEO
소요 시간: ~3분 (AI 처리)
비용: ~$0.05 (Sonnet 1회 호출)

프로세스:

Step 1 — 데이터 수집 (CEO 주도)
  CEO가 각 에이전트의 지난 주 BotLog + AgentMessage를 수집

Step 2 — 요약 + 의제 도출
  CEO AI 호출:
  "지난주 각 에이전트 보고 요약 + 핵심 이슈 3개 도출 + 다음 주 우선순위 제안"

  Input:
  - CDO: KPI 변동 (DAU +5%, 댓글 -10%)
  - CTO: 에러 3건, 응답속도 정상
  - CMO: 트렌드 "봄 나들이"
  - CPO: /jobs 바운스율 40%
  - CFO: 이번 달 $18 사용
  - COO: 일자리 42건 수집, 모더레이션 정상

Step 3 — 문제 정의 + 가설 초안 (에이전트 작업)
  CEO AI가 종합 판단:
  {
    "problemDefinition": "/jobs 바운스율 40% (데스크탑 22%). 모바일 UX 문제 의심",
    "hypothesis": "필터를 상단 고정하면 바운스율 30%로 감소",
    "supportingData": { "mobileFilterCTR": "8%", "desktopFilterCTR": "35%" },
    "otherIssues": [
      { "issue": "댓글 -10%", "suggestedAction": "SEED 댓글 활동 증가" },
      { "issue": "봄 나들이 트렌드", "suggestedAction": "관련 매거진 기획" }
    ]
  }

Step 4 — ⛔ 창업자 Gate 1 (여기서 멈춤)
  Slack #ceo-창업자로 창업자에게 전달:
  "📋 주간 분석 결과 (검토 필요)

   🔴 문제 정의:
   일자리 페이지 모바일 바운스율 40% (데스크탑 22%).
   모바일 필터 클릭률 8%로, 사용자가 필터를 못 찾는 것으로 추정.

   💡 가설:
   필터를 상단 고정하면 바운스율 30%로 감소할 것.

   📊 기타 이슈:
   - 댓글 -10% → SEED 활동 증가 제안
   - 봄 나들이 트렌드 → 매거진 기획 제안

   /approve — 이 방향으로 실험 설계 진행
   /feedback — 피드백 (문제 정의/가설 수정)
   /reject — 기각"

  ※ 창업자가 /approve 또는 /feedback 하기 전까지 실험은 진행되지 않음
  ※ /feedback 시 CEO가 가설 수정 후 재전달 (반복 가능)

Step 5 — 창업자 승인 후에만 지시 전달
  창업자 /approve 확인 →
  CEO → AgentMessage로 각 에이전트에 지시 전달
  각 에이전트는 다음 실행 시 AgentMessage.UNREAD를 확인하고 반영
```

#### B. 긴급 회의 — 이슈 트리거 (자동 소집)

```
트리거 조건 (자동):
- CTO: 서비스 다운 또는 에러율 급증
- CDO: KPI 20%+ 급변 2일 연속
- CFO: 예산 $40 돌파
- COO: 모더레이션 긴급 (법적 리스크)

프로세스:

1. 트리거 에이전트가 AgentMessage(type: "EMERGENCY") 발행
2. CEO가 즉시 소집 (다음 크론 실행 시)
3. 관련 에이전트만 참석 (예: 서비스 다운 → CEO + CTO + CDO)
4. CEO AI가 긴급 대응 결정
5. Slack #알림-긴급 즉시 알림 + 자동 실행 가능한 조치는 바로 실행

예시 — 서비스 다운:
  CTO 감지 → EMERGENCY 메시지 → CEO 소집
  CEO 결정: "CTO: 상세 진단, CDO: 영향 범위 파악"
  CTO 결과: "DB 커넥션 풀 소진"
  CEO 최종: "Supabase 연결 풀 증가 필요 → 창업자 승인 요청"
  #알림-긴급: "🚨 긴급: DB 커넥션 풀 이슈" + #ceo-창업자: "/approve 로 설정 변경 승인"
```

#### C. 1:1 협의 — 에이전트 간 직접 대화

```
특정 에이전트가 다른 에이전트에게 직접 질문/요청:

예시 1 — CMO → COO:
  CMO: "이번 주 트렌드 '봄 나들이' → 관련 일자리 있으면 에디터스 픽으로"
  COO: 다음 content-scheduler 실행 시 반영

예시 2 — CPO → CDO:
  CPO: "/jobs 페이지 이탈 패턴 데이터 필요"
  CDO: 다음 실행 시 해당 데이터 수집 후 응답

예시 3 — CFO → CEO:
  CFO: "이번 달 비용 $38 도달. 주의 단계."
  CEO: 비용이 높은 에이전트 식별 → 해당 에이전트에 빈도 조정 지시

구현 방식:
  AgentMessage(fromAgent: "CMO", toAgent: "COO", type: "REQUEST")
  → COO 다음 실행 시 UNREAD 메시지 확인 → 반영 → ACTED_ON으로 변경
```

### 18.4 회의록 & 학습 축적

```
AgentMeeting {
  id            String
  type          String    // "WEEKLY" | "EMERGENCY" | "ONE_ON_ONE"
  chairAgent    String    // "CEO"
  participants  String[]  // ["CEO", "CTO", "CMO", ...]
  agenda        Json      // 의제
  decisions     Json      // 결정사항
  actionItems   Json[]    // [{ owner: "CPO", task: "UX 개선안", deadline: "2026-04-01" }]
  experiments   Json[]    // 새로 제안된 실험
  summary       String    // 한줄 요약
  createdAt     DateTime
}
```

**학습 축적 흐름:**

```
회의 결정 → 실험 실행 → 결과 측정 → 회고 (다음 주간 회의)
                                         │
                                         ▼
                                   AgentLearning {
                                     experiment: "필터 UX 개선"
                                     result: "바운스율 40% → 32%"
                                     learning: "상단 고정 필터가 효과적"
                                     appliedTo: "정식 적용 완료"
                                   }
                                         │
                                         ▼
                              다음 유사 실험 시 참고
```

### 18.5 구현 로드맵

| Phase | 내용 | 구현 항목 | 예상 비용 |
|-------|------|----------|----------|
| **Phase A** (기획 완료 후) | 메시지 버스 | AgentMessage 테이블 + BaseAgent에 읽기/쓰기 메서드 | $0 (DB만) |
| **Phase B** | 주간 회의 | CEO weekly-meeting.ts + 회의록 저장 | +$0.20/월 |
| **Phase C** | 긴급 회의 | 트리거 조건 + emergency-meeting.ts | +$0.10/월 |
| **Phase D** | 1:1 협의 | 각 에이전트가 UNREAD 메시지 확인 로직 추가 | $0 |
| **Phase E** | 실험 관리 | Experiment 테이블 + CEO가 실험 라이프사이클 관리 | +$0.10/월 |
| **Phase F** | 학습 축적 | AgentLearning + 회고 자동화 | +$0.05/월 |

**총 추가 비용: ~$0.45/월** (현재 예산 여유 $28.5 내)

### 18.6 협업 프로세스 전체 흐름 예시

```
[Week 1 일요일 — DATA 수집]
  CDO 22:00: KPI 수집 → "일자리 페이지 조회수 전주 대비 -25%"
  CDO → AgentMessage(to: CEO, type: FINDING, "일자리 PV -25%")

[Week 1 월요일 09:00 — 에이전트 주간 회의 (PROBLEM + HYPOTHESIS)]
  CEO: 주간 회의 소집, 각 에이전트 보고 수집
  CPO: "필터 UX 불편, 모바일에서 퀵태그 미노출"
  CMO: "'시니어 일자리 지원방법' 검색 증가"
  CEO 종합:
    문제 정의: "모바일 일자리 필터 접근성 부족이 이탈 원인"
    가설: "퀵태그를 상단 고정하면 바운스율 40% → 30%로 감소"

[Week 1 월요일 09:05 — ⛔ Gate 1: 창업자 검토]
  Slack #ceo-창업자로 문제 정의 + 가설 + 근거 데이터 전달
  "...승인/피드백/기각 중 선택해주세요"

  창업자: /feedback "퀵태그도 중요하지만, 내가 써보니 일자리 목록에서
          급여 정보가 바로 안 보이는 게 더 큰 문제다. 급여를 카드에
          크게 보여주는 게 우선 아닐까?"

[Week 1 월요일 — CEO 가설 수정 (Round 2)]
  CEO: 창업자 피드백 반영
  수정 가설: "일자리 카드에 급여를 크게 노출하면 바운스율 30%로 감소"
  → #ceo-창업자 재전달

  창업자: /feedback "급여 + 퀵태그 둘 다 하자. 급여 먼저, 퀵태그는 다음 주."

[Week 1 월요일 — CEO 최종 수정 (Round 3)]
  CEO: 최종 수정
  "일자리 카드 급여 강조 표시 → 바운스율 감소 실험"
  → #ceo-창업자 재전달

  창업자: /approve ✅
  revisionCount: 3 (가설이 3번 다듬어짐)

[Week 1 화~금 — EXPERIMENT 설계 + EXECUTE]
  CPO: 실험 설계 → "A: 현재 카드 / B: 급여 강조 카드"
  CTO: 코드 변경 + Preview QA 검증
  → Vercel Preview URL에서 확인
  → 프로덕션 배포

[Week 2 — ⛔ Gate 2: 사용자 피드백 수집 (MEASURING)]
  CDO 자동: 바운스율 40% → 33%, 카드 클릭률 +18%
  CPO 자동: 일자리 상세 페이지 체류시간 +25%
  창업자 수동: "주변 시니어분들이 급여가 바로 보여서 좋다고 함"
  간접 시그널: 일자리 댓글 +8%

[Week 2 월요일 — RETRO (회고)]
  CEO: 정량 + 정성 + 창업자 판단 종합
  "실험 성공. 급여 강조 정식 적용.
   학습 1: 시니어에게 급여 정보 가시성이 핵심 (창업자 인사이트)
   학습 2: 창업자 피드백이 데이터보다 정확한 경우 있음 → 정성 피드백 중시"
  → AgentLearning 저장
  → 다음 문제 정의 + 가설 → 다시 Gate 1로 (반복)
```

### 18.7 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **에이전트는 제안, 창업자가 결정** | 에이전트가 독단적으로 실행하지 않음. 문제 정의/가설을 만들어 창업자에게 제출. |
| **Gate 1 필수** | 모든 실험은 창업자 승인 없이 시작할 수 없음. 피드백 시 가설 수정 반복. |
| **Gate 2 필수** | 실험 후 사용자 피드백(정량+정성) 수집 없이 회고하지 않음. |
| **CEO가 의장** | 회의는 CEO가 소집하고 초안 결정. 최종 결정권은 창업자. |
| **피드백은 학습** | 창업자 피드백은 AgentMessage로 기록 → 다음 가설 수립 시 패턴 학습 |
| **비용 효율** | 회의 1회 = AI 1-2회 호출. 불필요한 회의 없음. |
| **비동기 우선** | 긴급 상황 외에는 AgentMessage로 비동기 소통 |
| **학습 축적** | 모든 실험 결과 + 창업자 피드백 + 사용자 반응이 DB에 저장 |
| **데이터 + 감** | 정량 데이터가 기본이지만, 창업자의 정성적 판단도 동등하게 중시 |

---

## 19. 현재 아키텍처 갭 분석

### 19.1 전체 갭 맵

```
┌────────────────────────────────────────────────────────────────┐
│                    아키텍처 성숙도 맵                             │
│                                                                 │
│  ████████████  코드 (47페이지, 77+컴포넌트)          ✅ 완료     │
│  ████████████  에이전트 (7 C-level + SEED + CAFE)   ✅ 완료     │
│  ████████████  CI/CD (빌드, 린트, 타입체크)          ✅ 완료     │
│  ████████░░░░  QA (Preview 있으나 체크리스트 없음)    ⚠️ 부분    │
│  ████░░░░░░░░  모니터링 (헬스체크만, 메트릭 부족)     ⚠️ 부분    │
│  ██░░░░░░░░░░  에이전트 협업 (각자 독립 실행)         ❌ 미구축   │
│  ░░░░░░░░░░░░  운영 채널 (Slack 채널 분리/구조화)     ❌ 미구축   │
│  ░░░░░░░░░░░░  KPI 프레임워크 (목표 설정→추적→리포트) ❌ 미구축   │
│  ░░░░░░░░░░░░  성장 루프 (데이터→가설→실험→회고)     ❌ 미구축   │
│  ████████████  SNS 실험 관리 (A/B 테스트 7일 사이클)  ✅ 완료     │
│  ████████████  SNS 학습 축적 (실험→인사이트→전략)    ✅ 완료     │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 19.2 우선순위별 갭

#### P0 — 배포 전 반드시 (인프라 연결)
| 갭 | 현재 | 필요한 것 | 담당 |
|----|------|----------|------|
| 도메인 연결 | Vercel 기본 URL | Cloudflare → Vercel CNAME | 창업자 |
| GitHub Secrets | 미설정 | 에이전트 크론 실행 불가 → 설정 필요 | 창업자 |
| Slack Workspace | 미생성 | 운영 채널 구조 필수 → Slack App 설정 필요 | 창업자 |

#### P1 — 운영 안정성
| 갭 | 현재 | 필요한 것 | 담당 |
|----|------|----------|------|
| 배포 후 스모크 테스트 | 없음 | CTO deploy-verifier.ts | 개발 |
| QA 체크리스트 | 없음 | PR 템플릿 + Preview URL QA | 개발 |
| 에이전트 메시지 버스 | 없음 | AgentMessage 테이블 + BaseAgent 메서드 | 개발 |
| 주간 회의 시스템 | 없음 | CEO weekly-meeting.ts | 개발 |
| KPI 목표 테이블 | 없음 | KpiTarget 모델 + CEO 일일 브리핑 | 개발 |
| CEO 일일/주간 리포트 | 없음 | morning-cycle KPI 스냅샷 + weekly-report.ts | 개발 |
| Slack 운영 채널 | 없음 | Slack App + 13개 채널 + slack-commander.ts | 개발+창업자 |

#### P2 — 성장 엔진
| 갭 | 현재 | 필요한 것 | 담당 |
|----|------|----------|------|
| ~~실험 관리~~ | ✅ 완료 | SocialExperiment + social-reviewer/strategy | — |
| 회고 자동화 | 없음 | CEO retrospective.ts + AgentLearning | 개발 |
| E2E 테스트 CI | 로컬만 | Playwright CI 연동 | 개발 |
| 에이전트 프롬프트 QA | 없음 | prompt-qa.ts 비교 도구 | 개발 |

#### P3 — 고도화
| 갭 | 현재 | 필요한 것 | 담당 |
|----|------|----------|------|
| ~~A/B 테스트 인프라~~ | ✅ SNS 실험 완료 | SocialExperiment 8주 로드맵 + Skills 레지스트리 | — |
| 퍼널 분석 | EventLog만 | CDO funnel-analyzer.ts | 개발 |
| 자동 롤백 | Vercel 수동 | 에러율 기반 자동 롤백 | 개발 |

### 19.3 구축 순서 제안

```
현재 위치 ──────────────────────────────────────────────▶ 목표

[Phase 0]         [Phase 1]           [Phase 2]          [Phase 3]
인프라 연결        에이전트 협업         성장 루프          고도화

도메인 연결        AgentMessage         Experiment         A/B 테스트
Secrets 설정       주간 회의             회고 자동화        퍼널 분석
Slack 설정         긴급 회의             학습 축적          자동 롤백
                   1:1 협의
                   QA 체크리스트
                   스모크 테스트

창업자 작업        개발 작업             개발 작업          개발 작업
~1일              ~1주                  ~1주               ~2주
```

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
| Slack 채널 변경 | 7. Webhook & 외부 연동 (7.1~7.5) |
| MCP 추가/제거 | 8. MCP 서버 |
| 환경변수 추가 | 3.1 환경 변수 |
| KPI 목표 변경 | 15. KPI 프레임워크 |
| 실험 추가/완료 | 16. 성장 루프 |
| QA 프로세스 변경 | 17. QA & 배포 안정성 |
| 에이전트 협업 변경 | 18. 에이전트 협업 시스템 |
| 갭 해소 시 | 19. 아키텍처 갭 분석 |

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
