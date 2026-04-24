# 일자리봇 운영 기획서

> 최초 작성: 2026-04-21 | 최근 수정: 2026-04-21

---

## 목표

50·60대 우나어 회원이 **나이 무관 채용공고**를 매일 새롭게 발견할 수 있도록,
50plus.or.kr의 공고를 자동 수집·AI 가공하여 일자리 게시판에 지속 공급한다.

---

## 배경

- 일자리는 우나어 핵심 욕망 카테고리 (우리 또래가 가장 관심 갖는 주제 중 하나)
- 50·60대가 직접 공고를 찾기 어려운 사이트 구조 → 봇이 대신 수집·가공
- 단순 공고 나열이 아닌 **AI 가공** (제목 정제, SEO 키워드, PickPoint, Q&A)으로 콘텐츠 품질 확보
- 광고 수익(AdSense + 쿠팡) 유입 동선의 일부

---

## 세부 기획

### 수집 파이프라인

```
50plus.or.kr 목록 크롤링 (Playwright)
  ↓ 최대 50건 수집
중복 체크 (sourceUrl 기준 DB 조회)
  ↓ 신규 건만
Waterfall 필터링 (tier 기준 엄선)
  ↓ 최종 4~5건
AI 가공 (Claude Haiku)
  - 제목 정제 (cleanTitle)
  - SEO 키워드 생성
  - PickPoint 3개 ("이런 분을 찾아요")
  - Q&A 2~3개
  ↓
DB INSERT (Post + JobDetail)
  ↓
Slack #리포트 알림
```

### 스케줄

| 시간 (KST) | UTC cron | 실행 주체 |
|---|---|---|
| 12:00 | `0 3 * * *` | GitHub Actions |
| 16:00 | `0 7 * * *` | GitHub Actions |
| 20:00 | `0 11 * * *` | GitHub Actions |

### 필터링 규칙 (Waterfall)

- `job-filter.ts` — tier(등급) 기반 우선순위 필터
- 1배치 목표: 4~5건 엄선 (BATCH_SIZE = 8 상한)
- 중복은 `sourceUrl` 기준 DB에서 제거

### 게시 규칙

- 게시판: `JOB` (boardType)
- 작성자: `일자리봇` 봇 유저 (`bot-job@unao.bot`)
- source: `BOT`
- SEO: `seoTitle`, `seoDescription` 자동 생성
- JSON-LD: JobPosting 구조화 데이터 자동 삽입 (SEO)

### 광고 배치 (수익)

- 목록 4번째 카드 이후: FeedAd (AdSense)
- 목록 8번째 카드 이후: CoupangBanner
- 상세 본문 하단: AdSenseUnit (in-article)

---

## 관련 링크

| 항목 | 경로/URL |
|------|---------|
| 에이전트 코드 | `agents/coo/job-scraper.ts` |
| 필터 로직 | `agents/coo/job-filter.ts` |
| AI 가공 로직 | `agents/coo/job-processor.ts` |
| 타입 정의 | `agents/coo/job-types.ts` |
| GA 워크플로우 | `.github/workflows/agents-jobs.yml` |
| runner.ts 핸들러 | `coo:job-scraper` |
| 수집 소스 사이트 | https://50plus.or.kr/externalList.do |
| 일자리 목록 페이지 | https://age-doesnt-matter.com/jobs |
| UI 스펙 문서 | `docs/specs/02-jobs.md` |

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-21 | 이 기획서 최초 작성 | 운영 문서 관리 체계 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 | 관련 커밋 |
|------|------|------|------|---------|
| (없음) | — | — | — | — |

---

## 트러블슈팅 체크리스트

이슈 발생 시 순서대로 확인:

1. **GA 실행 이력 확인**
   ```bash
   gh run list --workflow=agents-jobs.yml --limit=10
   gh run view <run-id> --json jobs
   ```

2. **BotLog 조회**
   ```sql
   SELECT action, status, "publishedCount", details, "createdAt"
   FROM "BotLog"
   WHERE "botType" = 'JOB'
   ORDER BY "createdAt" DESC
   LIMIT 10;
   ```

3. **50plus.or.kr 접근 가능 여부 확인**
   - 사이트 직접 접속 → 목록 로드 여부
   - Playwright 헤드리스 차단 여부

4. **DB 게시글 최근 등록 확인**
   ```sql
   SELECT title, "createdAt" FROM "Post"
   WHERE "boardType" = 'JOB' AND source = 'BOT'
   ORDER BY "createdAt" DESC
   LIMIT 5;
   ```
