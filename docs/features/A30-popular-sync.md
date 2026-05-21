# A30 — 카페 인기글 sync+큐레이션

## 개요
네이버 카페 `/popular` 탭을 하루 3회 크롤해 실제 인기글의 지표를 갱신(killerScore 재계산)하고,
인기글 전용 큐레이션으로 우나어에 5건/슬롯 발행. 기존 100건/일 → **115건/일**로 확장.

## 코드 위치
- `agents/cafe/popular-sync.ts` — Mac launchd 전용 standalone 스크립트 (락파일 없음, 10분 타임아웃)
- `agents/cafe/popular-curator.ts` — GHA 실행 auto-run 독립 큐레이터
- `agents/cafe/curator-shared.ts` — 공유 상수+순수함수 (PERSONAS, DESIRE_TO_BOARD, matchPersona 등)
- `.github/workflows/agents-cafe-popular-curation.yml` — popular-curate GHA 워크플로우
- `launchd/com.unao.cafe-crawler-popular-{morning|afternoon|evening}.plist` — popular-sync plist 3개

## 스케줄
| 단계 | 시각 (KST) | 실행 환경 | 동작 |
|------|-----------|---------|------|
| popular-sync 오전 | 10:30 | Mac launchd | wgang/dlxogns01 /popular 탭 수집 → isPopular=true 마킹 |
| popular-curate 오전 | 10:50 | GHA | isPopular=true 글 5건 AI 재가공 → 발행 |
| popular-sync 오후 | 16:00 | Mac launchd | 동일 |
| popular-curate 오후 | 16:15 | GHA | 동일 |
| popular-sync 저녁 | 21:15 | Mac launchd | 동일 (저녁 크롤 21:30 전 완료) |
| popular-curate 저녁 | 21:30 | GHA | 동일 |

## 설계 핵심 결정
- **BUG-1 해결**: popular-sync.ts는 run-pipeline.ts를 경유하지 않아 락파일 공유 없음 → 저녁 크롤 스킵 불가
- **BUG-2 해결**: content-curator.ts에 `isPopular: false` 필터 2곳 추가 → 인기글이 regular curate에 선취되지 않음
- **BUG-3 해결**: popular-curator.ts는 content-curator.ts를 import하지 않음 (auto-run 이중실행 방지)
- **BUG-4 해결**: 2단계 커밋 (Commit A: schema, Commit B: code) → GHA 런타임 에러 방지
- 매 sync 시작 시 해당 카페 isPopular 전체 리셋 → 전날 인기글 누적 방지
- GHA concurrency group: `cafe-hourly-curation` 공유 → popular+regular 동시 실행 방지

## DB 의존성
- `CafePost.isPopular` (Boolean @default(false)) — Commit A 마이그레이션으로 추가됨
- `CafePost.popularUpdatedAt` (DateTime?) — sync 시각 기록

## 비용 영향
- popular-curator: Haiku 모델, 슬롯당 5건, 일 3슬롯 → 15건/일
- 예상 비용: content-curate 대비 +15% (동일 모델·토큰 규모)

## 수정 이력
| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-05-21 | curator-shared.ts MONEY 키워드 확장 — 코스피·코스닥·나스닥·etf·커버드콜·코덱스·kodex·하이닉스·삼성전자·배당·배당주·미국주식 추가 | 투자 글이 guessDesire() 미감지로 STORY/자유수다 오분류되는 문제 완화 |
| 2026-05-15 | 신규 생성 — popular-sync 3슬롯 + popular-curate 3슬롯 | 카페 실제 인기글 우나어 발행 (killerScore 과소평가 문제 해결) |
| 2026-05-16 | popular-curator.ts 발행 루프에 LIFE2 크로스소스 dedup 추가 — 24h 내 LIFE2 전체 Post 조회 후 2자 명사 overlap ≥3 이면 발행 스킵 | Seed·ContentCurator와 동일 주제 중복 발행 차단 (크로스소스 dedup 미구현 버그) |
| 2026-05-19 | ⑧ popular-curator.ts 발행 트랜잭션에 killerScore≥85 → Post.isFeatured+featuredAt 즉시 설정 추가 | 고점수 인기글 발행 즉시 집중 부스트 자동 적용 (수동 토글 불필요) |
| 2026-05-20 | popular-curator.ts: `getBotUser()` 제거 → `getCuratorBotUser()` 신규 (email prefix `curator-`, PersonaMatch.nickname 직접 사용). `AUTHOR_DAILY_POST_CAP=2` + `countTodayPostsByPersona()` — cap 초과 시 동일 board 내 대체 페르소나 탐색. curator-shared.ts `PERSONAS` import 추가 | ID collision '손뜨개' 버그 수정 + 페르소나 일일 독점 구조적 차단 |
| 2026-05-20 | 페르소나 시스템 SSoT 통합 — popular-curator.ts 로컬 중복(AUTHOR_DAILY_POST_CAP·getCuratorBotUser·countTodayPostsByPersona) 전부 curator-users.ts로 이전. curator-shared.ts 큐레이터 페르소나 51→100명, DESIRE_PERSONA_MAP 전 카테고리 확장 | Single Source of Truth 완성 — 이후 페르소나·한도 변경은 curator-shared.ts/curator-users.ts 한 파일씩 |
