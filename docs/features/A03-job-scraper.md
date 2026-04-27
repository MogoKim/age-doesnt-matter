# 일자리봇 운영 기획서 (A03)

> 최초 작성: 2026-04-21 | 최근 수정: 2026-04-27 (Feature Lifecycle 마이그레이션)

---

## 목표

50·60대 우나어 회원이 **나이 무관 채용공고**를 매일 새롭게 발견할 수 있도록  
50plus.or.kr 공고를 자동 수집·AI 가공하여 일자리 게시판에 지속 공급한다.

---

## 배경

- 일자리는 우나어 핵심 욕망 카테고리 (우리 또래가 가장 관심 갖는 주제)
- 50·60대가 직접 공고를 찾기 어려운 사이트 구조 → 봇이 대신 수집·가공
- 단순 나열이 아닌 AI 가공(제목 정제, SEO, PickPoint, Q&A)으로 콘텐츠 품질 확보
- AdSense + 쿠팡 광고 수익 유입 동선

---

## 세부 기획

### 수집 파이프라인

```
50plus.or.kr 목록 크롤링 (Playwright headless)
  ↓ 최대 50건 수집
중복 체크 (sourceUrl 기준 DB 조회)
  ↓ 신규 건만
Waterfall 필터링 (tier 기반 — job-filter.ts)
  ↓ 최종 4~5건 (BATCH_SIZE = 8 상한)
AI 가공 (Claude Sonnet-4-6 × 4회/배치)
  - cleanTitle: 제목 정제
  - SEO 키워드 생성
  - PickPoint 3개 ("이런 분을 찾아요")
  - Q&A 2~3개
  ↓
DB INSERT (Post + JobDetail 관계형)
  ↓
Slack #리포트 알림 + BotLog 기록
```

> ⚠️ **AI 모델 주의**: 구 문서에 "Claude Haiku"로 기재됐으나 실제 코드는 `CLAUDE_MODEL_HEAVY = claude-sonnet-4-6` 사용 (job-processor.ts line 17)

---

### 스케줄 / 실행 환경

| KST | UTC cron | 핸들러 | 워크플로우 |
|-----|---------|--------|---------|
| 12:00 | `0 3 * * *` | `coo:job-scraper` | `agents-jobs.yml` |
| 16:00 | `0 7 * * *` | `coo:job-scraper` | `agents-jobs.yml` |
| 20:00 | `0 11 * * *` | `coo:job-scraper` | `agents-jobs.yml` |

**실행 환경**: GHA ubuntu-latest, Node 20

---

### 필터링 규칙 (Waterfall)

- tier 기반 우선순위 필터 (`job-filter.ts`)
- 목표: 1배치 4~5건 엄선
- 중복 제거: `sourceUrl` 기준 DB 조회

---

### 게시 규칙

| 항목 | 값 |
|------|-----|
| boardType | `JOB` |
| source | `BOT` |
| 작성자 | `일자리봇` (`bot-job@unao.bot`) |
| SEO | `seoTitle`, `seoDescription` 자동 생성 |
| JSON-LD | JobPosting 구조화 데이터 자동 삽입 |

---

### Slack 알림

| 조건 | 레벨 | 채널 |
|------|------|------|
| publishedCount > 0 | info | #리포트 |
| publishedCount = 0 | important | #리포트 |

---

### BotLog

- `botType: 'JOB'`
- `action: 'JOB_SCRAPE'`
- `status: 'SUCCESS' | 'PARTIAL'`
- `details: { collectedCount, filteredCount, publishedCount }`

---

### 광고 배치

- 목록 4번째 카드 후: FeedAd (AdSense)
- 목록 8번째 카드 후: CoupangBanner
- 상세 본문 하단: AdSenseUnit (in-article)

---

### 환경변수

| 변수 | 필수 |
|------|------|
| `DATABASE_URL` | 필수 |
| `DIRECT_URL` | 필수 |
| `ANTHROPIC_API_KEY` | 필수 |
| `CLAUDE_MODEL_HEAVY` | `claude-sonnet-4-6` |
| `CLAUDE_MODEL_LIGHT` | `claude-haiku-4-5` |
| `SLACK_BOT_TOKEN` | 필수 |
| `SLACK_CHANNEL_REPORT` | 필수 |
| 기타 Slack 채널 변수 5개 | 필수 |

---

### 비용 영향

| 항목 | 단가 | 빈도 | 월간 |
|------|------|------|------|
| Claude Sonnet-4-6 (AI 가공) | $3/1M input, $15/1M output | 4회/배치 × 3회/일 | **~$5~10/월** |
| Playwright 크롤링 | $0 | 3회/일 | $0 |
| **합계** | — | — | **~$5~10/월** |

> 구 문서에 "Claude Haiku"로 잘못 기재됨. 실제는 Sonnet 사용으로 비용 더 높음.

---

### 실패 처리

- 개별 공고 처리 실패: try-catch 에러 로깅 후 다음 건 계속
- 전체 배치 실패: BotLog `PARTIAL` + Slack important 알림
- **재시도 없음** (GHA 다음 스케줄 실행까지 대기)

---

## 관련 링크

- 에이전트: `agents/coo/job-scraper.ts`
- 필터 로직: `agents/coo/job-filter.ts`
- AI 가공: `agents/coo/job-processor.ts`
- 타입 정의: `agents/coo/job-types.ts`
- GHA 워크플로우: `.github/workflows/agents-jobs.yml`
- Runner 핸들러: `agents/cron/runner.ts` — `coo:job-scraper`
- 수집 소스: `https://50plus.or.kr/externalList.do`
- UI 스펙: `docs/specs/02-jobs.md`

---

## 트러블슈팅

```bash
# GHA 실행 이력 확인
gh run list --workflow=agents-jobs.yml --limit=10

# BotLog 조회
# SELECT action, status, details, "createdAt" FROM "BotLog"
# WHERE "botType" = 'JOB' ORDER BY "createdAt" DESC LIMIT 10;

# DB 최근 게시글 확인
# SELECT title, "createdAt" FROM "Post"
# WHERE "boardType" = 'JOB' AND source = 'BOT'
# ORDER BY "createdAt" DESC LIMIT 5;
```

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-21 | 운영 기획서 최초 작성 | 운영 문서 관리 체계 도입 |
| 2026-04-27 | Feature Lifecycle 포맷 마이그레이션 — AI 모델 Haiku→Sonnet 수정, BotLog/비용/환경변수/Slack 상세 추가 | Feature Lifecycle 거버넌스 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | - | - | - |
