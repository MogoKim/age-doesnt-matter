# cron-job.org 디스패처 — 운영 자산 등록

> **작성** 2026-08-21 (P0-1D 감사) · **분류** 운영 인프라 / 외부 의존
> **한 줄** GHA 예약 실행이 사실상 동작하지 않아, 외부 스케줄러가 실제 실행을 담당한다.

---

## 0. 왜 이 문서가 필요한가

2026-08-21 감사에서 `agents-cafe-wave` 실행 대부분이 `schedule`이 아니라
`workflow_dispatch`라는 사실이 발견됐다. 그런데 **repo·launchd 어디에도 디스패처가 없었다.**
호출 주체를 역추적하는 데 감사 한 회차가 통째로 들어갔다.

원인은 두 가지였다.

1. 토큰 이름(`cron-job-trigger`)이 모호해 무엇을 부르는지 알 수 없었다.
2. 기존 문서가 이것을 **"이중 안전망"** 으로 서술해, 없어도 되는 보조 장치로 읽혔다.

**이 문서는 그 역추적을 다시 하지 않기 위해 존재한다.**

---

## 1. 서비스

| 항목 | 값 |
|---|---|
| 서비스 | **cron-job.org** |
| 역할 | GitHub API `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches` 호출 |
| 대상 저장소 | `MogoKim/age-doesnt-matter` |
| 등록 잡 | **21개** |
| 계정 | 창업자 (로그인 정보 위치는 별도 보관 — 이 문서에 적지 않는다) |

### 등록 잡 구성

```
agents-cafe-wave           5분 주기          → 288회/일
큐레이션 20슬롯             08:20~01:15 KST   → agents-cafe-hourly-curation
────────────────────────────────────────────
합계                       21개
```

⚠️ **dispatch를 받는 워크플로우는 2종뿐이다**(2026-08-21 실측).
`agents-cafe-popular-curation` · `agents-killer-post` · `ops-daily-report` ·
`prewarm-detail-pages` · `push-scheduled`는 전부 100% `schedule`이다.
토큰이 다른 워크플로우를 건드린 흔적은 없다.

---

## 2. 토큰

| 항목 | 값 |
|---|---|
| 이름 | `cron-job-trigger` |
| 유형 | GitHub fine-grained PAT |
| 생성일 | **2026-05-18** |
| 만료 | **없음** (의도된 설정 — §5 참조) |
| Repository access | `MogoKim/age-doesnt-matter` **단일** |
| Repository permissions | Metadata **Read** · Actions **Read and Write** |
| User permissions | **없음** |

### 권한 평가 — 과도하지 않다

```
🟢 Contents 권한 없음   → 코드 변조 불가
🟢 Secrets 권한 없음    → 시크릿 열람 불가
🟢 repo 단일           → 다른 저장소 영향 없음
🟢 user permissions 0  → 계정 수준 조작 불가
🟡 Actions Write       → 이 repo의 임의 워크플로우 dispatch 가능
```

`Actions: Write`는 dispatch에 필요한 최소 권한이다.
GitHub 권한 모델상 **워크플로우 하나만 지정할 수는 없다** — 이건 줄일 수 없는 잔여 위험이다.
실제로는 위 2종만 호출하고 있음이 실측으로 확인됐다.

---

## 3. 🔴 끄면 무슨 일이 생기는가

### 실측 근거

```
2026-05-16   총  19회/일   커버리지  7%   schedule 19 · dispatch   0
2026-05-17   총  16회/일   커버리지  6%   schedule 16 · dispatch   0
──────────────────── cron-job-trigger 토큰 생성: 2026-05-18 ────────────────────
2026-05-18   총 197회/일   커버리지 68%   schedule 10 · dispatch 187
2026-06-16   총 295회/일   커버리지102%   schedule  7 · dispatch 288
2026-07-16   총 303회/일   커버리지105%   schedule 15 · dispatch 288
2026-08-20   총 326회/일   커버리지113%   schedule 38 · dispatch 288
```

**전날까지 dispatch 0건이었다가 토큰 생성일에 187건이 발생했다.**
이후 95일간 `288 = 24h × 12`가 정확히 반복된다. 한 회차도 빠지지 않았다.

### 영향

```
🔴 댓글 파동        288회/일 → 16~19회/일 (커버리지 7%)
                   UserPostWaveQueue · CommentWaveQueue 소비가 사실상 정지
🔴 큐레이션         20슬롯 중 dispatch분 소실 → 발행량 급감
🔴 조용한 실패      알림이 없다. 며칠간 아무도 모를 수 있다
```

⚠️ **가장 큰 위험은 "조용한 실패"다.**
2026-05-16~17의 커버리지 7% 상태도 **2026-08-21 감사에서야 처음 드러났다.**
장애 알림이 울린 적이 없다. 서비스가 죽지 않고 **느려질 뿐**이기 때문이다.

---

## 4. 교체 절차

```
1. cron-job.org 콘솔 로그인
2. 21개 잡 각각의 Authorization 헤더에서 토큰 교체
3. 교체 후 24시간 관측 — dispatch가 다시 288회/일인지 확인
```

