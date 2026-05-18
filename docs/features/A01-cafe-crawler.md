# 카페 크롤러 파이프라인 운영 기획서 (A01)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27 (Feature Lifecycle 마이그레이션)

---

## 목표

50·60대 우나어 회원이 **공감할 수 있는 실제 커뮤니티 글**을 매일 자동 수집·AI 가공하여  
우나어 콘텐츠 풀을 지속 공급하고, 카테고리별 트렌드를 분석해 서비스 방향성에 반영한다.

---

## 배경

- 실제 50·60대가 활동하는 네이버 카페 2개(우아한 갱년기, 은퇴 후 50년)를 모니터링
- 단순 스크래핑이 아닌 AI 심리분석(감정·욕망·공포·페르소나) + 트렌드 분석으로 콘텐츠 인텔리전스 확보
- DailyBrief로 당일 카페 분위기를 요약 → 커뮤니티 운영 전략 수립에 활용

---

## 세부 기획

### 수집 대상 카페

| 카페 ID | 카페명 | 특성 |
|--------|--------|------|
| `wgang` | 우아한 갱년기 | 50대 여성 중심 |
| `dlxogns01` | 은퇴 후 50년 | 남녀 혼합, 재취업·여행·건강 |

---

### 3-Mode 크롤링

| 모드 | 스케줄(KST) | 소요시간 | 처리량 | 설명 |
|------|-----------|--------|--------|------|
| `DEEP` | 08:30 | 40~50분 | 최대 50건/카페 | 전체 심리분석 + 트렌드 분석 + DailyBrief |
| `QUICK` | 12:30 | 5~10분 | 최대 15건/카페 | 심리분석 스킵, 트렌드 업데이트만 |
| `ALL` | 20:40 | 40~50분 | 최대 50건/카페 | DEEP와 동일 (저녁 전량 수집) |

> 실행 환경: LOCAL_ONLY (launchd, Mac)  
> launchd plist: `~/Library/LaunchAgents/com.unaeo.cafe-crawler-*.plist`

---

### 6단계 파이프라인

```
[1] 카페 목록 크롤링 (Playwright headless)
    └─ 최대 50건 (DEEP/ALL) / 15건 (QUICK)
    └─ 중복 체크 (sourceUrl DB 조회)
        ↓
[2] 콘텐츠 수집
    └─ 게시글 본문 + 이미지 Playwright 추출
    └─ R2 이미지 업로드 (scraped/{postKey}/{index}.ext)
        ↓
[3] 심리분석 (DEEP/ALL 전용) — Claude Haiku
    └─ psych-analyzer.ts
    └─ 감정 태깅 / 욕망 분류 / 공포 분류 / 페르소나 매핑
        ↓
[4] DB 저장
    └─ CafePost INSERT (카테고리, 원문URL, 심리태그 포함)
        ↓
[5] 트렌드 분석 — Claude Sonnet-4-6
    └─ trend-analyzer.ts
    └─ 카테고리별 CafeTrend 집계
    └─ 주간 트렌드 변화 감지
        ↓
[6] DailyBrief 생성 (DEEP 전용) — Claude Sonnet-4-6
    └─ daily-brief.ts
    └─ 당일 수집 전체 요약 → DailyBrief 테이블 저장
    └─ Slack #대시보드 전송
```

---

### 락파일 (동시 실행 방지)

- 경로: `/tmp/unao-crawler.lock`
- TTL: 30분 (초과 시 자동 해제)
- 실행 시작 시 생성, 완료/실패 시 삭제

---

### 쿠키 관리

