# Feature Registry — 우나어 (age-doesnt-matter.com)

> 모든 기능의 단일 진실의 원천.
> **Claude가 /done 실행 시 자동 업데이트한다. 수동으로 편집하지 마라.**

마지막 갱신: 2026-05-14 (게시글 하단 연속읽기 + BEST 댓글 시스템)

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
| `src/components/features/home*`, `src/app/(main)/page.tsx` | F03 |
| `src/app/(main)/community*`, `src/components/features/community*` | F04 |
| `src/components/features/community/PostCTA*` | F13 |
| `src/lib/experiments*`, `src/app/admin/(panel)/ab-tests*`, `src/lib/queries/admin/admin.experiments-web*` | F16 |
| `src/components/ad/ListBanner*`, `src/app/api/ad-impression*` | F14 |
| `src/app/(main)/magazine*`, `src/components/features/magazine*`, `agents/cafe/magazine*`, `agents/magazine*` | F05 |
| `src/app/(main)/jobs*`, `src/components/features/jobs*`, `agents/coo/job*` | F06 |
| `src/app/(main)/best*` | F07 |
| `src/app/(main)/search*` | F08 |
| `src/app/(admin)*` | F09 |
| `agents/cafe/crawler*`, `agents/cafe/psych*`, `agents/cafe/trend*`, `agents/cafe/daily-brief*`, `agents/cafe/content-curator*`, `agents/cafe/run-pipeline*` | A01 |
| `agents/cafe/wave-processor*`, `src/app/api/internal/comment-wave*` | A29 |
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
| `scripts/ops-board*`, `.claude/commands/board*` | M05 |
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
| F01 | 회원가입 유도 배너 | `src/components/common/SignupPromptBanner.tsx` | 정독 85% + 60초 백스톱 (문구 C·타이밍 read_complete 고정, 실험 종료) | RELATION | ALL | [F01](F01-signup-prompt.md) | ACTIVE | 2026-06-09 |
| F02 | PWA 설치 유도 | `src/components/common/AddToHomeScreen.tsx` + `src/lib/app-links.ts` | 4단계 트리거 (13s/3페이지/행동/주간) — 안드=Play/iOS=PWA | RELATION+HEALTH | P1·P2 | [F02](F02-pwa-install.md) | ACTIVE | 2026-06-05 |
| F03 | 홈 페이지 | `src/components/features/home/` (21개 컴포넌트) | 홈 방문 | RELATION | P1·P2·P3 | [F03](F03-home-page.md) | ACTIVE | 2026-06-03 |
| F04 | 커뮤니티 게시판 | `src/app/(main)/community/` | 사용자 작성 | RELATION+HEALTH | P1·P2·P5 | [F04](F04-community.md) | ACTIVE | 2026-06-03 |
| F05 | 매거진 | `src/app/(main)/magazine/` | 자동생성(A02) + 사용자 탐색 | HEALTH+MONEY+RETIRE | P2·P4 | [F05](F05-magazine.md) | ACTIVE | 2026-05-14 |
| F06 | 일자리 게시판 | `src/app/(main)/jobs/` | 자동수집(A03) + 사용자 탐색 | MONEY | P4 | [A03](A03-job-scraper.md) | ACTIVE | 2026-06-05 |
| F07 | 베스트 탭 | `src/app/(main)/best/` | hotPromotedAt 기반 누적 | RELATION | P3 | [F07](F07-best-tab.md) | ACTIVE | 2026-05-14 |
| F08 | 검색 | `src/app/(main)/search/` | 사용자 검색 | ALL | ALL | `docs/specs/04-search.md` | ACTIVE | 2026-06-03 |
| F09 | 어드민 패널 | `src/app/(admin)/` + `src/app/admin/(panel)/` + `src/components/admin/ContentTable.tsx` + `src/lib/queries/admin/admin.content.ts` | 운영자 접근 | INFRA | — | [F09](F09-admin-panel.md) | ACTIVE | 2026-05-29 |
| F10 | 최상단 띠 배너 | `src/components/layouts/TopPromoBanner.tsx` + `TopPromoBannerClient.tsx` + `src/components/admin/TopPromoBannerPanel.tsx` | DB Setting 테이블 (어드민 관리) | RELATION | ALL | [F10](F10-top-promo-banner.md) | ACTIVE | 2026-06-05 |
| F11 | 비회원 댓글+좋아요 | `src/lib/actions/guest-comments.ts` + `src/lib/actions/guest-likes.ts` + `src/lib/turnstile.ts` + `src/components/features/community/GuestCommentInput.tsx` + `GuestPasswordModal.tsx` | 비로그인 사용자 직접 참여 | RELATION | P1/P2/P3 | [F11](F11-guest-comment-like.md) | ACTIVE | 2026-05-23 |
| F12 | HOT/명예의 전당 승격 시스템 | `src/lib/actions/promotion.ts` + `src/lib/actions/likes.ts` + `src/lib/actions/guest-likes.ts` + `src/lib/actions/comments.ts` + `src/lib/queries/boards.ts` + `src/lib/actions/admin/admin.content.ts` + `src/components/admin/ContentTable.tsx` | 좋아요+댓글 수 기반 자동 승격 (HOT/HALL_OF_FAME) | RELATION | P3 | [F12](F12-promotion-system.md) | ACTIVE | 2026-05-12 |
| F13 | 게시글 하단 CTA | `src/components/features/community/PostCTA.tsx` | 게시글/매거진 상세 열람 후 자동 표시 — 비회원→가입 / 모바일웹 로그인→앱설치 | RELATION | ALL | [F13](F13-post-cta.md) | ACTIVE | 2026-06-03 |
| F14 | 목록 광고 띠배너 | `src/components/ad/ListBanner.tsx` + `ListBannerClient.tsx` + `src/app/api/ad-impression/route.ts` + AdBanner `LIST_HEADER` 슬롯 + `src/components/admin/AdBannerTable.tsx` | 6개 목록 페이지 GNB 아래 노출 (어드민 AdBanner 관리, 최대 3개 자동 슬라이드) | MONEY | ALL | [F14](F14-list-ad-banner.md) | ACTIVE | 2026-06-05 |
| F15 | 팝업 (공지·이벤트·홍보) | `src/components/common/PopupRenderer.tsx` + `src/components/admin/PopupManager.tsx` + `src/lib/actions/popups.ts` + `src/lib/queries/popups.ts` + `src/app/api/popups/route.ts` + Popup 모델 | 대상 페이지 진입 시 노출 (어드민 Popup 관리 · 센터/바텀/전면 3종 · 기간·빈도 제어) | RELATION | ALL | [F15](F15-popup.md) | ACTIVE | 2026-06-06 |
| F16 | 웹 A/B 테스트 인프라 | `src/lib/experiments/` + `src/app/admin/(panel)/ab-tests/` + `src/lib/queries/admin/admin.experiments-web.ts` + ExperimentState 모델 | 실험 레지스트리(코드 SSOT) + 어드민 현황·편집. f01 문구·타이밍 종료(UT 위너 고정)→twa01 게이트만 운영, 인프라 유지 | INFRA | — | [F16](F16-ab-test-infra.md) | ACTIVE | 2026-06-09 |

