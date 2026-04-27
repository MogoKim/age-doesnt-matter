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

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | 쿠키 30일마다 만료 수동 갱신 필요 | 네이버 카페 인증 만료 | 28일 사전경고 알람으로 예방적 갱신 |
| 진행중 | 트렌드 분석 비용 높음 (~$270/월) | Sonnet × 3회/일 | 5월 개선 시 Haiku 전환 또는 빈도 축소 검토 |
