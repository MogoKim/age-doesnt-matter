# Feature Registry — 우나어 (age-doesnt-matter.com)

> 모든 기능의 단일 진실의 원천.
> **Claude가 /done 실행 시 자동 업데이트한다. 수동으로 편집하지 마라.**

마지막 갱신: 2026-04-30 (CMA 충족욕망·타겟페르소나 컬럼 전수 매핑)

---

## 사용 방법

- **신규 기능 추가** → 행 추가 + `docs/features/{id}-{name}.md` 생성
- **기능 개선** → `최근변경` 날짜 + 해당 feature 문서 수정이력 업데이트
- **기능 제거** → 상태 `ARCHIVED` 변경 + 제거일 기록 + feature 문서에 사유 추가

---

## CMA 규칙 (Customer-Mission Anchor)

> 기능이 **누구를 위해** 존재하는지 항상 추적 가능하게 한다.

- 신규 기능 추가 시 `충족욕망` + `타겟페르소나` 필수 기입
- 허용 표기: `RELATION` / `HEALTH` / `MONEY` / `RETIRE` / `FREEDOM` / `DIGNITY` / `INFRA`
- 타겟페르소나: `P1`(영숙씨) / `P2`(정희씨) / `P3`(미영씨) / `P4`(순자씨) / `P5`(현주씨) / `ALL` / `—`(운영용)
- 욕망 정의 참조: `agents/core/constitution.yaml` desire_priority 섹션
- 미입력 시: `/done` 게이트 WARN

---

## PATH MAP (Claude 자동 감지용)

Claude는 변경 파일 경로를 아래 패턴과 매칭해 영향받는 Feature ID를 자동 식별한다.

| 파일 패턴 | Feature ID |
|----------|-----------|
| `src/components/common/SignupPromptBanner*` | F01 |
| `src/components/common/AddToHomeScreen*` | F02 |
| `src/components/features/hero*`, `src/app/(main)/page.tsx` | F03 |
| `src/app/(main)/community*`, `src/components/features/community*` | F04 |
| `src/app/(main)/magazine*`, `src/components/features/magazine*`, `agents/cafe/magazine*`, `agents/magazine*` | F05 |
| `src/app/(main)/jobs*`, `src/components/features/jobs*`, `agents/coo/job*` | F06 |
| `src/app/(main)/best*` | F07 |
| `src/app/(main)/search*` | F08 |
| `src/app/(admin)*` | F09 |
| `agents/cafe/crawler*`, `agents/cafe/psych*`, `agents/cafe/trend*`, `agents/cafe/daily-brief*` | A01 |
| `agents/cafe/local-magazine*`, `agents/cafe/magazine-generator*`, `agents/cafe/image-generator*`, `agents/cafe/thumbnail*` | A02 |
| `agents/coo/job-scraper*` | A03 |
| `agents/community/fmkorea*`, `agents/cmo/sheet-scraper*` | A04 |
| `agents/seed*`, `agents/coo/seed*` | A05 |
| `agents/cmo/social*`, `agents/cmo/threads*`, `agents/cmo/x-*`, `agents/cmo/instagram*` | A06 |
| `agents/cmo/card-news*`, `agents/design*` | A07 |
| `agents/cmo/knowledge*`, `agents/cmo/jisik*` | A08 |
| `agents/cmo/seo*`, `agents/cdo/seo*` | A09 |
| `agents/cmo/channel*` | A10 |
| `agents/cto/health*`, `agents/cto/error*`, `agents/cto/crawler-health*` | M01 |
| `agents/qa/*` | M02 |
| `agents/cafe/brief-monitor*` | M03 |
| `launchd/*`, `~/Library/LaunchAgents/com.unaeo*` | I01 |
| `src/lib/rate-limit*`, `agents/core/rate*` | I02 |
| `src/lib/r2*`, `agents/core/r2*` | I03 |
| `src/lib/google-index*`, `agents/core/indexing*` | I04 |
| `src/components/ad/*`, `src/app/api/adsense*` | R01 |
| `src/components/ad/Coupang*`, `agents/cafe/cps*` | R02 |

---

## Frontend Features

| ID | 기능명 | 코드 위치 | 트리거 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|--------|---------|------------|------|------|---------|
| F01 | 회원가입 유도 배너 | `src/components/common/SignupPromptBanner.tsx` | 20초 체류 + 50% 스크롤 | RELATION | ALL | [F01](F01-signup-prompt.md) | ACTIVE | 2026-04-27 |
| F02 | PWA 설치 유도 | `src/components/common/AddToHomeScreen.tsx` | 4단계 트리거 (13s/3페이지/행동/주간) | RELATION+HEALTH | P1·P2 | [F02](F02-pwa-install.md) | ACTIVE | 2026-04-27 |
| F03 | 히어로 배너 | `src/components/features/home/HeroSlider.tsx` | 홈 방문 | RELATION | P1 | [F03](F03-hero-banner.md) | ACTIVE | 2026-04-27 |
| F04 | 커뮤니티 게시판 | `src/app/(main)/community/` | 사용자 작성 | RELATION+HEALTH | P1·P2·P5 | `docs/specs/01-community.md` | ACTIVE | 2026-05-02 |
| F05 | 매거진 | `src/app/(main)/magazine/` | 자동생성(A02) + 사용자 탐색 | HEALTH+MONEY+RETIRE | P2·P4 | [F05](F05-magazine.md) | ACTIVE | 2026-05-02 |
| F06 | 일자리 게시판 | `src/app/(main)/jobs/` | 자동수집(A03) + 사용자 탐색 | MONEY | P4 | [A03](A03-job-scraper.md) | ACTIVE | 2026-04-27 |
| F07 | 베스트 탭 | `src/app/(main)/best/` | trendingScore 상위 | RELATION | P3 | `docs/specs/05-best.md` | ACTIVE | 2026-05-02 |
| F08 | 검색 | `src/app/(main)/search/` | 사용자 검색 | ALL | ALL | `docs/specs/04-search.md` | ACTIVE | 2026-05-02 |
| F09 | 어드민 패널 | `src/app/(admin)/` | 운영자 접근 | INFRA | — | `docs/specs/09-admin.md` | ACTIVE | 2026-04-05 |
| F10 | 최상단 띠 배너 | `src/components/layouts/TopPromoBanner.tsx` + `TopPromoBannerClient.tsx` + `src/components/admin/TopPromoBannerPanel.tsx` | DB Setting 테이블 (어드민 관리) | RELATION | ALL | [F10](F10-top-promo-banner.md) | ACTIVE | 2026-04-29 |
| F11 | 비회원 댓글+좋아요 | `src/lib/actions/guest-comments.ts` + `src/lib/actions/guest-likes.ts` + `src/lib/turnstile.ts` + `src/components/features/community/GuestCommentInput.tsx` + `GuestPasswordModal.tsx` | 비로그인 사용자 직접 참여 | RELATION | P1/P2/P3 | [F11](F11-guest-comment-like.md) | ACTIVE | 2026-05-02 |

---

## Automation Features (에이전트)

| ID | 기능명 | 코드 위치 | 스케줄/트리거 | 실행환경 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|-------------|---------|---------|------------|------|------|---------|
| A01 | 카페 크롤러 파이프라인 | `agents/cafe/crawler.ts` + `psych-analyzer.ts` + `trend-analyzer.ts` + `daily-brief.ts` | launchd 08:30·12:30·20:40 KST (DEEP/QUICK/ALL) | LOCAL_ONLY | INFRA | — | [A01](A01-cafe-crawler.md) | ACTIVE | 2026-04-27 |
| A02 | 매거진 자동생성 | `agents/cafe/magazine-generator.ts` + `local-magazine-runner.ts` | launchd 15:00, 17:00 KST | LOCAL_ONLY | HEALTH+MONEY+RETIRE | P2·P4 | [F05](F05-magazine.md) | ACTIVE | 2026-04-29 |
| A03 | 일자리봇 | `agents/coo/job-scraper.ts` | GHA 12:00·16:00·20:00 KST | GHA | MONEY | P4 | [A03](A03-job-scraper.md) | ACTIVE | 2026-04-27 |
| A04 | 외부 콘텐츠 스크래퍼 | `agents/cmo/sheet-scraper.ts` + `agents/community/fmkorea-scraper.ts` | GHA 11:00·21:00 KST (오유·네이트판) / launchd 11:30·21:30 KST (펨코) | GHA+LOCAL | RELATION | P1·P3 | [A04](A04-external-content.md) | ACTIVE | 2026-04-27 |
| A05 | 시드봇 35명 | `agents/seed/` | GHA 하루 16회 (08~23시) | GHA | RELATION+HEALTH | ALL | [A05](A05-seed-bot.md) | ACTIVE | 2026-04-27 |
| A06 | SNS 자동 포스팅 | `agents/cmo/social-poster.ts` + `social-poster-visual.ts` | GHA 07:00·12:00·15:00 KST | GHA | RELATION | — | [A06](A06-sns-posting.md) | ACTIVE | 2026-04-27 |
| A07 | 카드뉴스 생성 | `agents/cmo/card-news-generator.ts` | GHA 11:00 KST | GHA | RELATION | — | [A07](A07-card-news.md) | ACTIVE | 2026-04-27 |
| A08 | 지식인 답변 | `agents/cmo/knowledge-responder.ts` | launchd 14:30 KST (화/목/토) | LOCAL_ONLY | HEALTH+MONEY | P2·P4 | - | ACTIVE | 2026-04-05 |
| A09 | SEO 최적화 | `agents/cmo/seo-optimizer.ts` | GHA 일 08:00 KST (크론 미연결) | GHA | INFRA | — | [A09](A09-seo-optimizer.md) | ACTIVE | 2026-04-27 |
| A10 | 채널 시딩 | `agents/cmo/channel-seeder.ts` | GHA 11:30 KST | GHA | RELATION | — | [A10](A10-channel-seeder.md) | ACTIVE | 2026-04-27 |

---

## Monitoring Features

| ID | 기능명 | 코드 위치 | 스케줄 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|--------|---------|------------|------|------|---------|
| M01 | CTO 헬스체크 + 에러모니터 | `agents/cto/health-check.ts` + `error-monitor.ts` + `crawler-health.ts` | GHA 4시간마다 | INFRA | — | [M01](M01-cto-monitoring.md) | ACTIVE | 2026-04-27 |
| M02 | QA 콘텐츠 감사 | `agents/qa/content-audit.ts` | GHA 매일 08:20 KST | INFRA | — | [M02](M02-qa-content-audit.md) | ACTIVE | 2026-04-27 |
| M03 | 브리프 모니터 | `agents/cafe/brief-monitor.ts` | GHA 09:30 KST | INFRA | — | [M03](M03-brief-monitor.md) | ACTIVE | 2026-04-27 |
| M04 | Threads 토큰 갱신 알림 | `agents/cmo/threads-token-check.ts` | GHA 수 10:00 KST | INFRA | — | [M04](M04-threads-token.md) | ACTIVE | 2026-04-27 |

---

## Infrastructure Features

| ID | 기능명 | 코드/설정 위치 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|--------------|---------|------------|------|------|---------|
| I01 | launchd 로컬 스케줄러 | `~/Library/LaunchAgents/com.unaeo.*.plist` | INFRA | — | [I01](I01-launchd-scheduler.md) | ACTIVE | 2026-04-27 |
| I02 | Upstash Redis 레이트리밋 | `src/lib/rate-limit.ts` | INFRA | — | [I02](I02-redis-ratelimit.md) | ACTIVE | 2026-04-27 |
| I03 | Cloudflare R2 이미지 저장소 | `src/lib/r2.ts` + `agents/core/r2.ts` | INFRA | — | [I03](I03-r2-storage.md) | ACTIVE | 2026-04-27 |
| I04 | Google Indexing API | 발행 시 자동 호출 | INFRA | — | [I04](I04-google-indexing.md) | ACTIVE | 2026-04-27 |

---

## Revenue Features

| ID | 기능명 | 코드 위치 | 배치 위치 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|---------|---------|------------|------|------|---------|
| R01 | AdSense 광고 | `src/components/ad/AdSenseUnit.tsx` | 홈·매거진·커뮤니티·일자리·검색·베스트 | INFRA | — | [R01](R01-adsense.md) | ACTIVE | 2026-04-27 |
| R02 | 쿠팡 파트너스 CPS | `src/components/ad/CoupangBanner.tsx` + `agents/cafe/cps-matcher.ts` | 매거진 상세·목록·전 페이지 배너 | MONEY | P2·P4 | [R02](R02-coupang-cps.md) | ACTIVE | 2026-04-27 |

---

## ARCHIVED Features

| ID | 기능명 | 제거일 | 제거 사유 |
|----|--------|--------|---------|
| A99 | GHA 매거진 크론 | 2026-04-10 | launchd 로컬 이관 (Playwright 이미지 생성 로컬 전용) |
