# V6 네이버 딥크롤링 종합 기획서
> 상태: 최종안 v2 — 승인 시 `docs/plan-v6-master.md` 생성 + P0 개발 시작
> 기준일: 2026-05-13 | V4/V5/코드 3-way 검수 완료 | G25·R13~R15 추가 반영 | loadTodayBrief() 버그 명시

---

## 0. 본래 목적과 배경

### 서비스 Why
**우나어는 50·60대 여성의 외로움(RELATION)·건강 염려(HEALTH)·재정 불안(MONEY)·인생 2막(RETIRE)을 중심으로 설계된 AI 운영 커뮤니티다.**

- MAU 21명(현재) → 500명(Q2 목표)
- 초기 활성화: 시드봇 78명 페르소나가 "실제 사람처럼" 글/댓글 작성
- 장기 전략: UGC 70% 달성 시 봇 완전 철수

### 네이버 크롤링 Why
크롤링은 단순 콘텐츠 수집이 아니라 **욕망 인텔리전스 시스템의 핵심**이다.

```
네이버 카페 2곳 (우아한갱년기 + 은퇴후50년)
  ↓ 크롤링 (하루 4회)
CafePost DB (글·댓글·감정·욕망 태깅)
  ↓ psych-analyzer
욕망지도 (13개 카테고리 분포)
  ↓ trend-analyzer → DailyBrief
오늘의 핫토픽 + 페르소나별 활동 배율(0.5×~2.0×)
  ↓
시드봇 78명: 오늘 어떤 주제로 글 쓸지 결정
큐레이션: 핫토픽 기반 원본 재가공 → 우나어 발행
```

- **우아한갱년기** (wgang): HEALTH/FAMILY/RELATION — P2 정희씨 핵심
- **은퇴후50년** (dlxogns01): RETIRE/MONEY/JOB — P1 영숙씨·P4 순자씨

### V4 제기한 4가지 문제 (개선 근거)
1. **발행량 부족**: 25~30건/일 → 목표 75건/일 (시드봇 54건 + 큐레이션 9건 + UGC 12건)
2. **AI 티 나는 콘텐츠**: 반반이 50% → 수미상관 90%로 원본 보존
3. **초기 인게이지먼트 없음**: 첫 댓글 10분 → 1분 이내 (알고리즘 활성 기준)
4. **아침 크롤 타이밍 미스**: 08:30 크롤 = 새벽글만 (인게이지먼트 0) → 11:30 Full로 해결

---

## 1. AS-IS 현황 (2026-05-13 코드 직접 검수)

### 크롤링
| 항목 | 현재값 | 파일:라인 |
|------|--------|---------|
| 크롤 방식 | board 루프 (wgang 20개 + dlxogns01 37개 = **57개**) | config.ts:52-177 |
| allArticlesUrl | **없음** | config.ts |
| articleId | URL 파싱 (crawler.ts:394) / **DB 저장 안 함** | schema.prisma |
| 중복체크 | postUrl unique key | crawler.ts:741-743 |
| 모드 | deep / quick / crawl / all / analyze / trend / curate | run-pipeline.ts:31 |
| DEEP-LITE 모드 | **없음** | run-pipeline.ts |
| 락 TTL | 30분 | run-pipeline.ts:35 |
| 재시도 | 최대 3회, 1분 간격 | run-pipeline.ts:119-214 |

### DB 스키마
| 항목 | 현황 |
|------|------|
| CafePost.articleId | ❌ 없음 |
| CafePost.usedAt | ❌ 없음 |
| CafePost.killerScore / viralType | ✅ 있음 |
| Comment.parentId | ✅ 있음 (대댓글 구조 지원) |
| CommentWaveQueue 테이블 | ❌ 없음 |

### 현재 자동화 스케줄
| KST | 실행처 | 작업 | 단계 |
|-----|--------|------|------|
| 08:30 | plist | deep | 크롤→psych→trend→brief→curate |
| 09:00 | GHA | DailyBrief Fallback | 어제 brief 복사 (Mac 꺼진 경우) |
| 09:30 | GHA | Brief Monitor | 생성 여부 감시 |
| 12:55 | plist | quick | 크롤(HIGH 1p)→퀵트렌드→midDayPatch |
| 13:30 | GHA | content-curate | 트렌드 없이 큐레이션 |
| 20:30 | GHA | trend+curate | 트렌드 분석 후 큐레이션 |
| 20:40 | plist | crawl | 크롤만 |

### 콘텐츠 생성
| 항목 | 현재값 | 파일:라인 |
|------|--------|---------|
| 글 방식 | 반반이 50/50 | content-curator.ts:302-306 |
| 1회 발행 | 3건 | content-curator.ts:398 |
| 지원 boardType | STORY, HUMOR (**LIFE2 없음**) | content-curator.ts:361 |
| 큐레이션 페르소나 | **20명** (A-T) | content-curator.ts:61-214 |
| DailyBrief 페르소나 | **50명** (A-AX + EN1-5) | daily-brief.ts:66-173 |
| usedAt 기록 | ❌ 없음 | content-curator.ts:345 |
| minSave | 30 | config.ts:223 |
| minUsable | **60** | config.ts:225 |
| qualityScore 선택 기준 | ≥ 50 | content-curator.ts:250-271 |

### 시드봇 현황
| 항목 | 현재값 |
|------|--------|
| 페르소나 수 | 78명 (활성 58-60명) |
| 하루 글쓰기 | 54건 |
| 하루 댓글+대댓글 | 158건 |
| 하루 좋아요 | 121건 |
| 발행 시간대 | 09:00~01:00 (14시간) |
| DailyBrief 사용 | 배율 0.5×~2.0× 동적 조정 |
| boardType 비율 | STORY 82.1% / HUMOR 9.0% / LIFE2 3.8% / 기타 5.1% |

---

## 2. V4/V5 주요 결정 사항 (확정값)

### V4 확정 수치 (개발 시 기준값)
| 항목 | V4 결정값 | 현재 코드 | V6 적용 |
|------|---------|---------|--------|
| minSave | 30 → **20** | 30 | **20** |
| minUsable | 60 → **40** | 60 | **30** (V5에서 재확정) |
| 화제성글(KILLER) 기준 | commentCount≥5, qualityScore≥50 | 없음 | P1 구현 |
| 게시판 비율 | STORY 50% / LIFE2 35% / HUMOR 15% | STORY/HUMOR만 | P2 이후 |
| 욕망 카테고리 | 13개 → **20개** 확장 | 13개 | P3 |
| 페르소나 수 | 79명 | 78명 (1명 부족) | P3 |
| Wave 타이밍 | 1분/5분/30분/60분 | 없음 | P1 |
| 원문 보존율 | 90% (수미상관) | 50% (반반이) | P2 |

### V5 확정 사항 (티키타카 Round 1-5)
| Round | 결정 | 세부 |
|-------|------|------|
| R1 | 파이프라인 4회 구조 | 08:30 CRAWL / 11:30 FULL / 15:30 CRAWL+CURATE / 21:30 CRAWL+CURATE |
| R2 | GHA 스마트 fallback | BotLog 체크 → 당일 curate ≥1건이면 skip |
| R2 | 전체글보기 전면 전환 | wgang + dlxogns01 동시 전환 |
| R2 | Dedup 방식 | articleId 기준 (MAX 이후만 크롤) |
| R3 | 댓글 파동 | P1 구현, wave 시간 V4 기준 (1/5/30/60분) |
| R3 | 글 방식 | 반반이 → 수미상관 90% |
| R4 | 큐레이션 볼륨 | **9건/일** (11:30 3건 + 15:30 3건 + 21:30 3건) |
| R4 | 페르소나 확장 | 20명 → 50명 |
| R4 | LIFE2 | P2 포함 |
| R5 | 개발 순서 | P0 DB → P1 파이프라인 → P2 콘텐츠 → P3 안정화 |

---

## 3. TO-BE 설계

### 파이프라인 4회 (최종)
| KST | 모드 | 단계 | AI 비용 | 큐레이션 |
|-----|------|------|---------|---------|
| **08:30** | CRAWL-ONLY | 전체글보기 크롤(본문+댓글)→DB | 0 | 0건 |
| **11:30** | FULL | 크롤→psych→trend→brief→curate | Haiku+Sonnet | 3건 |
| **15:30** | CRAWL+CURATE | 전체글보기 크롤→DB→curate(11:30 brief 재활용) | 0 | 3건 |
| **21:30** | CRAWL+CURATE | 전체글보기 크롤→DB→curate(11:30 brief 재활용) | 0 | 3건 |

**총 큐레이션 9건/일 | 시드봇 54건/일 | 총 발행 63건+ (UGC 포함 75건 목표)**

> **V4 vs V6**: V4는 4회 모두 큐레이션(12건) 목표였으나, 08:30에는 psych 분석 전이라 hotTopics 없음 → 큐레이션 품질 낙하. V6에서 08:30 크롤전용 + 9건/일로 조정.

### GHA 스케줄 변경
| KST | 현재 | 변경 후 |
|-----|------|---------|
| 09:00 | DailyBrief Fallback | **유지** |
| 09:30 | Brief Monitor | **유지** |
| 13:30 | content-curate | **스마트 fallback**: `BotLog WHERE botType='CAFE_CRAWLER' AND action='CONTENT_CURATE' AND DATE(executedAt)=TODAY` ≥1건 → skip |
| 20:30 | trend+curate | **스마트 fallback** (동일 쿼리) |
| 12:55 plist quick | 운영 중 | **삭제** |
| 20:40 plist crawl | 운영 중 | **21:30으로 변경 + curate 추가** |
| **15:30 plist 신규** | 없음 | CRAWL+CURATE 신설 |

### 전체글보기 전환
- URL 패턴: `https://cafe.naver.com/{cafeId}/menus/0?viewType=L`
- wgang + dlxogns01 동시 전환 (병렬 전환, 롤백 feature flag 준비)
- config.ts 57개 board 설정 → allArticlesUrl 2개 + maxArticlesPerCrawl: 200
- Dedup: `@@unique([cafeId, articleId])` + MAX(articleId) 기준 증분 크롤

> **주의**: 전체글보기 페이지네이션 방식 Playwright 실증 필요 (G22). 개발 전 dry-run 확인 필수.

### 콘텐츠 생성 개선
| 항목 | 현재 | V6 |
|------|------|-----|
| 글 방식 | 반반이 50% | 수미상관 90% |
| 게시판 비율 | STORY/HUMOR | STORY 50% / LIFE2 35% / HUMOR 15% (P2 이후) |
| 화제성글(KILLER) | 없음 | P1: commentCount≥5, qualityScore≥50 별도 발행 |
| 날짜 오염 | 없음 | P1: 발행일 기준 48h 이내 원문만 |
| 서브카테고리 배정 | 랜덤 | P1: DESIRE_TO_SUBCATEGORY 매핑 |
| usedAt 기록 | 없음 | P1 |
| 페르소나 | 20명 | P2: 50명 |
| LIFE2 | 없음 | P2 |

### 댓글 파동 (V4/V5 기준)
- Wave 타이밍: **1분 / 5분 / 30분 / 60분** (V4 확정, 기존 내 안 1/5/8/10분 → 수정)
- content-curator 발행 직후 `/api/internal/comment-wave` 호출 → wave1 즉시
- GHA `*/5 * * * *`: wave2~4 순차 처리
- 댓글 원문: topComments 90% 보존 (어미·말투만 변환, 고유명사·수치 100% 유지)
- 글쓴이 페르소나 제외

---

## 4. 갭 분석 (V5 G01~G23 기반 V6 재매핑)

| ID | 갭 | 우선순위 | 파일 | V5 매핑 |
|----|-----|---------|------|---------|
| G01 | articleId DB 없음 → dedup 불가 | **P0** | schema.prisma, crawler.ts | G02 |
| G02 | usedAt 없음 → 중복 참조 | **P0** | schema.prisma, content-curator.ts | G03 |
| G03 | CommentWaveQueue 없음 | **P0** | schema.prisma | G18 |
| G04 | allArticlesUrl 없음 (57개 board 루프) | **P0** | config.ts, crawler.ts | G01 |
| G05 | 전체글보기 페이지네이션 미확인 | **P0 선행** | crawler.ts | G22 |
| G06 | CRAWL+CURATE 모드 없음 | **P1** | run-pipeline.ts | G04 |
| G07 | GHA curate 스마트 fallback 없음 | **P1** | agents-cafe.yml, runner.ts | G05/G06 |
| G08 | plist 15:30 신규 없음 | **P1** | LaunchAgents/ | G17 |
| G09 | minSave 30→20 / minUsable 60→30 | **P1** | config.ts:223,225 | — |
| G10 | 화제성글(KILLER) 발행 경로 없음 | **P1** | content-curator.ts | G19 |
| G11 | 날짜 오염 필터 없음 | **P1** | content-curator.ts | G13 |
| G12 | 서브카테고리 랜덤 → DESIRE 매핑 | **P1** | content-curator.ts | G14 |
| G13 | 욕망 명칭 불일치 (HUMOR↔ENTERTAIN, 20개 확장) | **P1** | generator.ts, psych-analyzer.ts | G07 |
| G14 | 게시판 비율 없음 (STORY 50/LIFE2 35/HUMOR 15%) | **P2** | content-curator.ts | G21 |
| G15 | 반반이→수미상관(90%) 미전환 | **P2** | content-curator.ts:302-306 | G10 |
| G16 | 큐레이션 페르소나 20→50명 | **P2** | content-curator.ts | G07 |
| G17 | LIFE2 boardType 미구현 | **P2** | content-curator.ts:361 | G08 |
| G18 | 댓글 파동 주체 페르소나 제외 메커니즘 | **P2** | comment-wave API | G15 |
| G19 | 재크롤 갱신 없음 (7일 이내 like/comment) | **P3** | crawler.ts | G16 |
| G20 | 세션 만료 pre-check 없음 | **P3** | crawler.ts | — |
| G21 | 락 파일 충돌 방지 없음 | **P3** | run-pipeline.ts | — |
| G22 | 욕망 20개 확장 (BEAUTY/DIGITAL 등 7개) | **P3** | psych-analyzer.ts, generator.ts | G07 |
| G23 | 페르소나 79명 목표 (현재 78명, 1명 추가) | **P3** | persona-data.ts | G20 |
| G24 | 네이버 블로그 에이전트 → 큐레이션 연동 | **P4** | agents/naver-blog/ | G23 |
| **G25** | `loadTodayBrief()` 함수 없음 → CRAWL+CURATE에서 brief 재활용 불가 | **P1** | agents/cafe/daily-brief.ts | 신규 |

---

## 5. 리스크 헷징 (상세)

