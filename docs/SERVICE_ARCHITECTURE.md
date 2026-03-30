# 우리 나이가 어때서 (우나어) — 서비스 아키텍처 종합 문서

> **최종 업데이트**: 2026-03-30 (v10 — 헌법 v4.0 + 50명 페르소나 + 매거진 v2 + 13개 신규 에이전트)
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
| **핵심 페르소나** | P1 영숙씨(느슨한 연결) / P2 정희씨(건강불안) / P3 미영씨(유머소비) / P4 순자씨(생계) / P5 현주씨(간병) |

### 1.1 미션 & 비전

| | 내용 |
|---|------|
| **미션** | "나이는 숫자일 뿐" — 50·60대가 자신감 있게 새로운 도전을 시작할 수 있는 공간을 만든다 |
| **비전** | 50·60대 세대의 디지털 허브 — 일자리, 정보, 소통을 하나의 플랫폼에서 |
| **핵심 가치** | 실용, 따뜻함, 연결, 용기, 존중, 현실성 |

### 1.2 수익 모델

| 수익원 | 구현 상태 | 설명 |
|--------|----------|------|
| Google AdSense | ✅ 실제 슬롯 ID 적용 완료 (pub: ca-pub-4117999106913048) | 4종: 섹션사이(디스플레이) / 인피드(피드 사이) / 인아티클(글 본문) / 사이드바(데스크탑) |
| Coupang Partners | ✅ 다이나믹 배너 + CPS + 검색위젯 | 6종: 모바일 배너 / 데스크탑 배너 / 카테고리 배너(로켓프레시·주방) / 검색 위젯 / 상품 캐러셀 / CPS 상품 링크 |

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
| **AI** | Anthropic Claude (Opus 4.6 / Sonnet 4.6 / Haiku 4.5) | 3-tier |
| **배포** | Vercel (Hobby Plan) | - |
| **CI/CD** | GitHub Actions | - |
| **운영 커뮤니케이션** | Slack (Bot + Webhook) | - |
| **애널리틱스** | Google Tag Manager + GA4 | - |

### 2.2 테스팅

| 도구 | 용도 |
|------|------|
| Vitest | 유닛 테스트 |
| Playwright | E2E 테스트 (CI webServer 자동 시작) |
| axe-core | 접근성 테스트 |
| Lighthouse CI | 성능 테스트 |
| Secretlint | 시크릿 스캐닝 |
| Husky | Git hooks (pre-commit) |

### 2.3 보안 헤더 (next.config.js)

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=63072000; preload`
- CSP: Kakao SDK, YouTube, Slack API, Google Analytics, GTM, AdSense, Coupang Partners, coupa.ng 허용

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
│  │09:00 │ │2h마다│ │10:00 │ │3회/일│ │12회+4│         │
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
| `CLAUDE_MODEL_STRATEGIC` | 전략 모델 (claude-opus-4-6) | 에이전트 (주간 전략) |
| `CLAUDE_MODEL_HEAVY` | 전략 판단 모델 (claude-sonnet-4-6) | 에이전트 |
| `CLAUDE_MODEL_LIGHT` | 빠른 작업 모델 (claude-haiku-4-5) | 에이전트 |
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | 에이전트 운영 채널 |
| `SLACK_SIGNING_SECRET` | Slack 서명 시크릿 | Webhook 검증 |
| `SLACK_CHANNEL_*` | 채널별 ID (14개) | 각 채널 메시지 발송 |
| `X_API_KEY` / `X_API_SECRET` | X (Twitter) OAuth 1.0a | CMO SNS 포스팅 |
| `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | X 사용자 토큰 | CMO SNS 포스팅 |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | Threads OAuth | CMO SNS 포스팅 |
| `THREADS_ACCESS_TOKEN` | Threads 장기 토큰 (60일) | CMO SNS 포스팅 |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram Graph API 토큰 | CMO 카드뉴스 캐러셀 |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram 비즈니스 계정 ID | CMO 카드뉴스 캐러셀 |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Facebook 페이지 토큰 | CMO 카드뉴스 + 텍스트 게시 |
| `FACEBOOK_PAGE_ID` | Facebook 페이지 ID | CMO 카드뉴스 + 텍스트 게시 |
| `BAND_ACCESS_TOKEN` | Naver Band 액세스 토큰 | CMO Band 게시 |
| `BAND_KEY` | Naver Band 앱 키 | CMO Band API |
| `CLOUDFLARE_R2_*` | R2 스토리지 | 이미지 업로드 |
| `ADMIN_JWT_SECRET` | 어드민 JWT | 어드민 인증 |
| `BOT_API_KEY_*` | 봇 API 인증 | 봇 엔드포인트 |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager 컨테이너 ID | 클라이언트 (layout.tsx) |
| `NEXT_PUBLIC_GA4_ID` | Google Analytics 4 측정 ID | GTM에서 참조 |

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
│               (네이버 3곳+82cook) │
│ CafeTrend     일별 트렌드 분석    │
└────────────────────────────────┘

┌── SNS 마케팅 실험 ─────────────┐
│ SocialPost       SNS 게시물      │
│ SocialExperiment A/B 실험 관리   │
│ ChannelDraft     채널 홍보 초안   │
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
| **SocialPlatform** | THREADS, X, INSTAGRAM, FACEBOOK, BAND |
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
│에러감시││SNS포스││모더레이션 ││기능사용││이상감지││수익   │
│보안감사││팅+실험││콘텐츠편성 ││여정분석││참여최적││추적   │
│크롤링 ││전략+리││댓글활성화 ││페르소나││화     ││       │
│헬스   ││뷰+매거││연결촉진   ││다양성 ││       ││       │
│       ││진+큐레││일자리매칭 ││       ││       ││       │
│       ││이션   ││대댓글체인 ││       ││       ││       │
└───────┘└───────┘└────┬─────┘└───────┘└───────┘└───────┘
                       │
              ┌────────┴─────────┐
              │   SEED (시드봇)    │ 하루 12회+마이크로4회
              │  50명 페르소나     │ 커뮤니티 활성화
              └──────────────────┘
