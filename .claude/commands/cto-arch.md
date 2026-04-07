# /cto-arch — CTO 아키텍처 거버넌스 리뷰

CTO 관점에서 코드/에이전트/인프라 변경의 아키텍처 영향을 분석하는 스킬.
`/plan-eng-review`가 "코딩 전 설계 확정"이라면, `/cto-arch`는 "기술 헌법 준수 여부 + 시스템 전체 영향 분석".

## 트리거 조건
- "아키텍처 결정", "이 구조 맞나", "레거시 영향", "설계 결정"
- 에이전트 구조 변경, constitution.yaml 관련 결정
- "CTO 관점에서 봐줘", "하네스 구조에 영향 있나"

---

## STEP 0: 하네스 규칙 체크 (필수)

아래 4가지를 grep/read로 직접 확인:

1. **runner.ts 등록**: 새 에이전트/태스크가 `agents/cron/runner.ts` HANDLERS에 있는가?
   ```bash
   grep "에이전트명" agents/cron/runner.ts
   ```

2. **크론 연결**: runner.ts 핸들러가 `.github/workflows/agents-daily.yml` case문에 있는가?
   ```bash
   npx tsx scripts/check-cron-links.ts
   ```

3. **canWrite 규칙**: `constitution.yaml`에서 DB write 권한 있는 에이전트인가?
   - COO와 QA만 `canWrite: true` (명시적 예외 허용 에이전트)
   - 다른 에이전트가 prisma.X.create/update/delete 호출 시 → **P0 위반**

4. **MONITORING_TASKS**: 모니터링 필수 태스크면 runner.ts의 MONITORING_TASKS Set에 추가됐는가?

---

## STEP 1: 아키텍처 영향 분석

### 1-1. 레거시 영향
- 변경 대상 코드를 import하거나 의존하는 파일 탐색:
  ```bash
  grep -r "변경파일명" agents/ src/ --include="*.ts" -l
  ```
- 변경으로 인해 타입 시그니처가 바뀌면 → 모든 호출부 확인

### 1-2. 에이전트 간 의존성
- BotLog 공유: 변경 에이전트의 BotLog를 다른 에이전트가 읽는가?
  (CEO weekly-report, CDO kpi-collector 등)
- DailyBrief 파이프라인 영향: 크롤링→분석→브리프 흐름 변경 없는가?
- AdminQueue: 새 승인 유형이 필요한가?

### 1-3. 비용 영향
- 유료 API 호출 에이전트라면:
  - DALL-E: $0.04/장
  - Claude Sonnet: ~$0.003/1K tokens
  - Perplexity: 요금 확인
- 월 추가 비용 명시 (제한: $50/월 상한)

---

## STEP 2: 기술 부채 감지

### 하드코딩 체크
- 직접 URL 하드코딩 없는가? (환경변수 사용 여부)
- magic number 없는가? (named constant 사용)
- raw SQL 없는가? (Prisma ORM 우선, 불가피한 경우만 $queryRaw)

### TypeScript 규칙
- `any` 타입 사용 없는가?
- Prisma 타입이 올바르게 사용됐는가?

### 에이전트 생명주기
```
□ runner.ts HANDLERS 등록
□ workflow case문 매칭
□ BotLog 기록 (action 이름 명시)
□ MONITORING_TASKS 여부 결정
□ 비용 영향 명시 (유료 API 시)
□ DISPATCH ONLY / LOCAL ONLY 주석 (크론 미연결 시)
```

---

## STEP 3: 승인 필요 여부 결정

| 수준 | 상황 | 처리 |
|------|------|------|
| **P0** | canWrite 규칙 위반 / constitution 위반 / 비용 상한 초과 | 즉시 중단, 창업자 보고 |
| **P1** | 새 에이전트 추가 / DB 스키마 변경 / 새 외부 API 연동 | AdminQueue 등록 후 승인 대기 |
| **P2** | 기존 에이전트 수정 / 성능 개선 / 리팩토링 | 주간 arch-review 리포트에 포함 |
| **자율** | 버그 수정 / 모니터링 태스크 수정 / 문서 업데이트 | 즉시 실행 가능 |

---

## 출력 형식

```
## CTO 아키텍처 리뷰

**하네스 규칙 체크:**
- runner.ts 등록: ✅/❌
- 크론 연결: ✅/❌ (orphaned 있으면 목록)
- canWrite 규칙: ✅/❌
- MONITORING_TASKS: ✅/해당없음

**아키텍처 영향:**
- 레거시 영향: [없음/영향받는 파일 목록]
- 에이전트 의존성: [없음/관련 에이전트]
- 비용 영향: [없음/$X/월 추가]

**기술 부채:**
- 하드코딩: ✅ 없음 / ❌ [위치]
- any 타입: ✅ 없음 / ❌ [위치]

**결정:**
- 승인 필요 여부: P0/P1/P2/자율
- 추천 행동: [구체적 다음 단계]
```