| ID | 리스크 | 발생 조건 | 영향 | 헷징 전략 | 담당 Phase |
|----|--------|---------|------|---------|----------|
| **R01** | Mac 꺼짐 → 큐레이션 0건 | plist 미실행 | 당일 발행 0건 | GHA 스마트 fallback 유지 (BotLog 체크) | P1 |
| **R02** | 전체글보기 403 차단 | 네이버 봇 탐지 | 크롤 전면 중단 | feature flag: legacyCrawler 즉시 롤백 | P0 |
| **R03** | articleId 백필 실패 | postUrl 형식 불규칙 | dedup 구멍 | 백필 전 URL 형식 분포 SELECT + 실패 건수 확인 후 적용 | P0 |
| **R04** | DailyBrief 4회 덮어쓰기 | 11:30 full이 새 brief 생성 | 시드봇 혼란 | 15:30/21:30은 brief 읽기만 (재생성 없음) 명시 | P1 |
| **R05** | Haiku 배치 실패 | psych-analyzer 전면 실패 | DailyBrief 품질 저하 | fallback_yesterday + Slack CRITICAL 알림 | P0 (기존 있음) |
| **R06** | GHA ↔ plist 이중 발행 | fallback skip 미동작 | 하루 6~9건 중복 발행 | P1 첫 작업: fallback 로직 구현 → plist 전환 | P1 |
| **R07** | isUsable 30 품질 저하 | 기준 완화로 저품질 증가 | 사용자 이탈 | 2주 샘플링: 좋아요0·댓글0 비율 10% 초과 시 35로 상향 | P1 (모니터링) |
| **R08** | 댓글 원문 저작권 | 네이버 카페 원문 90% | 법적 리스크 | 도입/마무리 반드시 페르소나 추가 + 출처 내부 DB만 | P2 |
| **R09** | CommentWaveQueue 고아 데이터 | 게시글 삭제 후 wave 대기 | 영구 pending 누적 | wave 전 게시글 존재 확인 + 60h TTL 초과 자동 정리 | P2 |
| **R10** | 전체글보기 페이지네이션 미확인 | URL 구조 다를 수 있음 | 크롤 0건 | **P0 개발 전 Playwright dry-run 필수** | P0 선행 |
| **R11** | 네이버 세션 만료 (4회 실행 중) | 쿠키 만료 | 크롤 중단 | pre-check → 만료 시 Slack CRITICAL + 수동 재인증 요청 | P3 |
| **R12** | LIFE2 인풋 부족 | 카페에서 LIFE2 주제 적을 때 | 35% 목표 미달 | LIFE2 부족 시 STORY로 자동 채움 fallback | P2 |
| **R13** | 비로그인 전체글보기 접근 불가 | 카페 로그인 필수 정책 변경 시 | 크롤 0건 | P0-0 Playwright dry-run 시 **비로그인 상태**로도 접근 실증 → 실패 시 쿠키 세션 유지 방식으로 전환 | P0 선행 |
| **R14** | 11:30 FULL 실패 → 15:30/21:30 brief 없음 | psych/trend 분석 실패 or plist 미실행 | curate 원본 없음 | `loadTodayBrief()` 실패 시 어제 brief fallback (fallbackToYesterday 기존 함수 활용) → 없으면 CafeTrend DB 직접 조회로 hotTopics 구성 | P1 |
| **R15** | GHA `*/5 * * * *` 비용 과금 | repo가 private이면 Actions 분 차감 | 월 비용 증가 | **GitHub repo PUBLIC 확인됨** → GHA 무료 tier (Public repo: 무제한). wave2~4 cron 안심하고 추가 가능 | 확인완료 |

---

## 6. DB 마이그레이션 스펙 (P0)

```prisma
// prisma/schema.prisma — CafePost 추가
model CafePost {
  // 기존 필드 유지...
  articleId  Int?      // 네이버 게시글 순차 번호
  usedAt     DateTime? // 큐레이션 참조 시각 (NULL = 미사용)

  @@unique([cafeId, articleId]) // 전체글보기 dedup
  @@index([usedAt])             // usedAt IS NULL 필터링
}

// 신규 테이블
model CommentWaveQueue {
  id              String    @id @default(cuid())
  postId          String    // 우나어 게시글 ID
  cafePostId      String    // 참조한 원본 카페 글 ID
  authorPersonaId String    // 발행 페르소나 (wave에서 제외)
  wave1At         DateTime  // 발행 + 1분
  wave2At         DateTime  // 발행 + 5분
  wave3At         DateTime  // 발행 + 30분
  wave4At         DateTime  // 발행 + 60분
  wave1Done       Boolean   @default(false)
  wave2Done       Boolean   @default(false)
  wave3Done       Boolean   @default(false)
  wave4Done       Boolean   @default(false)
  createdAt       DateTime  @default(now())
  expiresAt       DateTime  // createdAt + 60h (TTL)
  @@index([wave1Done, wave1At])
  @@index([expiresAt])
}
```

**백필 (P0 — 적용 전 분포 확인 필수):**
```sql
-- 1단계: URL 형식 분포 확인
SELECT
  CASE
    WHEN "postUrl" ~ '/articles/\d+' THEN 'articles형식'
    WHEN "postUrl" ~ '/\d+$' THEN '숫자형식'
    ELSE '기타'
  END as 형식,
  COUNT(*)
FROM "CafePost"
GROUP BY 1;

-- 2단계: 백필 (articles형식만)
UPDATE "CafePost"
SET "articleId" = CAST(regexp_replace("postUrl", '.*/articles/(\d+).*', '\1') AS INT)
WHERE "postUrl" ~ '/articles/\d+'
  AND "articleId" IS NULL;
```

---

## 7. 개발 로드맵

### P0 — 기초 인프라 (3일)
> **전제**: G05 전체글보기 Playwright dry-run 먼저. URL/페이지네이션 확인 후 시작.

| # | 작업 | 파일 |
|---|------|------|
| 0-0 | **Playwright dry-run**: allArticlesUrl 접근·페이지네이션 확인 | crawler.ts (테스트) |
| 0-1 | DB migration: articleId + usedAt + CommentWaveQueue | schema.prisma |
| 0-2 | 백필 SQL 실행 (분포 확인 후) | SQL |
| 0-3 | crawler.ts: 전체글보기 크롤 구현 + articleId 저장 | crawler.ts |
| 0-4 | config.ts: allArticlesUrl 2개 + 57개 board 제거 + minSave 20 | config.ts |
| 0-5 | runner.ts: curate case BotLog 스마트 fallback | agents/cron/runner.ts |

