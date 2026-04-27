# Threads 토큰 갱신 운영 기획서 (M04)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

Meta Threads Long-lived 토큰(60일 유효)을 만료 전에 자동 갱신해  
SNS 자동 포스팅(A06)이 중단 없이 운영되도록 보장한다.

---

## 배경

- Threads API는 Long-lived 토큰(60일) 사용
- 토큰 만료 시 SNS 포스팅 전체 중단 → 사전 갱신 필수
- 매주 수요일 10:00 자동 갱신 + 7일 이내 만료 시 선제 경고

---

## 세부 기획

### 토큰 갱신 방식

- **감지**: 마지막 성공 BotLog의 `details.expiresAt` 파싱 → 잔여일 계산
- **갱신 API**: Meta Graph API `GET /v1.0/refresh_access_token?grant_type=th_refresh_token&access_token={token}`
- **응답**: `{ access_token, expires_in(초) }` → 새 만료일 계산

---

### 실행 파이프라인

```
1. threadsClient.isConfigured() 확인
   → 미설정 시 early return

2. 선제 경고 확인
   - 마지막 성공 BotLog.details.expiresAt 조회
   - daysLeft ≤ 7 → Slack critical "만료 임박 — {daysLeft}일 남음"

3. 토큰 갱신 시도
   → refreshLongLivedToken() 호출
   → 성공: BotLog SUCCESS + Slack info "갱신 완료 + GitHub Secrets 업데이트 필요"
   → 실패: BotLog FAILURE + Slack critical "갱신 실패 — 수동 재발급 필요"
```

> **주의**: 자동 갱신 후 GitHub Secrets의 `THREADS_ACCESS_TOKEN` 수동 업데이트 필요  
> (API 응답으로 새 토큰 획득 → Secrets 반영은 수동)

---

### 스케줄 / 실행 환경

| 핸들러 | 워크플로우 | UTC 크론 | KST |
|--------|----------|---------|-----|
| `cmo:threads-token-refresh` | `agents-social.yml` | `0 1 * * 3` | 매주 수요일 10:00 |

**실행 환경**: GHA ubuntu-latest, Node 20  
**Claude API 비용**: $0

---

### Slack 알림

| 조건 | 레벨 | 내용 |
|------|------|------|
| 만료 7일 이내 | critical | 잔여일 + 긴급 조치 안내 |
| 갱신 성공 | info | 새 토큰 prefix + Secrets 업데이트 요청 |
| 갱신 실패 | critical | 수동 재발급 안내 (`/api/threads/auth` OAuth 재인증) |

---

### BotLog

- `botType: 'CMO'`
- `action: 'THREADS_TOKEN_REFRESH'`
- `status: 'SUCCESS' | 'FAILURE'`
- `details: { tokenPrefix, refreshedAt, expiresAt, expiresInDays }` 또는 `{ error }`

---

## 관련 링크

- 갱신 에이전트: `agents/cmo/platforms/threads-token-refresh.ts`
- Threads 클라이언트: `agents/cmo/threads-client.ts`
- GHA 워크플로우: `.github/workflows/agents-social.yml`
- Runner 핸들러: `agents/cron/runner.ts` — `cmo:threads-token-refresh`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | 갱신 후 GitHub Secrets 수동 업데이트 필요 | Secrets API 쓰기 권한 없음 | 수동 조치 + Slack 알림으로 안내 |
