# content-curation 후보 모델 재설계 (2026-07-09)

> 상태: **설계 확정용 문서** (코드 미변경). 게시 파이프라인의 "후보화→발행" 구조 고도화.
> 범위: 고품질 원문 공급망과 발행 구조만. **가입 전환 / top promo / related CTR / sign_up 은 이번 범위 제외.**
> 근거: 모든 수치는 BotLog `CONTENT_CURATE` 7d 집계 + `git show origin/main:agents/cafe/content-curator.ts` 코드 라인.

---

## 0. 실행 주체 정정 (혼동 방지)

- **CONTENT_CURATE(발행)는 GHA `agents-cafe-hourly-curation.yml`에서 origin/main 코드로 실행**된다.
  - 근거: `agents/cafe/run-pipeline.ts:12` — "run-pipeline.ts에서 content-curator.ts 호출 제거됨 (2026-05-14)".
  - 따라서 **로컬 launchd / working tree 는 발행에 영향 없다.** 이 문서의 모든 PR은 origin/main 기준이며, merge 시 GHA에 자동 반영된다.
- crawler / psych / trend 는 로컬 launchd(working tree)에서 실행. 발행 후보 데이터는 만들지만 발행 자체는 GHA.

---

## 1. 현재 문제

### 1-A. 후보 모델의 구조적 비대칭
content-curator 의 `candidatePool` 은 두 종류 후보로 구성된다 (`content-curator.ts` `interface CandidateTopic`):

```ts
interface CandidateTopic {
  topic: string
  source: 'killer' | 'trend'
  cafePostId?: string   // ← killer 만 채움. trend 는 비어 있음.
  ...
}
```