---

## Automation Features (에이전트)

| ID | 기능명 | 코드 위치 | 스케줄/트리거 | 실행환경 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|-------------|---------|---------|------------|------|------|---------|
| A01 | 카페 크롤러 파이프라인 | `agents/cafe/crawler.ts` + `psych-analyzer.ts` + `trend-analyzer.ts` + `daily-brief.ts` + `content-curator.ts` + `run-pipeline.ts` | launchd 07:40·09:30·11:30·14:30·17:30·21:30·00:30 KST + GHA 45분 간격 20슬롯 | LOCAL_ONLY | INFRA | — | [A01](A01-cafe-crawler.md) | ACTIVE | 2026-06-09 |
| A02 | 매거진 자동생성 | `agents/cafe/magazine-generator.ts` + `local-magazine-runner.ts` | launchd 11:00, 14:00 KST | LOCAL_ONLY | HEALTH+MONEY+RETIRE | P2·P4 | [F05](F05-magazine.md) | ACTIVE | 2026-05-13 |
| A03 | 일자리봇 | `agents/coo/job-scraper.ts` | GHA 12:00·16:00·20:00 KST | GHA | MONEY | P4 | [A03](A03-job-scraper.md) | ACTIVE | 2026-04-27 |
| A04 | 외부 콘텐츠 스크래퍼 | `agents/community/sheet-scraper.ts` + `agents/community/fmkorea-scraper.ts` | agents-scraper.yml 07:30·09:00·12:00·15:00·21:00 KST (오유·네이트판) / launchd 11:30·21:30 KST (펨코) | GHA+LOCAL | RELATION | P1·P3 | [A04](A04-external-content.md) | ACTIVE | 2026-06-07 |
| A05 | 시드봇 35명 | `agents/seed/` | GHA 하루 16회 (08~23시) — 댓글/좋아요/대댓글만 (글쓰기 제거) | GHA | RELATION+HEALTH | ALL | [A05](A05-seed-bot.md) | ACTIVE | 2026-06-03 |
| A06 | SNS 자동 포스팅 | `agents/cmo/social-poster.ts` + `social-poster-visual.ts` | GHA 07:00·12:00·15:00 KST | GHA | RELATION | — | [A06](A06-sns-posting.md) | ACTIVE | 2026-04-27 |
| A07 | 카드뉴스 생성 | `agents/cmo/card-news-generator.ts` | GHA 13:00 KST | GHA | RELATION | — | [A07](A07-card-news.md) | ARCHIVED | 2026-05-15 |
| A08 | 지식인 답변 | `agents/cmo/knowledge-responder.ts` | launchd 14:30 KST (화/목/토) | LOCAL_ONLY | HEALTH+MONEY | P2·P4 | - | ARCHIVED | 2026-05-15 |
| A09 | SEO 최적화 | `agents/cmo/seo-optimizer.ts` | GHA 월 08:00 KST (매주 일요일 23:00 UTC) | GHA | INFRA | — | [A09](A09-seo-optimizer.md) | ACTIVE | 2026-05-12 |
| A10 | 채널 시딩 | `agents/cmo/channel-seeder.ts` | GHA 11:30 KST | GHA | RELATION | — | [A10](A10-channel-seeder.md) | ACTIVE | 2026-04-27 |
| A11 | CEO SNS 브리핑 | `agents/ceo/morning-sns-briefing.ts` | GHA 10:00 KST | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A12 | CEO 승인 리마인더 | `agents/cron/approval-reminder.ts` | GHA 09:00 KST | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A13 | CTO 아키텍처 리뷰 | `agents/cto/arch-review.ts` | GHA 월 09:30 KST | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A14 | CTO 가비지 컬렉션 | `agents/cto/garbage-collect.ts` | GHA 월 09:30 KST (arch-review 직후) | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A15 | CTO QA 검증 | `agents/cto/qa-verifier.ts` | GHA 주간 | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A16 | COO 커넥션 퍼실리테이터 | `agents/coo/connection-facilitator.ts` | GHA 일간 | GHA | RELATION | ALL | — | ACTIVE | 2026-05-12 |
| A17 | COO 일자리 매처 | `agents/coo/job-matcher.ts` | GHA 일간 | GHA | MONEY | P4 | — | ACTIVE | 2026-05-12 |
| A18 | COO 댓글 활성화 | `agents/coo/comment-activator.ts` | GHA 일간 | GHA | RELATION | ALL | — | ACTIVE | 2026-05-23 |
| A19 | COO 답글 체인 드라이버 | `agents/coo/reply-chain-driver.ts` | GHA 일간 | GHA | RELATION | ALL | — | ACTIVE | 2026-05-12 |
| A20 | CPO 페르소나 다양성 체커 | `agents/cpo/persona-diversity-checker.ts` | GHA 주간 | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A21 | CDO 참여 최적화 | `agents/cdo/engagement-optimizer.ts` | GHA 일간 | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A22 | Strategist 사용자 딥 분석 | `agents/strategist/user-deep-analysis.ts` | GHA 목 09:00 KST | GHA | INFRA | — | — | ACTIVE | 2026-05-12 |
| A23 | Seed 킬러 포스트 | `agents/seed/scheduler.ts` (killer-post) | GHA 09:10·22:10 KST | GHA | RELATION | ALL | — | ARCHIVED | 2026-06-03 |
| A24 | Seed 바이럴 웨이브 | `agents/seed/scheduler.ts` (viral-waves) | GHA 5분마다 (agents-sheet-viral.yml) | GHA | RELATION | ALL | — | ACTIVE | 2026-06-01 |
| A25 | 논란 체인 | `agents/seed/controversy-chain.ts` | GHA 하루 16회 (seed 동일) | GHA | RELATION | ALL | — | ACTIVE | 2026-05-12 |
| A26 | Design 광고 루프 | `agents/marketing-loop/creative-optimizer.ts` | DISPATCH ONLY | DISPATCH | INFRA | — | — | ACTIVE | 2026-05-12 |
| A27 | QA 코드 게이트 | `agents/qa/pre-deploy-gate.ts` | DISPATCH ONLY | DISPATCH | INFRA | — | — | ACTIVE | 2026-05-12 |
| A28 | 네이버 블로그 수동 발행 큐 | ~~`agents/naver-blog/*`, `src/app/admin/(panel)/naver-blog/*`, `src/app/api/admin/naver-queue/*`~~ 전부 삭제 | — | LOCAL_ONLY | GROWTH | — | Gemini 구독 종료로 폐기(2026-06-04), 어드민 페이지·API 삭제(2026-06-07). NaverBlogQueue 테이블/R2 이미지만 보존 | ARCHIVED | 2026-06-07 |
| A29 | 댓글 파동 프로세서 | `agents/cafe/wave-processor.ts` + `src/app/api/internal/comment-wave/route.ts` | GHA `*/5 * * * *` (wave1~4 순차) / content-curator 발행 즉시 API 호출 | GHA+API | RELATION | ALL | [A29](A29-comment-wave.md) | ACTIVE | 2026-05-30 |
| A30 | 카페 인기글 sync+큐레이션 | `agents/cafe/popular-sync.ts` + `agents/cafe/popular-curator.ts` + `agents/cafe/curator-shared.ts` | launchd 10:30/16:00/21:15 KST (sync) + GHA 10:50/16:15/21:30 KST (curate) | LOCAL+GHA | HEALTH+RELATION | ALL | [A30](A30-popular-sync.md) | ACTIVE | 2026-06-07 |

---

## Monitoring Features

| ID | 기능명 | 코드 위치 | 스케줄 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|--------|---------|------------|------|------|---------|
| M01 | CTO 헬스체크 + 에러모니터 | `agents/cto/health-check.ts` + `error-monitor.ts` + `crawler-health.ts` | GHA 4시간마다 | INFRA | — | [M01](M01-cto-monitoring.md) | ACTIVE | 2026-04-27 |
| M02 | QA 콘텐츠 감사 | `agents/qa/content-audit.ts` | GHA 매일 08:20 KST | INFRA | — | [M02](M02-qa-content-audit.md) | ACTIVE | 2026-04-27 |
| M03 | 브리프 모니터 | `agents/cafe/brief-monitor.ts` | GHA 09:30 KST | INFRA | — | [M03](M03-brief-monitor.md) | ACTIVE | 2026-04-27 |
| M04 | Threads 토큰 갱신 알림 | `agents/cmo/threads-token-check.ts` | GHA 수 10:00 KST | INFRA | — | [M04](M04-threads-token.md) | ACTIVE | 2026-04-27 |
| M05 | 거울 보드 (운영 현황 실측 대시보드) | `scripts/ops-board/` + `.claude/commands/board.md` | 로컬 수동 (`npm run board` / `/board`) | INFRA | — | [M05](M05-ops-board.md) | ACTIVE | 2026-06-04 |