- 환경변수: `NAVER_COOKIES` (JSON 직렬화된 쿠키 배열)
- TTL: 30일 (`COOKIE_SET_DATE` 기반)
- 28일 도달 시 사전경고 Slack 알림 (#시스템)
- 쿠키 만료(30일 초과 또는 Playwright 로그인 감지) 시 실시간 긴급 알림

---

### DB 모델

| 테이블 | 역할 |
|--------|------|
| `CafePost` | 수집된 게시글 원문 + 심리태그 |
| `CafeTrend` | 카테고리별 트렌드 집계 (시계열) |
| `DailyBrief` | 당일 요약 (Slack + 어드민 뷰) |

---

### BotLog

- `botType: 'CAFE_CRAWLER'`
- `action` 종류:

| action | 발생 시점 |
|--------|---------|
| `CAFE_CRAWL` | 크롤링 완료 |
| `PSYCH_ANALYSIS` | 심리분석 완료 |
| `TREND_ANALYSIS` | 트렌드 분석 완료 |
| `DAILY_BRIEF_GENERATE` | DailyBrief 생성 성공 |
| `DAILY_BRIEF_PATCH` | DailyBrief 업데이트 |
| `DAILY_BRIEF_FALLBACK` | 수집 0건 시 폴백 브리프 생성 |

---

### Slack 알림 (10가지 조건)

| 조건 | 레벨 | 채널 |
|------|------|------|
| DailyBrief 생성 완료 | info | #대시보드 |
| 크롤링 성공 (게시글 수) | info | #리포트 |
| 수집 0건 | important | #리포트 |
| 트렌드 분석 완료 | info | #리포트 |
| 심리분석 완료 | info | #로그 |
| 쿠키 28일 도달 (사전경고) | warning | #시스템 |
| 쿠키 만료/로그인 감지 | urgent | #시스템 |
| 락파일 충돌 | warning | #시스템 |
| 전체 배치 실패 | error | #시스템 |
| DailyBrief FALLBACK | warning | #리포트 |

---

### 비용 영향

| 항목 | 단가 | 빈도 | 월간 |
|------|------|------|------|
| Claude Haiku (심리분석) | $0.0008/1K input, $0.0032/1K output | ~50건 × DEEP 2회/일 × 30일 | **~$7/월** |
| Claude Sonnet-4-6 (트렌드 분석) | $3/1M input, $15/1M output | 3회/일 × 30일 | **~$270/월** |
| Claude Sonnet-4-6 (DailyBrief) | $3/1M input, $15/1M output | 2회/일 × 30일 | **~$51/월** |
| Playwright 크롤링 | $0 | 3회/일 | $0 |
| **합계** | — | — | **~$328/월** |

> ⚠️ **비용 주의**: 트렌드 분석이 Sonnet-4-6으로 3회/일 실행되며 월간 비용이 높다.
> 최적화 포인트: 트렌드 분석 → Haiku 전환 또는 빈도 축소 검토 필요.

---

### 실패 처리

- 개별 게시글 처리 실패: try-catch 에러 로깅 후 다음 건 계속
- Playwright 네트워크 오류: 재시도 없음 (다음 스케줄 대기)
- 락파일 충돌: 즉시 종료 (기존 실행 완료 대기)
- 쿠키 만료: 즉시 종료 + 긴급 Slack 알림 → 수동 쿠키 갱신 필요

---

### 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `NAVER_COOKIES` | 필수 | 네이버 로그인 쿠키 (JSON) |
| `COOKIE_SET_DATE` | 필수 | 쿠키 설정 날짜 (TTL 계산용) |
| `ANTHROPIC_API_KEY` | 필수 | Claude API |
| `CLAUDE_MODEL_HEAVY` | `claude-sonnet-4-6` | 트렌드·DailyBrief |
| `CLAUDE_MODEL_LIGHT` | `claude-haiku-4-5` | 심리분석 |
| `DATABASE_URL` | 필수 | Supabase PostgreSQL |
| `DIRECT_URL` | 필수 | Supabase 직접 연결 |
| `SLACK_BOT_TOKEN` | 필수 | Slack 알림 |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | 필수 | R2 이미지 Public URL |
| `CLOUDFLARE_R2_*` (4개) | 필수 | R2 업로드 자격증명 |
| Slack 채널 변수 6개 | 필수 | 채널별 ID |

---

## 현재 운영 상태

✅ launchd 3-mode 스케줄 정상 가동  
✅ 2개 카페 × 3회/일 수집  
✅ 심리분석 + 트렌드 + DailyBrief 파이프라인 완전 작동  
⚠️ 비용 높음: 트렌드 분석 Sonnet × 3회/일 → 월 ~$328 (최적화 필요)  
⚠️ 쿠키 30일 TTL: 수동 갱신 필요 (28일 도달 시 Slack 사전경고)

---

## 관련 링크

- 크롤러 진입점: `agents/cafe/crawler.ts`
- 심리분석: `agents/cafe/psych-analyzer.ts`
- 트렌드 분석: `agents/cafe/trend-analyzer.ts`
- DailyBrief: `agents/cafe/daily-brief.ts`
- launchd plist: `launchd/com.unaeo.cafe-crawler-*.plist`
- DB 모델: `prisma/schema.prisma` — `CafePost`, `CafeTrend`, `DailyBrief`
- 외부 콘텐츠 에이전트: [A04](A04-external-content.md)
- 매거진 생성 에이전트: [A02](F05-magazine.md)

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |
| 2026-05-12 | quality-scorer.ts에 `calculateKillerScore()` 추가 + crawler.ts killerScore 저장 | 화제성글 후보 선별 고도화 (참여도 55%, 최신성 5%) |
| 2026-05-12 | types.ts에 `parseTopComments()`+`classifyCommentAtmosphere()` 추가, quality-scorer.ts 베스트댓글 likeCount 보너스(최대+10), trend-analyzer.ts postSummaries에 댓글 분위기·베스트댓글 포함 | 댓글 분위기 파이프라인 연결 — 수집된 topComments가 qualityScore·트렌드 분석에 실질 반영 |
| 2026-05-13 | V6 P0: schema.prisma에 CafePost.articleId+usedAt 추가, CommentWaveQueue 신규 테이블, migration SQL 작성. crawler.ts에 `collectAllArticleUrls()` 신규 + `crawl-only` 모드 + articleId 저장. config.ts에 allArticlesUrl(wgang/dlxogns01) + minSave 20. types.ts에 allArticlesUrl/legacyCrawler/articleId 필드. runner.ts에 content-curate GHA 스마트 fallback | 전체글보기 기반 증분 크롤(57개 board→2개 URL), 댓글 파동 큐 인프라, GHA 이중 발행 방지 |
| 2026-05-13 | V6 P1: run-pipeline.ts에 crawl-only/full/crawl-curate 3개 모드 신설. daily-brief.ts에 `loadTodayBrief()` 추가(오늘→어제→최근 fallback). content-curator.ts에 usedAt 기록+loadTodayBrief() 호출+DESIRE_TO_SUBCATEGORY 매핑+killerScore 정렬+48h 날짜 필터. config.ts minUsable 60→30. plist 4회 구조로 재편(08:30 crawl-only / 11:30 full / 15:30 crawl-curate / 21:30 crawl-curate). wave-processor.ts 신규(GHA `*/5 * * * *`). GHA wave-process job + 스마트 fallback skip 로직 추가 | 큐레이션 3건→9건/일, 첫 댓글 10분→1분, isUsable 통과율 14.6%→~40% 목표 |
| 2026-05-13 | V6 P2: content-curator.ts 수미상관 90% 프롬프트 교체(반반이→원본 90% 보존, 첫문장/마지막만 페르소나). 큐레이션 페르소나 19명→50명(STORY 25/LIFE2 18/HUMOR 7). wave-processor.ts 댓글 원문 90% 보존+COMMENTER_PERSONA_IDS 50명 확장. generator.ts ENTERTAIN 욕망 desireToArea 매핑 추가 | AI 티 감소, LIFE2 게시글 비율 확보, 댓글 자연스러움 향상 |
| 2026-05-13 | V6 P3: psych-analyzer.ts 욕망 카테고리 13→20개 확장(BEAUTY/DIGITAL/FOOD/SPIRITUAL/HOUSING/FASHION/PET 추가). content-curator.ts DESIRE_TO_SUBCATEGORY+guessDesire 키워드 7개 연동. generator.ts desireToArea 6개 추가. persona-data.ts BX(말티즈엄마) 79번째 추가. crawler.ts refreshRecentPosts()+refresh 모드 신설. run-pipeline.ts crawl-only에 재크롤 갱신 연결 | 욕망 인텔리전스 정밀도 향상, 페르소나 79명 목표 달성, 7일 이내 게시글 지표 자동 갱신 |
| 2026-05-14 | crawler.ts `buildPostFromTarget`에 `mainPage?: Page` 파라미터 추가. extractComments를 메인 페이지(iframe 외부)에서 먼저 시도 → 빈 배열이면 iframe(target) 재시도. 대기시간 1.5초→3초 + waitForSelector 추가 | 신형식 네이버 카페 댓글이 cafe_main iframe 외부에 렌더링되어 7일간 수집 0%였던 근본 원인 수정 |
| 2026-05-15 | content-curator.ts DESIRE_KEYWORDS HOBBY에서 '요리' 제거 + 수영·골프·바둑·자전거·캠핑·낚시·뜨개질·서예·그림·꽃꽂이 10개 추가 | '요리' 키워드가 HOBBY→FOOD 순서 탐색에서 음식 글을 HOBBY로 잘못 분류. 취미 키워드 확장으로 GENERAL 분류 비율 감소 목표 |
| 2026-05-16 | content-curator.ts `publishCuratedContent()` 앞에 LIFE2 크로스소스 dedup 추가 — 24h 내 LIFE2 전체 Post 조회 후 2자 명사 overlap ≥3 이면 발행 스킵 | Seed·PopularCurator와 동일 주제 중복 발행 차단 (크로스소스 dedup 미구현 버그) |
| 2026-05-15 | 크롤 7회/일로 확장(07:40·09:30·11:30·14:30·17:30·21:30·00:30), GHA 큐레이션 45분 간격 20슬롯 100건/일 전환. runner.ts dedup 60분→25분. content-curator.ts 01:15 KST 새벽 감성글 우선 정렬(MEANING/SPIRITUAL/RELATION/FAMILY) 추가 | 07:00대 아침 콘텐츠 공백 해소, 저녁/새벽 감성글 발행, 발행량 75→100건/일 목표 |
| 2026-05-18 | content-curator.ts P1: todayPublishedTitles 조회 + countKeywordOverlap() — 특정 키워드 당일 2회 이상 발행 시 skip. P2: toNouns regex {2,2}→{2,} + 겹침 기준 3→2 + editDistance≤5 Levenshtein 추가. P3: SEASONAL_KEYWORDS + isSeasonMismatch() — 계절 불일치 글 자동 skip | 5/18 봇글 29개 전수 분석: 제주 8개(28%) 편중, 1글자 차이 의미중복(마음도/마음이), 5월 벚꽃글 발행 등 3가지 품질 문제 수정 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | 쿠키 30일마다 만료 수동 갱신 필요 | 네이버 카페 인증 만료 | 28일 사전경고 알람으로 예방적 갱신 |
| 진행중 | 트렌드 분석 비용 높음 (~$270/월) | Sonnet × 3회/일 | 5월 개선 시 Haiku 전환 또는 빈도 축소 검토 |
| 2026-05-14 ✅ | 08:30 plist 미실행 (exit code 126) | macOS Full Disk Access에서 node 바이너리 권한 미부여 | 시스템 설정 → 개인 정보 보호 → 전체 디스크 접근 → node 활성화 → 내일부터 정상 실행 |
