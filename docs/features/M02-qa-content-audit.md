# QA 콘텐츠 감사 운영 기획서 (M02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

매일 자동 발행된 매거진 글의 품질 이상(JSON 오염, 이미지 누락, 플레이스홀더)을  
자동 감지하고 가능한 것은 즉시 수정, 불가능한 것은 Slack으로 알림한다.

---

## 배경

- 매거진 AI 자동 생성 → 드물게 JSON 감싸기, 이미지 누락, 플레이스홀더 잔류 발생
- 사용자가 깨진 글을 보기 전에 자동 수정 또는 DRAFT 전환 필요
- 매일 08:20 KST 실행으로 당일 오전 발행 글 검수

---

## 세부 기획

### 감사 대상

- 테이블: `Post`
- 조건: 최근 24시간 내 `MAGAZINE` boardType, `PUBLISHED` 상태
- 조회 한도: 최대 20건

---

### 감사 항목 4가지

| 항목 | 감지 조건 | 자동 수정 |
|------|---------|---------|
| `NO_IMAGE` | thumbnailUrl null 또는 `<img>` 태그 0개 | ✅ `generateMagazineImageByContext()` 호출 후 삽입 |
| `JSON_WRAPPED` | content에 ` ```json ` 또는 ` ```\n{ ` 포함 | ✅ regex 추출 시도 → 실패 시 DRAFT 전환 |
| `PLACEHOLDER` | '이미지를 넣어주세요', '[이미지]', 'IMAGE_PLACEHOLDER' 등 | ❌ needsManual 추가 |
| `RAW_AI_OUTPUT` | 'As an AI', '저는 AI', 'language model' 등 | ❌ needsManual 추가 |

---

### 실행 파이프라인

```
1. 최근 24h MAGAZINE 게시글 조회 (≤20건)
   → 0건이면 info 알림 + 종료

2. 각 게시글 detectIssues() 실행

3. 이슈별 처리:
   - JSON_WRAPPED → regex 추출 시도
     → 성공: fixed[] 추가
     → 실패: DRAFT 전환 + needsManual[] 추가
   - NO_IMAGE → generateMagazineImageByContext()
     → 성공: heroImg + bodyImg HTML 삽입 + fixed[] 추가
     → 실패: needsManual[] 추가
   - PLACEHOLDER/RAW_AI_OUTPUT → needsManual[] 추가

4. Slack 알림:
   - 문제 0건 → info "정상"
   - needsManual 있음 → important "수동 확인 필요" + 목록
   - 전부 자동 수정 → info "자동 수정 완료"

5. BotLog 기록
```

---

### 스케줄 / 실행 환경

| 핸들러 | 워크플로우 | UTC 크론 | KST |
|--------|----------|---------|-----|
| `qa:content-audit` | `agents-daily.yml` | `20 23 * * *` | 매일 08:20 |

**실행 환경**: GHA ubuntu-latest, Node 20

---

### Slack 알림

| 조건 | 채널 | 레벨 |
|------|------|------|
| 문제 없음 | SYSTEM | info |
| needsManual 있음 | SYSTEM | important |
| 자동 수정 완료 | SYSTEM | info |
| 실패 | SYSTEM | important |

---

### BotLog

- `botType: 'QA'`
- `action: 'CONTENT_AUDIT'`
- `status: 'SUCCESS' | 'PARTIAL' | 'FAILED'`

---

### 비용 영향

- `NO_IMAGE` 자동 수정 시 `generateMagazineImageByContext()` 호출 → Claude + 이미지 생성 비용 발생
- 정상 운영 시: $0 (이슈 없으면 API 호출 없음)
- 이슈 발생 시: 건당 소량 (드문 경우)

---

## 관련 링크

- 감사 에이전트: `agents/qa/content-audit.ts`
- GHA 워크플로우: `.github/workflows/agents-daily.yml`
- Runner 핸들러: `agents/cron/runner.ts` — `qa:content-audit`
- DB 모델: `prisma/schema.prisma` — Post, BotLog

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