**창업자 액션 (P0 배포 후):**
- `npx prisma migrate deploy` 실행
- 크롤 테스트 로그 확인 (Slack #시스템)

### P1 — 파이프라인 전환 (4일)
> P0 배포 + 1일 데이터 확인 후 시작

| # | 작업 | 파일 |
|---|------|------|
| 1-1 | run-pipeline.ts: `crawl-curate` 모드 신설 | run-pipeline.ts |
| 1-2 | **daily-brief.ts: `loadTodayBrief()` 신규 구현** (현재 생성만 있고 읽기 함수 없음 — G25) | agents/cafe/daily-brief.ts |
| 1-2b | content-curator.ts: usedAt 기록 + `loadTodayBrief()` 호출 (R14 fallback: 어제brief→CafeTrend 직접조회) | content-curator.ts |
| 1-3 | content-curator.ts: KILLER 글 발행 경로 추가 | content-curator.ts |
| 1-4 | content-curator.ts: 날짜 오염 필터 (48h 이내 원문만) | content-curator.ts |
| 1-5 | content-curator.ts: DESIRE_TO_SUBCATEGORY 매핑 | content-curator.ts |
| 1-6 | config.ts: minUsable 60→30 | config.ts |
| 1-7 | plist 재편: morning(crawl-only) + lunch→11:30(full) + evening→21:30(crawl-curate) | LaunchAgents/ |
| 1-8 | plist 신설: 15:30 crawl-curate | LaunchAgents/ |
| 1-9 | API 신설: `/api/internal/comment-wave` | src/app/api/internal/ |
| 1-10 | GHA: wave2~4 cron (`*/5 * * * *`) + fallback skip 로직 | agents-cafe.yml |

**창업자 액션 (P1 배포 후):**
- plist 4개 `launchctl unload && launchctl load`
- 11:30 첫 실행 후 Slack #대시보드 "욕망 지도" 메시지 확인

### P2 — 콘텐츠 품질 (3일)
> P1 안정화 1주 후 시작

| # | 작업 | 파일 |
|---|------|------|
| 2-1 | content-curator.ts: 수미상관(90%) 프롬프트 교체 | content-curator.ts:302-306 |
| 2-2 | content-curator.ts: 페르소나 20명→50명 확장 | content-curator.ts:61-214 |
| 2-3 | content-curator.ts: LIFE2 boardType 추가 + 비율 로직 | content-curator.ts:361 |
| 2-4 | comment-wave API: 글쓴이 제외 로직 + 댓글 원문 90% | src/app/api/internal/ |
| 2-5 | generator.ts: HUMOR→ENTERTAIN 통일 | agents/seed/generator.ts |

### P3 — 안정화 + 욕망 확장 (3일)
> P2 완료 후

| # | 작업 | 파일 |
|---|------|------|
| 3-1 | psych-analyzer.ts: 욕망 20개 확장 (BEAUTY/DIGITAL 등 7개) | psych-analyzer.ts:78-91 |
| 3-2 | crawler.ts: 세션 만료 pre-check + Slack CRITICAL | crawler.ts |
| 3-3 | CommentWaveQueue: 60h TTL 초과 자동 정리 cron | agents-cafe.yml |
| 3-4 | 재크롤 갱신 로직 (7일 이내 글 like/comment 갱신) | crawler.ts |
| 3-5 | 페르소나 1명 추가 (79명 목표) | persona-data.ts |

### P4 — 네이버 블로그 연동 (별도 기획)
> P3 완료 후, agents/naver-blog/ 에이전트 현황 파악 후 계획

---

## 8. QA 방법론 (4단계)

### Phase 0: DB Migration QA (P0 전)
- [ ] `prisma migrate dev --create-only` dry-run 확인
- [ ] 백필 SQL 실행 전 SELECT로 형식 분포 확인
- [ ] 롤백 계획: migration down 스크립트 준비
- [ ] 성공 기준: `SELECT COUNT(*) FROM "CafePost" WHERE "articleId" IS NOT NULL > 0`

### Phase 1: 크롤러 단위 QA (P0 후)
- [ ] Playwright dry-run: 전체글보기 20건 샘플 수집 (**비로그인 상태**로도 실행 — R13)
- [ ] articleId 순차성 확인 (cafeId별 MAX 값 증가 확인)
- [ ] 기존 postUrl dedup과 신규 articleId dedup 비교 (동일 건수 체크)
- [ ] crawl-only 모드 실행 → BotLog 기록 확인
- [ ] GHA fallback skip 동작 확인 (아래 쿼리로 검증):
  ```sql
  SELECT COUNT(*) FROM "BotLog"
  WHERE "botType" = 'CAFE_CRAWLER'
    AND "action" = 'CONTENT_CURATE'
    AND DATE("executedAt") = CURRENT_DATE;
  -- 결과 ≥1 → GHA skip 정상 / 0 → GHA 실행 정상
  ```

### Phase 2: 파이프라인 통합 QA (P1 후)
- [ ] 11:30 FULL 수동 실행 → Slack #대시보드 "욕망 지도" 메시지 수신
- [ ] 15:30 CRAWL+CURATE 수동 실행 → 우나어 게시판 3건 발행 확인
- [ ] usedAt 기록 확인: `SELECT usedAt FROM "CafePost" WHERE usedAt IS NOT NULL LIMIT 5`
- [ ] GHA 이중 발행 방지: 11:30 발행 후 13:30 GHA skip 로그 확인
- [ ] 댓글 파동: wave1 1분 후 댓글 생성 확인 + CommentWaveQueue 상태 확인
- [ ] plist 4개 정상 등록: `launchctl list | grep unao`

### Phase 3: 72시간 모니터링 (P1 안정화)
- [ ] 발행량: 9건/일 ± 1건 (63건 총 목표)
- [ ] 발행 비율: STORY/HUMOR 정상 분포
- [ ] 중복 발행 없음: `SELECT postUrl, COUNT(*) FROM "CuratedContent" GROUP BY postUrl HAVING COUNT(*) > 1`
- [ ] GHA fallback 동작: Mac 의도적 종료 후 13:30 GHA 실행 확인
- [ ] isUsable 30 품질 모니터링: 좋아요0·댓글0 비율 10% 이하 유지

---

## 9. 종속성 맵 (개발 순서 어기면 운영 불가)

```
P0-0: Playwright dry-run (전체글보기 확인)
  ↓
P0-1: DB migration (articleId + usedAt + CommentWaveQueue)
  ↓
P0-2: articleId 백필
  ↓
P0-3: crawler.ts 전체글보기 전환
  │
  ├→ P0-4: config.ts minSave 20
  └→ P0-5: runner.ts GHA fallback
       ↓
P1-1: run-pipeline.ts crawl-curate 모드
  ↓
P1-6: config.ts minUsable 30
P1-7: content-curator.ts (usedAt + KILLER + 날짜필터 + DESIRE매핑)
  ↓
P1-7: plist 재편 + 15:30 신설 (창업자 launchctl reload)
P1-9: comment-wave API 신설
  ↓
P2-1: 수미상관 90%
P2-2: 페르소나 50명
P2-3: LIFE2 boardType
  ↓
P3: 안정화 + 욕망 20개 + 세션체크
  ↓
P4: 네이버 블로그 연동 (별도 기획)
```

---

## 10. 수정 대상 파일 목록

**P0**
- `prisma/schema.prisma` — articleId, usedAt, CommentWaveQueue
- `agents/cafe/crawler.ts` — 전체글보기 크롤 + articleId 저장
- `agents/cafe/config.ts` — allArticlesUrl + minSave 20 + board 제거
- `agents/cron/runner.ts` — curate BotLog fallback 체크

**P1**
- `agents/cafe/daily-brief.ts` — `loadTodayBrief()` 신규 구현 (G25)
- `agents/cafe/run-pipeline.ts` — crawl-curate 모드 신설
- `agents/cafe/content-curator.ts` — usedAt + loadTodayBrief() + KILLER + 날짜필터 + DESIRE매핑
- `agents/cafe/config.ts` — minUsable 30
- `~/Library/LaunchAgents/com.unao.cafe-crawler-morning.plist` — crawl-only 변경
- `~/Library/LaunchAgents/com.unao.cafe-crawler-lunch.plist` — 11:30 full 변경
- `~/Library/LaunchAgents/com.unao.cafe-crawler-evening.plist` — 21:30 crawl-curate 변경
- `~/Library/LaunchAgents/com.unao.cafe-crawler-afternoon.plist` — 15:30 신규
- `src/app/api/internal/comment-wave/route.ts` — 신규 API
- `.github/workflows/agents-cafe.yml` — wave cron + fallback 로직

**P2**
- `agents/cafe/content-curator.ts` — 수미상관 + 50명 + LIFE2 + 비율
- `src/app/api/internal/comment-wave/route.ts` — 글쓴이 제외 + 원문 90%
- `agents/seed/generator.ts` — HUMOR→ENTERTAIN

**P3**
- `agents/cafe/psych-analyzer.ts` — 욕망 20개 확장
- `agents/cafe/crawler.ts` — 세션 pre-check + 재크롤 갱신
- `agents/seed/persona-data.ts` — 79번째 페르소나
- `.github/workflows/agents-cafe.yml` — CommentWaveQueue TTL 정리 cron

---

## 11. 예상 지표 (V6 P1 완료 시)

| 지표 | 현재 | V6 P1 목표 |
|------|------|-----------|
| 큐레이션 발행 | 3건/일 | **9건/일** |
| 총 발행 (시드+큐레) | ~57건 | **63건+** |
| isUsable 통과율 | 14.6% | **~40%** |
| 첫 댓글 반응 | 10분 | **1분** |
| 크롤 URL 수 | 57개 | **2개** |
| 원문 보존율 | 50% | **90%** (P2) |
