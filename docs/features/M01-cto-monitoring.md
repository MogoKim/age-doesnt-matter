# CTO 모니터링 운영 기획서 (M01)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

DB·서비스·API·크롤러·보안·아키텍처를 자동으로 감시해  
장애를 사람보다 먼저 감지하고 Slack으로 즉시 알림한다.  
자동 복구는 없고, 감지→알림→수동 대응 구조.

---

## 배경

- 자동화 에이전트 16개+ 운영 → 사람이 일일이 확인 불가
- 크롤러 쿠키 만료, API 장애, 에러 급증을 빠르게 알아야 피해 최소화
- 비용 $0 (Claude API 미사용, 순수 DB+Fetch 기반)

---

## 세부 기획

### 서브 에이전트 구성 (5개)

| ID | 파일 | 역할 | 스케줄 |
|----|------|------|--------|
| M01-A | `health-check.ts` | DB·사이트·API 응답 확인 | 매 4시간 |
| M01-B | `error-monitor.ts` | 에러 이벤트 급증 감지 | 매 4시간 |
| M01-C | `crawler-health.ts` | 카페 크롤러 건강 + 품질 추세 | 매일 07:00 |
| M01-D | `security-audit.ts` | 로그인 실패·비용 이상·어드민 감사 | 매일 06:00 |
| M01-E | `qa-verifier.ts` + `arch-review.ts` | 일일 에이전트 실행 감사 + 주간 아키텍처 리포트 | 23:45 / 월 07:00 |

---

### M01-A: 헬스체크 (health-check.ts)

**감시 대상 3가지:**

| 대상 | 방법 | 이상 조건 |
|------|------|---------|
| DB 연결 | `prisma.$queryRaw SELECT 1` | 실행 실패 |
| 웹사이트 | `fetch(https://age-doesnt-matter.com)` | 비 2xx 응답 |
| API | `fetch({SITE_URL}/api/best)` | 비 2xx 응답 |

- 타임아웃: 10초 (`AbortSignal.timeout(10_000)`)
- 3개 중 하나라도 실패 → Slack **DASHBOARD** `critical` 즉시 알림

**맹점**: SELECT 1은 DB 쿼리 성능 이상 감지 불가. API 200이어도 payload 정상성 미검증.

---

### M01-B: 에러 모니터 (error-monitor.ts)

**감시 대상:**
- `EventLog` 테이블 — `eventName LIKE 'error%'` 최근 1시간, 최대 50건

**이상 조건:**

| 조건 | 알림 레벨 |
|------|---------|
| 에러 10건 이상 + 오늘 에러 ≥ 어제 동시간대 × 2 | `critical` (반복 패턴) |
| 에러 10건 이상 (반복 아님) | `important` |
| 10건 미만 | 알림 없음 |

- Slack 채널: **SYSTEM**
- 어제 데이터 없으면 반복 패턴 비교 불가 (초기 운영 시 한계)

---

### M01-C: 크롤러 헬스 (crawler-health.ts)

**감시 대상:**
- `BotLog` — `botType='CAFE_CRAWLER'` 24시간 이내
- `CafePost` — `crawledAt` 24시간 이내 (qualityScore, isUsable)

**판단 기준:**

| 지표 | 정상 | 경고 |
|------|------|------|
| 성공률 | ≥ 80% | < 80% |
| 연속 실패 | < 3회 | ≥ 3회 |
| 쿠키 만료 | 없음 | 401/Unauthorized/CAPTCHA 패턴 감지 |
| 낮은 수집량 | itemCount ≥ 3 | SUCCESS인데 itemCount < 3 |
| 품질 추세 | 7일 평균 ± 10% 내 | 7일 평균 대비 -10% 이상 하락 |

- Slack 채널: **SYSTEM** | 정상: `info` / 이상: `important`
- 자동 복구 없음 → 쿠키 만료 시 수동 재로그인 필요

---

### M01-D: 보안 감사 (security-audit.ts)

**감시 대상:**
- 로그인 실패 급증 (EventLog)
- 비용 이상 (BotLog 비용 필드)
- 어드민 액션 이상 (AdminQueue)
- 전체 실패율

**Slack 채널:**
- CRITICAL 발견 → **DASHBOARD** `critical`
- WARNING/OK → **SYSTEM** `info`

---

### M01-E: QA 검증 + 아키텍처 리뷰

**qa-verifier.ts (23:45 KST 매일):**
- DAILY_EXPECTED 에이전트들의 당일 실행 여부 확인
- 미실행 감지 → Slack 알림
- 배포 실패 시 Claude Haiku 1회 호출 (원인 분석, 유일한 API 비용 발생)

**arch-review.ts (월요일 07:00 KST):**
- 주간 아키텍처 건강 리포트 생성
- BotLog 패턴 분석 → Slack REPORT 채널

---

### 하루 실행 흐름

```
06:00 KST — security-audit.ts (보안 감사)
07:00 KST — crawler-health.ts (크롤러 건강 + 품질 추세)
09:00 KST — health-check.ts + error-monitor.ts (첫 번째 4시간 체크)
13:00 KST — health-check.ts + error-monitor.ts
17:00 KST — health-check.ts + error-monitor.ts
21:00 KST — health-check.ts + error-monitor.ts
23:45 KST — qa-verifier.ts (일일 에이전트 실행 감사)
────────────────────────────
월요일 07:00 KST — arch-review.ts (주간 아키텍처 리포트)
```

---

### 스케줄 / 실행 환경

| 핸들러 | 워크플로우 | UTC 크론 | KST |
|--------|----------|---------|-----|
| `cto:health-check` | `agents-hourly.yml` | `0 */4 * * *` | 4시간마다 |
| `cto:error-monitor` | `agents-hourly.yml` | `0 */4 * * *` | 4시간마다 |
| `cto:security-audit` | `agents-daily.yml` | `0 21 * * *` | 06:00 |
| `cto:crawler-health` | `agents-daily.yml` | `0 22 * * *` | 07:00 |
| `cto:qa-verify` | `agents-daily.yml` | `45 14 * * *` | 23:45 |
| `cto:arch-review` | `agents-daily.yml` | `0 22 * * 0` | 월 07:00 |

**실행 환경**: GHA ubuntu-latest, Node 20  
**LOCKED 상태**: automation_status=LOCKED에서도 실행 (MONITORING_TASKS 포함)

---

### Slack 알림 요약

| 에이전트 | 조건 | 채널 | 레벨 |
|---------|------|------|------|
| health-check | 실패 시 | DASHBOARD | critical |
| error-monitor | 에러 10건+ (반복) | SYSTEM | critical |
| error-monitor | 에러 10건+ (비반복) | SYSTEM | important |
| crawler-health | 이상 감지 | SYSTEM | important |
| crawler-health | 정상 | SYSTEM | info |
| security-audit | CRITICAL | DASHBOARD | critical |
| security-audit | WARNING/OK | SYSTEM | info |

---

### 비용 영향

| 에이전트 | Claude API | 외부 API | 월간 비용 |
|---------|-----------|---------|---------|
| health-check | 0회 | 2회 fetch/실행 | $0 |
| error-monitor | 0회 | 0회 | $0 |
| crawler-health | 0회 | 0회 | $0 |
| security-audit | 0회 | 0회 | $0 |
| qa-verifier | 배포실패 시 Haiku 1회 | 0회 | 거의 $0 |
| **합계** | | | **~$0/월** |

---

## 관련 링크

- `agents/cto/health-check.ts`
- `agents/cto/error-monitor.ts`
- `agents/cto/crawler-health.ts`
- `agents/cto/security-audit.ts`
- `agents/cto/qa-verifier.ts`
- `agents/cto/arch-review.ts`
- GHA 워크플로우: `.github/workflows/agents-hourly.yml`, `agents-daily.yml`
- Runner 핸들러: `agents/cron/runner.ts` — `cto:*`
- DB 모델: `prisma/schema.prisma` — BotLog, EventLog, CafePost

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | 헬스체크 DB payload 정상성 미검증 | SELECT 1만 확인, 실제 쿼리 성능 불확인 | 추후 개선 권장 |
| 진행중 | error-monitor 첫날 반복 패턴 비교 불가 | 어제 BotLog 없음 | 동작 영향 없음, 자연 해소 |
| 진행중 | Slack 알림 실패 시 재시도 없음 | notifier.ts 구조적 한계 | 모니터링 자체 장애 시 무음 가능 |