- **killer candidate = source-backed**: `cafePostId` 로 실제 CafePost 원문을 가리킴. → `loadEligibleKillerSelfRef` 로 **원문 자체를 refs[0] 로 self-ref 발행** 가능(PR #102). refs 재검색 불필요.
- **trend candidate = topic-only**: `hotTopics` 의 주제 문자열만 있고 `cafePostId` 가 없음. → `getReferencePosts(topic)` 로 "그 주제어에 맞는 usable≥5 참고글"을 **매번 검색**해야 함. 원문이 없으므로 self-ref 불가.

### 1-B. 실측 — trend 가 skip 의 82~86% 주범 (7d)

| skipReason | 합계 | killer | trend | trend 비중 |
|---|---|---|---|---|
| LOW_USABLE_COMMENTS | 1007 | 137 | **870** | **86%** |
| DUPLICATE_TITLE | 830 | 150 | **680** | **82%** |
| (발행 성공) | 240 | **150** | 90 | — |
| KEYWORD_OVERLAP | 14 | 0 | 14 | 100% |

- **후보 효율**: killer 시도 439 → 발행 **150 (34%)** / trend 시도 1652 → 발행 **90 (5%)**.
- trend 는 topic-only 라 refs 검색에 전적으로 의존하는데 그 검색이 86% 실패(LOW_USABLE). killer 는 source-backed 라 self-ref 로 원문을 직접 써서 6.8배 효율적.

### 1-C. 왜 trend 시도가 이렇게 많은가
- `CANDIDATE_POOL_SIZE = 15` (`content-curator.ts:68`), `killerCandidates ... .slice(0, 2)` — **killer 는 2개만** candidate 로 확정.
- `maxTrendCandidates = CANDIDATE_POOL_SIZE - killerCandidates.length` = 15 − 2 = **13** → 나머지 13자리를 **trend 가 채움**.
- 즉 효율 낮은 trend(5%)가 POOL 의 대부분을 차지하고, 효율 높은 killer(34%)는 2개로 제한됨.

**결론: 근본 문제는 "trend candidate 가 원문(cafePostId)을 안 갖고 있어 refs 검색에 의존하고, 그 자리가 과다하다"는 것.**

---

## 2. 1단계 — 단기 완화책 (⚠️ 근본 해결 아님)

> **명시: killer slice 2→4 는 완화책이다.** trend 시도를 줄여 LOW_USABLE/DUP 를 완화하나, trend 가 여전히 topic-only 로 refs 검색에 의존하는 근본 구조는 그대로다. 근본 해결은 3단계.

### 변경
- `killerCandidates ... .slice(0, 2)` → **`.slice(0, 4)`** (1줄).
  - `killerPosts` 는 이미 `take: 30` (넉넉히 조회) — **불변**.
  - `CANDIDATE_POOL_SIZE = 15`, `maxPosts = 3`, `candidateTake 150` — **전부 불변**.
- `maxTrendCandidates` 가 자동으로 15 − 4 = **11** 로 축소되어 trend 시도가 준다.
- **BotLog details 가시성 필드 추가** (details 는 JSON → schema 변경 0):
  - `killerCandidateCount` — slice 후 killer 후보 수
  - `trendCandidateCount` — trend 후보 수
  - `selfRefUsedCount` — `loadEligibleKillerSelfRef` 성공 카운트(루프 카운터 +1)
  - `skipBySource` — `{ killer: {LOW_USABLE:n,...}, trend: {...} }`
  - `publishedBySource` — `{ killer: n, trend: n }`
  - 기존 `topicResults` 배열은 **그대로 유지**(추가만, 파서 호환).

### 예상 효과
- trend candidate 시도 수 감소 → trend LOW_USABLE(870)/DUP(680) 감소.
- killer 발행 비중 증가(효율 34% self-ref).
- published 유지 또는 증가.
- shadow 발행 0 유지(killerPosts 는 PRODUCTION_CAFE_IDS 필터, self-ref production 한정).

### 위험 (실측)
- **wgang stale 과점**: killer 자격 상위20 중 wgang 6/20. slice 4면 wgang 2개 포함 가능. → 1단계에선 감쇠하지 않고 `killerCandidateCount`/`publishedBySource` 로 **관찰**. 심화 시 별도 후속(E: wgang 감쇠).
- **STORY 편중 심화**: 현재 BOT STORY 68%. killer board 라우팅은 desireCategory 기반이라 다양성 유지되면 완화. **관찰**.
- author/persona cap: `AUTHOR_DAILY_POST_CAP` 존재 + maxPosts=3 불변 → 영향 제한적.
- DUP 증가: killer 는 `dupQuarantine.cafeIds` 이미 제외(filter) → 급증 위험 낮음.
- killer 4개 확보: 자격 상위20 충분 → 재고 확보 OK.

---

## 3. 2단계 — 중기 구조: Candidate 타입 source-backed vs topic-only 분리

### 재설계
```ts
// 현재: cafePostId 가 optional 이라 killer/trend 구분이 암묵적
interface CandidateTopic { topic; source: 'killer'|'trend'; cafePostId?; ... }

// 재설계: 원문 유무를 타입으로 명시
type Candidate =
  | { kind: 'source-backed'; cafePostId: string; topic; ... }  // 원문 보유 → self-ref 가능
  | { kind: 'topic-only';    topic; ... }                       // 원문 없음 → refs 검색 필수
```

- **killer = source-backed**(cafePostId 필수) → self-ref primary.
- **현재 trend = topic-only** → refs 검색.
- **refs 검색(`getReferencePosts`)을 topic-only 후보에만 적용.** source-backed 는 self-ref 로 우회하고, self-ref 실패 시에만 refs fallback.

### 효과
- 타입 레벨에서 "원문 있는 후보 vs 없는 후보"가 명시됨 → refs 검색이 필요한 경로가 코드로 분명. 유지보수성↑.
- 불필요한 killer refs 검색 제거.

---

## 4. 3단계 — 근본 해결: trend hotTopics 에 sourcePostId? 부여

### 핵심 아이디어
trend candidate 도 **대표 원문 1개(sourcePostId)를 갖게 만들어 self-ref 가능**하게 한다. 그러면 trend 의 86% refs 검색 실패가 self-ref 로 대체된다.

### 설계 (schema migration 불필요)
1. **trend-analyzer 가 hotTopics 각 topic 에 대표 CafePost `sourcePostId` 를 부여**:
   - killer supplemental hotTopics 는 **이미 `sourcePostId: x.post.id` 보유**(`trend-analyzer.ts:412`) → 그대로 승격.
   - AI 추출 hotTopics 는 topic 키워드로 **대표 원문 1개(그 주제 killerScore 최상위 usable≥5 CafePost)** 를 매칭 → sourcePostId 부여. **매칭 실패 시 topic-only 유지(현행)**.
2. **`CafeTrend.hotTopics` 는 Json**(`prisma/schema.prisma` `hotTopics Json`) → 필드 추가에 **migration 불필요**.
   - `[{topic, count, sentiment, examples, sourcePostId?}]`
3. `loadTodayBrief` 반환 타입(`TrendAnalysis['hotTopics']`)에 `sourcePostId?` 추가(TypeScript interface 만).
4. content-curator 가 trend candidate 의 `cafePostId` 를 `sourcePostId` 로 채움 → **trend 도 source-backed 로 승격 → self-ref**.

### 효과 (근본 해결)
- trend candidate 의 LOW_USABLE 870(refs 검색 실패)이 self-ref 로 대체.
- trend 발행 전환율 5% → 대폭 개선 예상.
- refs 검색이 진짜 fallback 으로 격하됨.

---

## 5. 4단계 — 정리: refs 검색 fallback화 + refs 3→1

- 3단계 후 refs 검색(`getReferencePosts`)은 **sourcePostId 매칭 실패한 소수 topic-only 후보 전용 fallback** 이 됨.
- **refs limit 3 → 1**: `generateCuratedPost` 는 refs[0](mainRef) 1개만 사용하고 AI 호출 0(`content-curator.ts:365-382`, messages.create=0). refs[1]/refs[2] 는 미사용(dead) → limit 1 로 단순화.
  - ⚠️ **`candidateTake 150` 은 유지**(usable≥5 후보 확보용, 축소하면 LOW_USABLE 증가). limit(리턴 수)과 candidateTake(조회 수)는 분리.

---

## 6. 하면 안 되는 변경 (절대)

- ❌ **발행 수 3→4 금지** (`maxPosts=3` 불변 — 전환/노출이 병목이지 발행량 아님, 그리고 이번 범위 밖)
- ❌ **trend 제거 금지** (trend 발행 90 = 전체 240의 37% 기여 — 제거 아닌 3단계로 효율화)
- ❌ **candidateTake 150 축소 금지** (usable 후보 확보 손실 → LOW_USABLE 증가)
- ❌ **usable≥5 / DUPLICATE / shadow 정책 완화 금지** (품질 붕괴, shadow 격리 붕괴)
- ❌ **한 PR 에 1~4단계 몰기 금지** (단계별 분리 PR + 각 검증)
- ❌ **CafeTrend schema migration 금지** (hotTopics 가 Json 이라 불필요)
- ❌ **AI 추출 hotTopics 에 엉뚱한 sourcePostId 강제 매칭 금지** (매칭 실패 시 topic-only 유지가 안전)
- ❌ **killer take 확대를 "근본 해결"로 표기 금지** (1단계 = 완화책)

---

## 7. 각 단계 PASS/FAIL 기준

| 단계 | PASS | FAIL |
|---|---|---|
| **1단계** (killer slice 4 + BotLog) | trend candidate 시도↓ · trend LOW_USABLE(870)/DUP(680) 감소 · killer 발행 비중↑ · published 유지/증가 · shadow 발행 0 · BotLog 로 killer/trend/selfRef 기여 판독 가능 | published 감소 · DUP 총량 증가 · wgang 발행 편중 급증 · killer 4개 미확보 빈발 |
| **2단계** (타입 분리) | source-backed 는 refs 검색 0(self-ref) · topic-only 만 refs 검색 · 발행 결과 불변/개선 · 경로 코드 명확 | source-backed 가 refs 검색을 탐 · 발행 감소 |
| **3단계** (trend source-link) | trend candidate 다수가 sourcePostId 확보 → self-ref 발행 · trend LOW_USABLE 대폭↓ · trend 발행 전환율↑ · refs 검색 호출↓ · shadow 발행 0 | sourcePostId 매칭 오품질(엉뚱한 원문 발행) · DUP 증가 |
| **4단계** (refs fallback + 3→1) | refs 검색이 topic-only fallback 으로만 호출 · LOW_USABLE/published 불변 · refsCount 로깅만 변화 | LOW_USABLE 증가 |

---

## 8. 운영 검증 방법 (read-only)

merge 후 GHA `CONTENT_CURATE` BotLog(7d)에서 아래 필드로 측정:

- `killerCandidateCount` / `trendCandidateCount` — POOL 구성 비율(killer 비중↑ 확인)
- `selfRefUsedCount` — killer(→3단계 후 trend 포함) self-ref 실사용
- `skipBySource` — `{killer:{...}, trend:{...}}` — trend LOW_USABLE/DUP 감소 추적
- `publishedBySource` — `{killer:n, trend:n}` — killer/trend 발행 기여 + wgang 편중 판별

집계 쿼리(예): `botLog.findMany({action:'CONTENT_CURATE', createdAt:{gte:7d}})` → `details` 파싱 → source별 skip/published 합산. (DB read only, write 금지)

---

## 부록. 근거 파일:라인

- 후보 타입: `content-curator.ts` `interface CandidateTopic` (`source`, `cafePostId?`)
- killer slice: `content-curator.ts` `killerCandidates ... .slice(0, 2)` (killerPosts `take: 30`)
- 상수: `CANDIDATE_POOL_SIZE = 15` (:68), `maxPosts = 3` (:558), `MAX_PER_DESIRE` (:633)
- generateCuratedPost refs[0]만·AI 0: `content-curator.ts:365-382` (messages.create=0)
- self-ref: `loadEligibleKillerSelfRef` (production 한정, shadow 제외) — PR #102
- trend supplemental sourcePostId: `trend-analyzer.ts:412` (`sourcePostId: x.post.id`)
- CafeTrend.hotTopics Json: `prisma/schema.prisma` `hotTopics Json`
- loadTodayBrief fallback(yesterday/recent trend): `daily-brief.ts:604-650`
- 실측 근거: BotLog CONTENT_CURATE 7d — skipReason×source 교차, killer/trend 효율

*작성: 2026-07-09 / read-only 설계 문서 (코드 미변경)*