```

### 5.2 에이전트 상세

#### 기존 에이전트 (v9)

| 에이전트 | 파일 | 스케줄 | AI 모델 | 역할 |
|---------|------|--------|---------|------|
| **CEO** | `ceo/morning-cycle.ts` | 매일 09:00 | Sonnet | DAU/게시글/댓글 KPI 분석, 창업자 브리핑 |
| **CEO** | `ceo/morning-sns-briefing.ts` | 매일 08:30 | Haiku | SNS 일일 성과 브리핑 |
| **CEO** | `ceo/weekly-report.ts` | 월요일 10:00 | Sonnet | 주간 KPI 종합 리포트 |
| **CTO** | `cto/health-check.ts` | 2시간마다 | Haiku | 서비스 헬스체크 (API, DB 응답속도) |
| **CTO** | `cto/error-monitor.ts` | 2시간마다 | Haiku | 에러 로그 분석 + 알림 |
| **CTO** | `cto/security-audit.ts` | 매일 06:00 | Haiku | 보안 감사 (로그인 실패, 에러 급증, 비용 이상) |
| **CMO** | `cmo/trend-analyzer.ts` | 매일 10:00 | Sonnet | 트렌드 분석, 콘텐츠 주제 제안 |
| **CMO** | `cmo/social-poster.ts` | 매일 15:00 | Haiku | Threads/X 텍스트 게시 (홍보 믹스 60/25/15) |
| **CMO** | `cmo/social-poster-visual.ts` | 매일 11:00 | Haiku | 카드뉴스 → IG/FB/Threads/Band 멀티플랫폼 게시 |
| **CMO** | `cmo/channel-seeder.ts` | 매일 11:30 | Haiku | 카카오 오픈챗/당근마켓/커뮤니티 홍보 초안 생성 |
| **CMO** | `cmo/knowledge-responder.ts` | 화/목/토 12:00 | Sonnet | 네이버 지식iN Q&A 초안 생성 |
| **CMO** | `cmo/seo-optimizer.ts` | 월요일 08:00 | Haiku | 주간 SEO 키워드 분석 + 메타데이터 커버리지 체크 |
| **CMO** | `cmo/social-metrics.ts` | 매일 20:00 | AI 불필요 | 48시간 내 게시물 멀티플랫폼 메트릭 수집 |
| **CMO** | `cmo/social-reviewer.ts` | 월요일 10:00 | Haiku | 주간 실험 분석 — 통제/실험군 비교, 인사이트 도출 |
| **CMO** | `cmo/social-strategy.ts` | 월요일 10:15 | Sonnet | 주간 전략 설계 — 실험 로드맵 + 트렌드 교차 참조 |
| **CPO** | `cpo/ux-analyzer.ts` | 매일 11:00 | Sonnet | UX 패턴 분석, 개선 제안 |
| **CPO** | `cpo/feature-tracker.ts` | 월요일 11:30 | Haiku | 주간 기능별 사용률 집계 + 추세 분석 |
| **CPO** | `cpo/journey-analyzer.ts` | 월요일 12:00 | Sonnet | 전환 퍼널, 등급 전환, 이탈 지점 분석 |
| **CDO** | `cdo/kpi-collector.ts` | 매일 22:00 | Haiku | DAU, 게시글, 댓글 등 KPI 수집 |
| **CDO** | `cdo/anomaly-detector.ts` | 2시간마다 | Haiku | KPI 이상치 감지 + 알림 |
| **CFO** | `cfo/cost-tracker.ts` | 매일 23:00 | Haiku | API 비용 추적 + 예산 경고 |
| **CFO** | `cfo/revenue-tracker.ts` | 매일 23:30 | Haiku | AdSense/CPS 수익 추적 |
| **COO** | `coo/job-scraper.ts` | 12/16/20시 | Haiku | 50plus.or.kr 일자리 크롤링 → AI 가공 → DB |
| **COO** | `coo/moderator.ts` | 09/15/21시 | Haiku | 신고 처리, 콘텐츠 모더레이션 |
| **COO** | `coo/content-scheduler.ts` | 매일 14:00 | Haiku | 에디터스 픽 + 시드 콘텐츠 편성 |
| **COO** | `coo/trending-scorer.ts` | 12/18시 | Haiku | 트렌딩 점수 계산 + HOT 강등 |
| **SEED** | `seed/scheduler.ts` | 하루 12회 (08~22시) | Haiku | 50명 페르소나 활동 (게시글, 댓글, 좋아요, 대댓글) + promotionLevel 자동 승격 |
| **SEED** | `seed/micro-scheduler.ts` | 하루 4회 (08/12/18/23시) | Haiku | 마이크로 활동 (댓글/대댓글/좋아요 전용, 글쓰기 없음) |

#### 신규 에이전트 (v10 — 2026-03-30 추가)

| 에이전트 | 파일 | 스케줄 | AI 모델 | 역할 |
|---------|------|--------|---------|------|
| **CMO** | `cmo/caregiving-curator.ts` | 매일 10:15 | Sonnet | P5(간병) 페르소나 전용 콘텐츠 큐레이션 |
| **CMO** | `cmo/health-anxiety-responder.ts` | 매일 10:45 | Sonnet | P2(건강불안) 건강 걱정 글에 공감 응답 생성 |
| **CMO** | `cmo/humor-curator.ts` | 매일 11:15 | Haiku | P3(유머소비) 유머 콘텐츠 큐레이션 + 추천 |
| **CMO** | `cmo/source-expander.ts` | 월요일 09:00 (주간) | Haiku | 콘텐츠 소스 다양성 분석 + 신규 소스 발굴 |
| **CMO** | `cmo/content-gap-finder.ts` | 금요일 09:00 (주간) | Haiku | 페르소나별 콘텐츠 갭 분석 + 보완 주제 제안 |
| **COO** | `coo/connection-facilitator.ts` | 매일 09:15, 15:00 | Sonnet | P1(느슨한 연결) 사용자 간 연결 촉진 |
| **COO** | `coo/job-matcher.ts` | 매일 11:45 | Haiku | P4(생계) 사용자 프로필 기반 일자리 매칭 |
| **COO** | `coo/comment-activator.ts` | 매일 10:30, 14:30, 20:00 | Haiku | 댓글 없는 글에 시드봇 댓글 유도 |
| **COO** | `coo/reply-chain-driver.ts` | 매일 12:15, 18:30 | Haiku | 대댓글 체인 형성 촉진 |
| **CTO** | `cto/crawler-health.ts` | 매일 07:00 | Haiku | 크롤러(카페/일자리) 정상 가동 모니터링 |
| **CDO** | `cdo/engagement-optimizer.ts` | 매일 22:30 | Sonnet | 참여도 패턴 분석 + 최적 활동 시간대 제안 |
| **CPO** | `cpo/persona-diversity-checker.ts` | 수요일 09:00 (주간) | Haiku | 5대 페르소나 콘텐츠 분포 균형 체크 |
| **Strategist** | `strategist/user-deep-analysis.ts` | 수동 | Opus | 사용자 심층 분석 — 페르소나/미션/비전 검증 |

### 5.3 에이전트 기반 구조 (core/)

| 파일 | 역할 |
|------|------|
| `core/agent.ts` | **BaseAgent** 추상 클래스 — 모든 에이전트가 상속. AI 호출, 로깅, 에러 처리 |
| `core/constitution.yaml` | **회사 헌법 v4.0** — 모든 에이전트 System Prompt에 주입. 서비스 정체성, 가드레일, 콘텐츠 정책 |
| `core/types.ts` | 타입 정의 (AgentResult, AgentConfig, NotifyPayload 등) |
| `core/db.ts` | Prisma 클라이언트 초기화 |
| `core/notifier.ts` | Slack + 어드민큐 알림 |
| `core/slack-commander.ts` | Slack 양방향 커맨드 (/status, /agents, /stop 등) |
| `core/approval-helper.ts` | Slack 버튼 승인 + 만료 처리 |
| `core/meeting.ts` | 에이전트 회의 관리 |
| `core/google-api.ts` | GA4/Search Console 연동 |
| `cmo/platforms/*-client.ts` | SNS 플랫폼 API 래퍼 (X, Threads, Instagram, Facebook, Band) |
| `cmo/card-news/generator.ts` | AI 카드뉴스 슬라이드 생성 (요일별 유형 로테이션) |
| `cmo/card-news/renderer.ts` | HTML → 1080×1350px JPEG 렌더링 (Playwright + Sharp + R2) |
| `seed/persona-data.ts` | **50명 페르소나 정의** — 캐릭터 시트 방식 (성격·말투·습관·금지사항·예시문장) |
| `skills/registry.ts` | 검증된 SNS 전략 스킬 레지스트리 (승률 기반 가중 선택) |

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
      │   └ Q&A 3개 (50·60대 눈높이)
      │   + 규칙 기반: displayTags 최대 3개, 급여 정규화
      ├→ Step 5: Post + JobDetail DB INSERT (Prisma)
      └→ Step 6: Slack #로그-일자리 요약 알림
```

### 5.5 SNS 바이럴 마케팅 파이프라인 (CMO)

```
┌── OBSERVE (매일 20:00) ─────────────────────────────────┐
│  social-metrics.ts → 메트릭 수집 → SocialPost 업데이트    │
└──────────────────┬──────────────────────────────────────┘
                   ▼
┌── ANALYZE (매주 월 10:00) ──────────────────────────────┐
│  social-reviewer.ts → A/B 비교 → AI 인사이트 도출        │
└──────────────────┬──────────────────────────────────────┘
                   ▼
┌── ACT (매주 월 10:15) ──────────────────────────────────┐
│  social-strategy.ts → 8주 로드맵 기반 다음 실험 설계       │
└──────────────────┬──────────────────────────────────────┘
                   ▼
┌── EXECUTE (매일 15:00) ──────────────────────────────────┐
│  social-poster.ts → 실험 config → 홍보 믹스 60/25/15     │
│  → 4명 SNS 페르소나 → Threads + X 게시                    │
└─────────────────────────────────────────────────────────┘
```

### 5.5.1 비주얼 카드뉴스 파이프라인 (CMO)

```
CafeTrend → card-news/generator.ts
  ├→ 요일별 유형 로테이션 (월수금:NEWS / 화목:INFO / 토일:COMMUNITY)
  ├→ Claude Haiku → JSON 슬라이드 3~7장 생성
  └→ card-news/renderer.ts
      ├→ HTML 템플릿 3종 + base.css → Playwright 렌더링 (1080×1350px)
      └→ Sharp JPEG → R2 업로드 → social-poster-visual.ts
          → IG 캐러셀 / FB 멀티포토 / Threads / Band 게시
```

### 5.5.2 매거진 자동 발행 (v2)

```
매거진 모닝 (09:45 KST) / 매거진 자동 (16:00 KST) / 매거진 이브닝 (19:30 KST)
  └→ cafe/magazine-generator.ts
      ├→ CafeTrend 기반 매거진 토픽 선정
      ├→ Claude 본문 생성 + DALL-E 커버 이미지
      └→ Post(MAGAZINE) DB 저장 + Slack 알림
```

### 5.6 시드 페르소나 (SEED) — 50명

> **v3 확장 (2026-03-30)**: 35명 → 50명. 5대 핵심 페르소나(P1-P5) 전용 캐릭터 15명(AJ-AX) 추가.
> **소스 코드**: `agents/seed/persona-data.ts` (YAML은 참조용)

#### 기존 (A-AI: 35명)

| 그룹 | ID 범위 | 인원 | 설명 |
|------|---------|------|------|
| 기존 리뉴얼 | A-T | 20명 | 긍정/활발 기본 캐릭터 |
| 부정/비판 | U-Z | 6명 | 비판적 시각, 현실주의 |
| 특수 캐릭터 | AA-AI | 9명 | 한탄, 논쟁, 사투리, 회고, 아재개그 등 |

#### 신규 (AJ-AX: 15명) — 5대 페르소나 전용

| ID | 닉네임 | 나이/성별 | 대상 페르소나 | 스타일 |
|----|--------|----------|-------------|--------|
| AJ | 간병일기 | 57/여 | P5 간병 | 간병 일상, 감정 토로, 실용 팁 |
| AK | 우리엄마 | 54/여 | P5 간병 | 치매 돌봄, 죄책감, 공감 댓글 |
| AL | 근육할머니 | 60/여 | P2 건강불안 | 크로스핏, 체력 자랑, 동기부여 |
| AM | 불안한밤 | 63/여 | P2 건강불안 | 건강 검색 과몰입, 불면증, 불안 |
| AN | 약국단골 | 61/남 | P2 건강불안 | 영양제 리뷰, 건강식품 비교 |
| AO | 웃음충전 | 55/여 | P3 유머 | 짤방 수집, 웃긴 이야기 |
| AP | 짤방요정 | 52/여 | P3 유머 | 드라마 짤, 유머 리액션 |
| AQ | 조용한수다 | 64/여 | P1 연결 | 느슨한 연결, 조용한 공감 |
| AR | 요즘세상 | 59/남 | P1 연결 | 세상 돌아가는 이야기, 소통 |
| AS | 일자리헌터 | 56/여 | P4 생계 | 구직 활동 일지, 면접 후기 |
| AT | 자격증도전 | 58/여 | P4 생계 | 자격증 공부, 재취업 도전 |
| AU | 철인할배 | 65/남 | P2 건강불안 | 마라톤/자전거, 운동 데이터 |
| AV | 혼밥일기 | 53/여 | P1 연결 | 혼자 사는 일상, 맛집 탐방 |
| AW | 손뜨개 | 62/여 | P1 연결 | 수공예, 만들기 과정 공유 |
| AX | 밴드여왕 | 59/여 | P3 유머 | 밴드/카톡 짤 수집, 유행어 |

> **성격 분포 (전체 50명)**: 긍정(18) + 중립(14) + 부정/비판(10) + 특이(8)
> **성별 비율**: 여 33명 / 남 17명 (타겟 유저 비율 반영)
> **일일 목표**: 게시글 25~30개 / 댓글 150~200개 / 좋아요 100~130개 / 대댓글 60~80개

### 5.6.1 시드봇 활동 메커니즘

| 기능 | 설명 |
|------|------|
| **캐릭터 시트 프롬프트** | 페르소나별 성격/습관/금지사항/예시문장을 System Prompt에 주입 → Haiku가 개성 있는 글 생성 |
| **mood 기반 댓글** | positive/neutral/negative/mixed에 따라 댓글 톤 차별화 |
| **마이크로 스케줄러** | 메인(12회)과 별도 시간대(4회)에 댓글/대댓글/좋아요 전용 활동 → 하루 16회 |
| **promotionLevel 자동 승격** | 좋아요 시 likeCount 체크 → 10+ HOT, 50+ HALL_OF_FAME 자동 승격 |
| **집중 좋아요 (21시)** | 48시간 내 likeCount 5~9인 글(HOT 근접) 최대 3개에 7명 봇 집중 투입 |
| **글 길이 다양화** | 3단계 랜덤: 짧은(60~120자) / 보통(150~300자) / 긴(400~600자) |
| **크로스보드 댓글** | 기본 보드 외 다른 게시판에도 댓글 활동 (HUMOR, WEEKLY) |

### 5.7 에이전트 규칙 (헌법 v4.0 핵심)

| 규칙 | 내용 |
|------|------|
| **DB 쓰기** | COO 에이전트만 가능, 나머지 읽기 전용 |
| **비용 상한** | $50/월, $40 도달 시 경고, 초과 시 즉시 중단 |
| **승인 필요** | UI/UX 변경, DB 스키마 변경, 새 에이전트 추가, 자동화 시작/중단 |
| **헌법 수정** | 창업자 승인 없이 수정 불가 |
| **콘텐츠 금지** | 정치, 혐오, 도박, 성인콘텐츠 (ABSOLUTE_ZERO) |
| **모델 정책** | strategic=Opus(주간 전략 1-2회) / heavy=Sonnet(고객 대면) / light=Haiku(데이터·모니터링) |
| **자동화 상태** | ACTIVE (2026-03-24 승인), 1클릭 긴급 중지 가능 |

---

## 6. GitHub Actions 워크플로우

### 6.1 CI/CD

| 파일 | 트리거 | 내용 |
|------|--------|------|
| `ci.yml` | PR, push to main | Lint → Typecheck → Test → Build (E2E: webServer 자동 시작) |
| `lighthouse.yml` | PR, push to main | Lighthouse 접근성 감사 |

### 6.2 에이전트 크론

| 파일 | 스케줄 (KST) | 에이전트 |
|------|-------------|---------|
| `agents-daily.yml` | 06~23시 (30+ 크론) | CEO, CMO, CPO, COO, CDO, CFO, CTO + 13개 신규 에이전트 |
| `agents-weekly.yml` | 월/수/금 09:00 | CMO(source-expander, content-gap-finder), CPO(persona-diversity-checker) |
| `agents-hourly.yml` | 2시간마다 | CTO(헬스체크, 에러감시), CDO(이상감지) |
| `agents-jobs.yml` | 12, 16, 20시 | COO(일자리 수집) |
| `agents-moderation.yml` | 09, 15, 21시 | COO(모더레이션) |
| `agents-seed.yml` | 09~22시 (12회) | SEED(시드 콘텐츠 + 댓글 + 좋아요) |
| `agents-seed-micro.yml` | 08, 12, 18, 23시 (4회) | SEED(마이크로 — 댓글/대댓글/좋아요 전용) |
| `agents-social.yml` | 09/11/11:30/12/20시 + 주간 | CMO(텍스트포스팅·카드뉴스·채널시딩·지식iN·SEO·메트릭·리뷰·전략·토큰갱신) |
| `agents-cafe.yml` | 09, 13, 19시 | CAFE(네이버 카페 3곳 + 82cook 크롤링) |

### 6.3 전체 타임라인 (KST)

```
06:00      CTO 보안감사
07:00      CTO 크롤링헬스
08:00 (월) CMO SEO옵티마이저
08:30      CEO SNS일일브리핑 | CAFE 크롤링(로컬)
09:00      CEO 모닝사이클 | SEED 활동 | COO 모더레이션 | CMO 텍스트포스팅
 (월)      CMO 소스확장(weekly)
09:15      COO 연결촉진(1차)
09:30      승인 리마인더
10:00      CMO 트렌드분석 | SEED 활동
 (월)      CMO 리뷰(10:00) → 전략(10:15)
10:15      CMO 간병큐레이션
10:30      COO 댓글활성화(1차) | CEO 주간리포트(월)
10:45      CMO 건강불안해소
11:00      CPO UX분석 | CMO 카드뉴스→멀티플랫폼
11:15      CMO 유머큐레이션
11:30      CMO 채널시딩
11:45      COO 일자리매칭
12:00      COO 일자리수집 | COO 트렌딩스코어 | CMO 지식iN(화/목/토)
 (월)      CPO 사용자여정
12:15      COO 대댓글체인(1차)
12:30      CAFE 크롤링(로컬)
13:00      CAFE 크롤링(Actions) | SEED 활동
14:00      COO 콘텐츠편성 | SEED 활동
14:30      COO 댓글활성화(2차)
15:00      COO 모더레이션 | COO 연결촉진(2차) | SEED 활동
16:00      매거진자동발행 | COO 일자리수집 | SEED 활동
18:00      COO 트렌딩스코어(2차)
18:30      COO 대댓글체인(2차) | CAFE 크롤링(로컬)
19:00      SEED 활동 | CAFE 크롤링(Actions)
19:30      매거진이브닝발행
20:00      COO 일자리수집 | COO 댓글활성화(3차) | CMO SNS메트릭수집
21:00      COO 모더레이션 | SEED 활동
22:00      CDO KPI수집 | SEED 활동
22:30      CDO 참여최적화
23:00      CFO 비용추적
23:30      CFO 수익추적
(2h)       CTO 헬스체크 + 에러감시 + CDO 이상감지
(micro)    SEED 마이크로 08/12/18/23시
```

---

## 7. Webhook & 외부 연동

| 연동 | 엔드포인트 | 방향 | 용도 |
|------|-----------|------|------|
| **Kakao OAuth** | `/api/auth/[...nextauth]` | 인바운드 | 사용자 로그인 |
| **Slack Events** | `/api/slack` | 인바운드 | 슬래시 커맨드, 인터랙티브 (버튼 승인) |
| **Slack Web API** | `slack.com/api/*` | 아웃바운드 | 메시지 발송, 채널 관리 |
| **Anthropic API** | `api.anthropic.com` | 아웃바운드 | AI 에이전트 호출 |
| **Cloudflare R2** | `*.r2.cloudflarestorage.com` | 아웃바운드 | 이미지 업로드/서빙 |
| **Threads API** | `graph.threads.net/*` | 아웃바운드 | SNS 게시 + 메트릭 (OAuth 2.0, 60일 토큰) |
| **X API v2** | `api.x.com/2/*` | 아웃바운드 | SNS 게시 + 메트릭 (OAuth 1.0a HMAC-SHA1) |
| **Instagram Graph API** | `graph.facebook.com/v21.0/*` | 아웃바운드 | 카드뉴스 캐러셀 게시 (3단계 프로세스) |
| **Facebook Graph API** | `graph.facebook.com/v21.0/*` | 아웃바운드 | 멀티포토 + 텍스트 페이지 게시 |
| **Naver Band API** | `openapi.band.us/v2.2/*` | 아웃바운드 | 밴드 텍스트+이미지 게시 |
| **Google Tag Manager** | `www.googletagmanager.com` | 아웃바운드 | 태그 관리 (GTM 컨테이너 로드) |
| **Google Analytics 4** | `www.google-analytics.com` | 아웃바운드 | 사용자 행동 분석 (GTM 경유) |
| **50plus.or.kr** | 웹 크롤링 | 아웃바운드 | 일자리 수집 |
| **82cook.com** | 웹 크롤링 (Playwright headless) | 아웃바운드 | 커뮤니티 콘텐츠 수집 (자유게시판 bn=15, 공개) |
| **Coupang Partners** | `ads-partners.coupang.com` | 아웃바운드 | 다이나믹 배너, 검색 위젯, CPS API |
| **OpenAI DALL-E** | `api.openai.com` | 아웃바운드 | 매거진 커버 이미지 생성 |

### 7.1 Slack 운영 채널

```
Slack Workspace: 우나어-ops (14개 채널)

★ 창업자 전용
  #ceo-창업자        CEO↔창업자 양방향 (지시·승인·KPI)
  #일일-브리핑       CEO→창업자 매일 09:00 KPI 스냅샷
  #주간-리포트       CEO→창업자 월 10:00 종합

★ 에이전트 협업
  #에이전트-회의실   주간/긴급/1:1 회의 (CEO 의장)
  #회의록           스레드 기반 아카이브

★ 알림 (심각도별)
  #알림-긴급        🔴 서비스다운, KPI 20%+하락, 비용 $40 초과
  #알림-시스템      🟡 헬스체크, 에러로그, 배포결과
  #알림-KPI        🟡 KPI 변동, 임계값 근접

★ 자동화 로그 (묵음 가능)
  #로그-일자리      COO 수집결과
  #로그-콘텐츠      SEED/매거진
  #로그-마케팅      CMO SNS결과
  #로그-비용        CFO 비용/수익

★ 성장/승인
  #실험-보드        실험 라이프사이클 관리
  #승인-대기        Slack 버튼 기반 승인 큐
```

### 7.2 Slack 커맨드

| 커맨드 | 기능 |
|--------|------|
| `/status` | 현재 KPI 요약 |
| `/agents` | 에이전트 상태 |
| `/approve` | Gate 1 승인 |
| `/feedback [내용]` | Gate 1 피드백 |
| `/stop` | 전체 자동화 긴급 중지 |
| `/run [에이전트명]` | 수동 실행 |
| `/cost` | 이번 달 비용 현황 |
| `/social` | SNS 성과 요약 |
| `/experiment` | 현재 실험 상태 |

---

## 8. MCP 서버

| MCP | 용도 | 상태 |
|-----|------|------|
| **context7** | 라이브러리 문서 조회 | 활성 |
| **figma-write** | Figma 디자인 연동 | 활성 |
| **github** | GitHub 이슈/PR 관리 | 활성 |
| **sequential-thinking** | 복잡한 추론 체이닝 | 활성 |

---

## 9. UI 원칙 (50·60대 친화)

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
| `/api/uploads` | POST | 이미지 업로드 (R2) |
| `/api/ad-click` | POST | 광고 클릭 추적 |
| `/api/events` | POST | 분석 이벤트 로깅 |
| `/api/slack` | POST | Slack Events + 커맨드 |
| `/api/threads/auth` | GET | Threads OAuth 시작 |
| `/api/threads/callback` | GET | Threads OAuth 콜백 |
| `/api/bot/*` | * | 봇 API (check, jobs, posts, logs) |

---

## 11. 컴포넌트 구조

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
| **광고** | 10개 | AdSenseUnit, AdSlot, CoupangCPS/Banner/CategoryBanner/SearchWidget, FeedAd, MobileStickyAd + ad-slots.ts |
| **어드민** | 11개 | MemberTable, ContentTable, ReportTable, BannerManager |
| **공통** | 10개 | UserAvatar, ShareButton, OfflineBanner, PageViewTracker, GoogleTagManager, Breadcrumbs |

---

## 12. 폴더·파일 구조

```
/Users/yanadoo/Documents/New_Claude_agenotmatter/
│
├── 📁 src/                          # 메인 애플리케이션
│   ├── 📁 app/                      # Next.js App Router
│   │   ├── layout.tsx               # 루트 레이아웃 (폰트, 메타데이터)
│   │   ├── error.tsx / not-found.tsx # 에러 처리
│   │   ├── sitemap.ts / robots.ts   # SEO
│   │   ├── 📁 (main)/              # 메인 레이아웃 그룹
│   │   │   ├── page.tsx            # 홈
│   │   │   ├── 📁 jobs/            # 일자리
│   │   │   ├── 📁 magazine/        # 매거진
│   │   │   ├── 📁 community/       # 커뮤니티
│   │   │   ├── 📁 best/            # 인기글
│   │   │   ├── 📁 search/          # 검색
│   │   │   ├── 📁 my/              # 마이페이지
│   │   │   └── 📁 about|faq|...    # 정보 페이지
│   │   ├── 📁 admin/               # 어드민 패널
│   │   ├── 📁 api/                 # API 라우트
│   │   ├── login/ / onboarding/
│   │
│   ├── 📁 components/              # React 컴포넌트 (77+개)
│   │   ├── ui/ layouts/ icons/ ad/ common/ admin/
│   │   └── 📁 features/            # 기능별 (home, community, jobs, search, my, auth)
│   │
│   ├── 📁 lib/                     # 유틸리티 & 비즈니스 로직
│   │   ├── prisma.ts / auth.ts / admin-auth.ts / bot-auth.ts
│   │   ├── format.ts / sanitize.ts / grade.ts / banned-words.ts
│   │   ├── r2.ts / rate-limit.ts / gtm.ts / track.ts / utils.ts / errors.ts
│   │   ├── 📁 actions/ (13개) / 📁 queries/ (6개)
│   │
│   ├── 📁 types/ / 📁 generated/prisma/ / 📁 __tests__/
│   └── middleware.ts
│
├── 📁 agents/                       # AI 에이전트 시스템
│   ├── 📁 core/                    # 기반 인프라 (agent, constitution, notifier, db, slack-commander, approval-helper, meeting, google-api)
│   ├── 📁 cron/                    # 크론 스케줄러 (runner, schedules.yaml, dependencies)
│   ├── 📁 ceo/ cto/ cmo/ cpo/ cdo/ cfo/ coo/  # C-level 에이전트
│   ├── 📁 seed/                    # 시드봇 (50명 페르소나 + 마이크로 스케줄러)
│   ├── 📁 cafe/                    # 카페 크롤러 + 매거진 생성기
│   ├── 📁 strategist/             # 전략 에이전트 (Opus 기반 심층 분석)
│   └── 📁 skills/                  # SNS 전략 스킬 레지스트리
│
├── 📁 prisma/                       # DB 스키마 + 마이그레이션
├── 📁 scripts/                      # 유틸리티 스크립트
├── 📁 public/                       # 정적 파일 (logo, manifest, sw.js)
├── 📁 .github/workflows/           # CI/CD + 에이전트 크론 (10개)
├── 📁 docs/                         # 문서 (prd/, reports/, 이 문서)
├── 📁 e2e/                          # E2E 테스트
├── CLAUDE.md                        # Claude Code 지시사항
└── package.json / next.config.js / tailwind.config.ts / tsconfig.json
```

---

## 13. 예산

| 항목 | 월 비용 |
|------|--------|
| 기존 에이전트 AI (7 C-level + SEED) | ~$15 |
| 일자리 스크래퍼 AI | ~$3 |
| SNS 자동화 AI (텍스트+카드뉴스+채널시딩+지식iN) | ~$5 |
| 신규 에이전트 13개 (daily 13 + weekly 3) | ~$8 |
| 매거진 v2 (모닝+자동+이브닝, DALL-E 커버) | ~$12 |
| Strategist (Opus, 수동/주간) | ~$5 |
| Vercel Hosting | $0 (Hobby) |
| Supabase DB | $0 (Free tier) |
| GitHub Actions | $0 (Free 2,000분/월) |
| Cloudflare R2 + DNS | $0 (Free tier) |
| 도메인 (가비아) | ~$1.5 (연 $18) |
| **합계** | **~$49.5/월** |
| **예산 상한** | **$50/월** |

---

## 14. 현재 상태 & 남은 작업

### 완료됨 (3/30 기준)

#### 인프라 & 기본 기능
- 전체 코드 구현 (47페이지, 19+ API, 77+ 컴포넌트)
- 에이전트 시스템 ACTIVE (헌법 v4.0)
- 일자리 자동 수집 파이프라인 (Waterfall 4단계)
- 카페 크롤링 파이프라인 (네이버 3곳 + 82cook)
- 수익 컴포넌트 (AdSense pub: ca-pub-4117999106913048 + Coupang Partners)
- SEO JSON-LD + sitemap + Breadcrumbs + 동적 OG 이미지
- GTM + GA4 애널리틱스 기반 (15개 커스텀 이벤트)

#### SNS 마케팅 시스템
- SNS 바이럴 마케팅 실험 시스템 (A/B 테스트 8주 로드맵)
- 멀티채널 마케팅 자동화 (카드뉴스 + IG/FB/Threads/Band + 채널시딩 + 지식iN)
- Skills 레지스트리 (검증된 전략 코드화)

#### 커뮤니티 활성화
- 시드봇 50명 페르소나 (캐릭터 시트 방식, mood 기반 댓글)
- 마이크로 스케줄러 (메인 12회 + 마이크로 4회)
- promotionLevel 자동 승격 + 집중 좋아요

#### 3/30 신규 완료
- 헌법 v4.0 (5대 페르소나 + 모델 정책 + 트렌딩 정책 + SNS 전략 + 보안)
- 50명 페르소나 확장 (P1-P5 전용 15명 추가: AJ-AX)
- 매거진 v2 (모닝/자동/이브닝 3회 발행 + DALL-E 커버 이미지)
- 13개 신규 에이전트 (페르소나별 큐레이션 + 커뮤니티 활성화 + 주간 분석)
- ESLint 19개 에러 수정 + AdSense pub ID 교체
- CI E2E 테스트 webServer 자동 시작
- Strategist: 사용자 심층 분석 에이전트 (Opus 기반)
- 트렌딩 시스템 DB 마이그레이션 (trendingScore + lastEngagedAt)
- CLAUDE_MODEL_STRATEGIC 워크플로우 env 연결

### 창업자 대기 작업
- [ ] 도메인 만기 연장 (2026-04-25)
- [ ] 커스텀 도메인 연결 (Cloudflare → Vercel)
- [ ] Slack Workspace + App 설정
- [x] GitHub Actions secrets 설정 (Meta 토큰 완료)
- [x] Threads OAuth 토큰 발급 완료
- [x] Google AdSense 등록 완료 (13곳 배치)
- [x] 쿠팡 파트너스 가입 완료
- [ ] Facebook `pages_manage_posts` 권한 추가
- [ ] X (Twitter) 개발자 토큰 발급
- [ ] Band API 등록 완료 + 토큰 발급
- [ ] GA4 계정/속성 생성 → 측정 ID 발급
- [ ] GTM 컨테이너 생성 → 컨테이너 ID 발급

### 향후 확장 (Phase 3+)
- CEO 자동 의사결정 프레임워크
- CDO 퍼널 분석기 (GA4 데이터 연동)
- 카카오톡 채널 / YouTube Shorts 확장
- 카드뉴스 팀 에이전트 토론 구조

---

## 15. KPI 프레임워크

### 15.1 KPI 트리

```
                    ┌─────────────────────┐
                    │  North Star Metric   │
                    │  주간 활성 사용자(WAU) │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
     │  성장 지표     │  │  참여 지표     │  │  수익 지표     │
     │ DAU, 신규가입  │  │ 글/댓글, 체류  │  │ AdSense RPM  │
     │ SEO유입, 소셜  │  │ 좋아요, 리텐션 │  │ CPS 전환율    │
     └──────────────┘  └──────────────┘  └──────────────┘
```

### 15.2 KPI 정의 테이블

| 카테고리 | KPI | 현재 값 | 1차 목표 | 3개월 목표 | 담당 |
|---------|-----|---------|---------|-----------|------|
| **North Star** | WAU | 측정 전 | 50 | 300 | CEO |
| **성장** | DAU | 측정 전 | 20 | 100 | CDO |
| **성장** | 신규 가입/주 | 측정 전 | 10 | 50 | CDO |
| **성장** | SEO 유입/일 | 측정 전 | 10 | 50 | CMO |
| **참여** | 게시글/일 | ~5 | 8 | 15 | COO |
| **참여** | 댓글/일 | ~10 | 15 | 30 | COO |
| **참여** | UGC 비율 | 0% | 10% | 30% | CDO |
| **참여** | 7일 리텐션 | 측정 전 | 15% | 30% | CPO |
| **수익** | 월 수익 | $0 | $10 | $50 | CFO |
| **안정성** | 업타임 | 측정 전 | 99% | 99.5% | CTO |

### 15.3 CEO — 창업자 커뮤니케이션 구조

- **수시**: 창업자 → CEO: KPI 방향 지시 / CEO → 창업자: KPI 이상 징후 보고
- **Daily**: CEO → 창업자: #일일-브리핑 (KPI 스냅샷 + 에이전트 활동 + 대기건)
- **Weekly**: CEO → 창업자: #주간-리포트 (KPI 변동 + 회의 결과 + Gate 1 대기)
- **Monthly**: CEO ↔ 창업자: KPI 목표 재설정

---

## 16. 성장 루프 — Data-Driven Growth Cycle

### 16.1 Growth Loop (v2)

```
DATA(수집) → PROBLEM(정의) → HYPOTHESIS(가설) → ⛔ Gate 1(창업자 승인)
                                                       │
                     ┌─────────────────────────────────┘
                     ▼
EXPERIMENT(설계) → EXECUTE(실행) → ⛔ Gate 2(사용자 피드백) → RETRO(회고) → 다음 사이클
```

- **Gate 1**: 에이전트가 문제 정의 + 가설 수립 → 창업자가 검토/승인/피드백. 승인 전까지 실험 불가.
- **Gate 2**: 실행 후 정량(KPI 변동) + 정성(댓글 반응, 창업자 관찰) 수집 → 회고.

### 16.2 단계별 역할

| 단계 | 주 담당 | 산출물 | 창업자 역할 |
|------|---------|--------|------------|
| DATA | CDO | KPI 데이터 | 없음 (자동) |
| PROBLEM | CEO | 문제 정의서 | 없음 (자동) |
| HYPOTHESIS | CEO+CMO+CPO | 가설 초안 | 없음 (자동) |
| Gate 1 | — | — | **검토 + 승인/피드백** |
| EXPERIMENT | CPO | 실험 계획서 | 없음 |
| EXECUTE | COO+CTO | 코드 배포 | 없음 |
| Gate 2 | CDO | 사용자 반응 | **결과 확인** |
| RETRO | CEO | 학습 + 다음 액션 | **최종 판단** |

---

## 17. QA & 배포 안정성

### 현재 CI 파이프라인

| 항목 | 상태 |
|------|------|
| tsc + ESLint (Husky pre-commit) | ✅ |
| CI 빌드 검증 (ci.yml) | ✅ |
| Lighthouse 접근성 (lighthouse.yml) | ✅ |
| E2E Playwright (CI webServer 자동 시작) | ✅ |
| Preview QA (Vercel PR Preview URL) | ⚠️ URL 있으나 체크리스트 없음 |
| 배포 후 스모크 테스트 | ❌ 미구축 |
| 에이전트 프롬프트 QA | ❌ 미구축 |

### 목표 파이프라인

```
개발(로컬) → PR 검증(CI: lint+type+test+build) → Preview(QA) → 프로덕션(배포)
```

---

## 18. 에이전트 협업 시스템

### 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **에이전트는 제안, 창업자가 결정** | 문제 정의/가설을 만들어 창업자에게 제출 |
| **Gate 1 필수** | 모든 실험은 창업자 승인 없이 시작 불가 |
| **Gate 2 필수** | 사용자 피드백(정량+정성) 없이 회고 불가 |
| **CEO가 의장** | 회의는 CEO가 소집하고 초안 결정. 최종 결정권은 창업자 |
| **비동기 우선** | 긴급 상황 외 AgentMessage로 비동기 소통 |
| **학습 축적** | 실험 결과 + 창업자 피드백 + 사용자 반응 DB 저장 |

### 회의 유형

| 유형 | 빈도 | 참석 | 트리거 |
|------|------|------|--------|
| **정기 회의** | 주 1회 (월 09:00) | 전원 | CEO 자동 소집 |
| **긴급 회의** | 이슈 발생 시 | 관련 에이전트만 | KPI 20%+ 급변, 서비스 다운, 비용 $40 초과 |
| **1:1 협의** | 필요 시 | 2명 | AgentMessage(type: REQUEST) |

---

## 19. 아키텍처 갭 분석

### 성숙도 맵

```
████████████  코드 (47페이지, 77+컴포넌트)              ✅ 완료
████████████  에이전트 (7 C-level + 13 신규 + SEED 50명) ✅ 완료
████████████  CI/CD (빌드, 린트, 타입체크, E2E)          ✅ 완료
████████████  SNS 실험 관리 + 학습 축적                  ✅ 완료
████████████  매거진 v2 (3회/일 + DALL-E)               ✅ 완료
████████░░░░  QA (Preview 있으나 체크리스트 없음)         ⚠️ 부분
████████░░░░  모니터링 (GTM+GA4 구축, 대시보드 미설정)    ⚠️ 부분
████░░░░░░░░  에이전트 협업 (메시지 버스 부분 구축)       ⚠️ 부분
████░░░░░░░░  운영 채널 (Slack 설정 대기)                ⚠️ 대기
██░░░░░░░░░░  KPI 프레임워크 (목표 테이블 미구축)         ❌ 미구축
██░░░░░░░░░░  성장 루프 (Gate 체계 설계만)               ❌ 미구축
```

### 우선순위별 갭

| 우선순위 | 갭 | 필요한 것 | 담당 |
|---------|-----|----------|------|
| **P0** | 도메인 연결 | Cloudflare → Vercel CNAME | 창업자 |
| **P0** | Slack Workspace | Slack App + 채널 생성 | 창업자 |
| **P1** | 배포 후 스모크 | CTO deploy-verifier.ts | 개발 |
| **P1** | KPI 목표 테이블 | KpiTarget 모델 + CEO 리포트 | 개발 |
| **P1** | 에이전트 메시지 버스 | AgentMessage 테이블 | 개발 |
| **P2** | 회고 자동화 | CEO retrospective.ts | 개발 |
| **P2** | 에이전트 프롬프트 QA | prompt-qa.ts 비교 도구 | 개발 |
| **P3** | 퍼널 분석 | CDO funnel-analyzer.ts | 개발 |
| **P3** | 자동 롤백 | 에러율 기반 자동 롤백 | 개발 |

---

## 문서 업데이트 가이드

### 업데이트 트리거

| 변경 사항 | 업데이트할 섹션 |
|-----------|---------------|
| 새 에이전트 추가 | 5. AI 에이전트 시스템 |
| 새 페이지/API 추가 | 10. 페이지 구조 |
| DB 모델 변경 | 4. 데이터베이스 스키마 |
| 워크플로우 변경 | 6. GitHub Actions |
| 외부 연동 추가 | 7. Webhook & 외부 연동 |
| 환경변수 추가 | 3.1 환경 변수 |
| KPI 목표 변경 | 15. KPI 프레임워크 |

### 관련 문서

| 문서 | 경로 |
|------|------|
| **이 문서 (종합 아키텍처)** | `docs/SERVICE_ARCHITECTURE.md` |
| Claude Code 지시사항 | `CLAUDE.md` |
| 에이전트 지시사항 | `agents/CLAUDE.md` |
| 회사 헌법 | `agents/core/constitution.yaml` |
| PRD 문서 | `docs/prd/` |
| DB 스키마 | `prisma/schema.prisma` |
| 환경변수 템플릿 | `.env.example` |