---

## Infrastructure Features

| ID | 기능명 | 코드/설정 위치 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|--------------|---------|------------|------|------|---------|
| I01 | launchd 로컬 스케줄러 | `~/Library/LaunchAgents/com.unaeo.*.plist` | INFRA | — | [I01](I01-launchd-scheduler.md) | ACTIVE | 2026-05-13 |
| I02 | Upstash Redis 레이트리밋 | `src/lib/rate-limit.ts` | INFRA | — | [I02](I02-redis-ratelimit.md) | ACTIVE | 2026-04-27 |
| I03 | Cloudflare R2 이미지 저장소 | `src/lib/r2.ts` + `agents/core/r2.ts` | INFRA | — | [I03](I03-r2-storage.md) | ACTIVE | 2026-04-27 |
| I04 | Google Indexing API | 발행 시 자동 호출 | INFRA | — | [I04](I04-google-indexing.md) | ACTIVE | 2026-04-27 |
| I05 | 아동 안전 표준 페이지 | `src/app/child-safety/page.tsx` | INFRA | — | — | ACTIVE | 2026-05-23 |
| I06 | 커뮤니티 slug 백필 스크립트 | `agents/scripts/backfill-community-slug.ts` | INFRA | — | [I06](I06-community-slug-backfill.md) | ACTIVE | 2026-05-23 |

---

## Revenue Features

| ID | 기능명 | 코드 위치 | 배치 위치 | 충족욕망 | 타겟페르소나 | 문서 | 상태 | 최근변경 |
|----|--------|----------|---------|---------|------------|------|------|---------|
| R01 | AdSense 광고 | `src/components/ad/AdSenseUnit.tsx` | 홈·매거진·커뮤니티·일자리·검색·베스트 | INFRA | — | [R01](R01-adsense.md) | ACTIVE | 2026-05-17 |
| R02 | 쿠팡 파트너스 CPS | `src/components/ad/CoupangBanner.tsx` + `agents/cafe/cps-matcher.ts` | 매거진 상세·목록·전 페이지 배너 | MONEY | P2·P4 | [R02](R02-coupang-cps.md) | ACTIVE | 2026-05-14 |

---

## ARCHIVED Features

| ID | 기능명 | 제거일 | 제거 사유 |
|----|--------|--------|---------|
| A99 | GHA 매거진 크론 | 2026-04-10 | launchd 로컬 이관 (Playwright 이미지 생성 로컬 전용) |
| A07 | 카드뉴스 생성 | 2026-05-15 | 창업자 지시: 카드뉴스 중단. 코드(card-news/ 폴더) 삭제, GHA cron 제거 |
| A08 | 지식인 답변 | 2026-05-15 | 창업자 지시: 지식인 완전 중단. knowledge-responder.ts + jisik-answerer.ts 삭제, GHA cron 제거 |
| A23 | Seed 킬러 포스트 | 2026-06-03 | 창업자 지시: 시드봇 글쓰기 전면 중단. runKillerPostCycle no-op 처리, generateKillerPost retired guard 적용. 킬러 댓글 웨이브(A24)는 유지. |