⚠️ **잡이 21개다. 하나라도 빠뜨리면 그 슬롯만 조용히 죽는다.**
전체 중단이 아니라 **부분 중단**이라 발견이 더 늦다.

### 확인 명령 (read-only)

```bash
# 최근 dispatch 비율
gh run list --workflow=agents-cafe-wave.yml --limit 100 \
  --json createdAt,event -q '.[] | "\(.createdAt[0:10]) \(.event)"' | sort | uniq -c

# 특정 일자 커버리지 (이론값 288회/일)
gh run list --workflow=agents-cafe-wave.yml --limit 400 --created 2026-08-20 \
  --json event -q '. | length'
```

---

## 5. 🚫 금지 사항

| 금지 | 이유 |
|---|---|
| **위치 확인 전 토큰 교체** | 새 토큰을 어디에 넣을지 모르면 확실한 중단이 된다 |
| **만료일 설정** | 만료일에 21개 잡이 **알림 없이** 죽는다. 커버리지 7%로 복귀 |
| **즉시 삭제** | 댓글 파동이 즉시 1/18로 떨어진다 |

**유출 위험보다 조용한 중단의 손해가 크다.** 만료 없음은 의도된 선택이다.

### 대신 해야 할 것

```
분기별  GitHub → Settings → Developer settings → Fine-grained tokens
        → cron-job-trigger → "Last used" 확인 (5분 이내면 정상)
```

⚠️ GitHub API는 **어느 토큰이 dispatch를 호출했는지 노출하지 않는다.**
`actor`는 `MogoKim`으로만 보인다. 토큰 특정은 GitHub UI의 "Last used"로만 가능하다.
따라서 `ops-doctor`에 자동 점검으로 넣을 수 없다 — 수동 분기 점검이다.

---

## 6. heartbeat 설계 (미구현 — 별도 승인 대기)

지금 구조에는 *"돌아야 할 것이 안 돌았다"* 를 감지하는 장치가 **없다.**

### 제안

```
조건    최근 30분간 agents-cafe-wave 실행 0회
동작    Slack 알림
근거    5분 주기이므로 30분이면 정상 6회. 0회는 명백한 이상이다
```

`P0-1C`에서 `unao-prod-sync` 로그로 한 것과 같은 발상이다 —
**침묵을 성공으로 읽지 않게 만든다.**

### 상태

```
우나어 적용    ⬜ 별도 승인 대기 (구현하지 않음)
M3 소란소란     ✅ D-day 체크리스트에 포함 (§7)
```

---

## 7. M3(소란소란) 적용 원칙

외부 스케줄러 구조 자체는 **재사용한다.** 95일간 288회/일 무결 실적이 있다.
GitHub cron 단독은 커버리지 7%로 실측 배제됐다.

### 반드시 다르게 할 것

```
1. 토큰 이름에 용도를 넣는다
   ❌ cron-job-trigger              — 모호. 이번 역추적의 원인
   ✅ soran-cafe-wave-dispatch      — 무엇을 부르는지 이름만 봐도 안다

2. 잡 목록을 repo에 고정한다
   콘솔에만 있으면 계정 접근이 막히는 순간 재현 불가

3. heartbeat를 처음부터 배선한다
   D-day 24시간 오픈에서 파동이 16회/일로 떨어지면
   방문자에게 "죽은 커뮤니티"로 보인다
```

### D-day 체크리스트

```
[ ] cron-job.org 계정에 M3 repo용 크론잡 등록
[ ] 전용 fine-grained token 발급 (repo 단일 · Actions RW · Metadata R · user 권한 없음)
[ ] 토큰명에 용도 명시 (soran-cafe-wave-dispatch 형식)
[ ] 잡 목록·스케줄·대상 워크플로우를 이 문서 형식으로 기록
[ ] wave heartbeat Slack 알림 배선
[ ] D-day 전날 실측 — 실제 288회/일이 나오는지 확인
```

---

## 8. 알려진 한계

```
dispatch 성공(HTTP 200) ≠ GHA runner 즉시 실행
```

cron-job.org는 **트리거 전송까지만** 책임진다.
GHA runner 부하로 최대 30~40분 지연될 수 있고, 이건 외부 스케줄러가 제어할 수 없다.
지연 대응은 `runner.ts`의 중복방지 시간(25분 → 10분 단축)으로 이미 처리돼 있다.

상세 → `docs/handover-cafe-pipeline.html` "cron-job.org — 정확한 역할과 오해"

---

## 9. 관련 문서

| 문서 | 내용 |
|---|---|
| `docs/handover-cafe-pipeline.html` | cron-job.org 역할·오해, GHA 지연 대응 |
| `docs/operations/m3-new-brand-readiness.md` | M3 D-day 준비 (§18 runner 매니페스트) |
| `scripts/ops-runner-manifest.ts` | launchd runner 등급 SSoT (GHA는 freshness 검사 대상 아님) |
