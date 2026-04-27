# 브리프 모니터 운영 기획서 (M03)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

매일 아침 DailyBrief 생성 여부를 확인해 시드봇·매거진 파이프라인이  
올바른 당일 데이터로 실행되고 있는지 보장한다.

---

## 배경

- DailyBrief는 시드봇(A05)과 매거진(A02)의 입력 데이터
- 카페 크롤러(launchd 08:30) 실패 시 → DailyBrief 미생성 → 전체 파이프라인 fallback
- 09:30에 조기 감지해 대응 시간 확보

---

## 세부 기획

### 감시 대상

- 테이블: `DailyBrief`
- 조건: `date = TODAY` (UTC 기준)
- 확인 필드: `mode`, `createdAt`

---

### 이상 판단 기준

| 상태 | 조건 | 의미 |
|------|------|------|
| ✅ 정상 | `brief.mode = 'deep_update' | 'quick_update'` | 당일 크롤 정상 완료 |
| ⚠️ FALLBACK | `brief.mode = 'fallback_yesterday'` | 당일 CafeTrend 부족 → 어제 데이터 사용 중 |
| ❌ CRITICAL | `brief === null` | DailyBrief 미생성 (크롤러 미실행 또는 실패) |

---

### 실행 파이프라인

```
1. DailyBrief.findUnique({ date: TODAY }) → brief

2. brief === null (CRITICAL)
   → Slack critical 알림 (조치 방법 포함)
   → BotLog FAILED

3. brief.mode === 'fallback_yesterday' (IMPORTANT)
   → Slack important 알림 (생성 시간, 원인 설명)
   → BotLog PARTIAL

4. 정상
   → BotLog SUCCESS (Slack 알림 없음)
```

---

### 스케줄 / 실행 환경

| 핸들러 | 워크플로우 | UTC 크론 | KST |
|--------|----------|---------|-----|
| `cafe_crawler:brief-monitor` | `agents-cafe.yml` | `30 0 * * *` | 매일 09:30 |

**실행 환경**: GHA ubuntu-latest, Node 20  
**Claude API 비용**: $0 (DB 조회만)

---

### Slack 알림

| 조건 | 레벨 | 내용 |
|------|------|------|
| brief 없음 | critical | 조치 방법 (Mac launchd 확인, 수동 실행 커맨드) |
| fallback_yesterday | important | 생성 시간 + 원인 설명 |
| 정상 | — | 알림 없음 |

---

### BotLog

- `botType: 'CAFE_CRAWLER'`
- `action: 'BRIEF_MONITOR_CHECK'`
- `status: 'SUCCESS' | 'PARTIAL' | 'FAILED'`

---

## 관련 링크

- 모니터 에이전트: `agents/cafe/brief-monitor.ts`
- GHA 워크플로우: `.github/workflows/agents-cafe.yml`
- Runner 핸들러: `agents/cron/runner.ts` — `cafe_crawler:brief-monitor`
- DB 모델: `prisma/schema.prisma` — DailyBrief

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | - | - | - |
