# SEO description 적용·롤백 도구

> **이 배치에서 production DB write · merge · 배포는 0건이다.** 도구만 만들었다.
> 실제 적용은 **창업자 승인 후** 운영자가 손으로 실행한다.
>
> 기준 main `d88392d9` · 대상: [정정안 문서](./2026-09-11-seo-brand-copy-rewrite.md) §7 ·
> 입력 CSV: [`data/2026-09-11-seo-brand-copy-rewrite.csv`](./data/2026-09-11-seo-brand-copy-rewrite.csv)

---

## 1. 무엇을 바꾸는가

| | |
|---|---|
| 대상 | `applyEligible = true` 인 **50행** (전부 JOB) |
| 바꾸는 필드 | **`Post.seoDescription` 하나뿐** |
| 🔒 건드리지 않는 것 | `seoTitle` · `title` · `content` · `JobDetail`(회사·지역·급여) · 그 밖의 모든 필드 |
| 🔒 대상이 아닌 것 | `applyEligible = false` **9행**(HOLD 계열 5 · 공식 제도명 전용 3 · 원문 제목 전용 1) |

`seoTitle` 은 `data` 에 넣지 않는다. 다만 **`where` 조건에는 넣는다** — 낙관적 잠금용이다(§4).

---

## 2. 파일

| 파일 | 역할 |
|---|---|
| `src/lib/seo/desc-apply-plan.ts` | CSV 파싱·계획 검증·drift 판정 (**순수**, I/O 없음) |
| `src/lib/seo/desc-apply-exec.ts` | 트랜잭션 실행 (**DB 클라이언트 주입**) |
| `src/lib/seo/desc-verify.ts` | meta description 파싱·금지 표현 판정 (**순수**) |
| `scripts/seo-desc-apply.ts` | 적용·롤백 CLI |
| `scripts/seo-desc-verify-production.ts` | production 전수 검증 CLI (읽기 전용) |
| `src/__tests__/seo-desc-apply.test.ts` | 실패 주입 테스트 |
| `src/__tests__/seo-desc-apply-csv-contract.test.ts` | 확정 CSV 계약 테스트 |
| `src/__tests__/seo-desc-apply-review.test.ts` | 1차 리뷰 findings 회귀 테스트 |
| `src/__tests__/seo-desc-verify-outcome.test.ts` | 검증 판정 회귀 테스트(실제 CSV 기반) |
| `src/__tests__/helpers/seo-desc-fixture.ts` | 테스트 fixture (해시 열 자동 계산) |

판정과 실행을 갈라 둔 이유는 테스트다. "부분 반영", "영향 행 0", "트랜잭션 도중 예외" 는
실제 DB 로 재현하기 어렵고, 재현하려고 production 에 쓰면 그 자체가 사고다.

---

## 3. 사용법

```bash
# 1) 미리보기 — 기본 동작, write 0
npx tsx scripts/seo-desc-apply.ts
npx tsx scripts/seo-desc-apply.ts --read=rest      # Postgres 직결이 막힌 환경(§7)

# 2) 적용 — --execute 와 확인 토큰이 둘 다 있어야 한다
npx tsx scripts/seo-desc-apply.ts --execute --confirm=APPLY-SEO-DESC-50

# 3) 롤백 — 적용 전 값으로 정확히 되돌린다
npx tsx scripts/seo-desc-apply.ts --rollback --execute --confirm=ROLLBACK-SEO-DESC-50

# 4) production 전수 검증 (읽기 전용)
npx tsx scripts/seo-desc-verify-production.ts              # 적용 후 기대
npx tsx scripts/seo-desc-verify-production.ts --expect=before   # 적용 전 / 롤백 후 기대
```

`--confirm` 만 주면 쓰지 않는다. `--execute` 만 주어도 쓰지 않는다. **둘 다** 필요하다.
apply 토큰으로 rollback 을 실행할 수 없고, 그 반대도 안 된다.

---

## 4. 안전장치

### 4-A. 실행 순서 (fail-closed)

```
[0] 이중 게이트      --execute + --confirm=<모드별 토큰>. 하나라도 없으면 ABORT
[1] CSV 무결성       파일 전체 SHA-256 이 확정값과 다르면 즉시 ABORT (출력만 하지 않는다)
    CSV 검증         59행 · 분류 합계 5종 · applyEligible=true 50 · 고유 id 50 ·
                     보류 9행 제외 · JOB 전용 · seoTitle 제안값 0 · no-op 0 ·
                     **행별 current 해시 재계산**
[2] 사전 조회        write 전에 50건을 **전부 다시 읽는다**
                     (id · boardType · status · seoTitle · seoDescription)
[3] 대조             누락 0 · 중복 0 · 대상 밖 id 0 · 전건 JOB/PUBLISHED ·
                     seoTitle/seoDescription **null-safe exact match**
                     → 하나라도 어긋나면 mutation 0 으로 전체 ABORT
[4] dry-run 이면 종료
[5] 단일 트랜잭션    maxWait 10s · timeout 60s 명시
                     updateMany × 50, 각 영향 행이 정확히 1
                     → 아니면 즉시 throw → rollback
[6] 사후 검증        50건 재조회: seoDescription 목표값 일치 + seoTitle 무변경
[7] 캐시 안내        §5 — 반영 시각을 약속하지 않는다
```

### 4-B. ABORT 조건 (전부 mutation 0)

| 코드 | 조건 |
|---|---|
| `CONFIRM_TOKEN` | `--execute` 인데 토큰이 없거나 틀리다 |
| `READ_VIA` | `--execute` 를 `--read=rest` 와 같이 썼다 |
| `CSV_SHA256` | **CSV 파일이 확정본이 아니다** — 한 글자만 달라도 걸린다 |
| `HASH_MISMATCH` | 행별 `current*Sha256_12` 열이 실제 값과 맞지 않는다 |
| `ROW_COUNT` · `DECISION_COUNT` · `DECISION_UNKNOWN` | CSV 가 확정본과 다르다 |
| `ELIGIBLE_COUNT` · `ELIGIBLE_MISMATCH` | 적용 대상이 50이 아니거나 보류 행이 섞였다 |
| `DUPLICATE_ID` · `EMPTY_ID` · `BOARD_TYPE` | 대상 목록이 오염됐다 |
| `TITLE_PROPOSAL` | `seoTitle` 제안값이 생겼다 — title 은 write 대상이 아니다 |
| `NO_OP` · `EMPTY_PROPOSAL` | 바꿀 것이 없거나 제안 문구가 비었다 |
| `LIVE_COUNT` · `MISSING` · `LIVE_DUPLICATE` · `LIVE_EXTRA` | 조회 누락·중복·대상 밖 |
| `DRIFT_TITLE` · `DRIFT_DESCRIPTION` | production 값이 CSV current 와 다르다 |
| `DRIFT_BOARD_TYPE` · `DRIFT_STATUS` | JOB 이 아니거나 PUBLISHED 가 아니다 — 숨겨진 글에 쓰지 않는다 |
| `ALREADY_APPLIED` | 이미 목표값이다(재실행) — 멱등 덮어쓰기를 허용하지 않는다 |
| `AFFECTED_NOT_ONE` · `AFFECTED_TOTAL` · `TARGET_COUNT` | 영향 행이 기대와 다르다 → **rollback** |

### 4-C. 왜 낙관적 잠금을 또 거는가

사전 조회와 write 사이에도 값이 바뀔 수 있다. 그래서 `where` 에 기대값을 함께 건다.

```ts
tx.post.updateMany({
  where: {
    id,
    boardType: 'JOB',        // 게시판이 바뀐 글에는 쓰지 않는다
    status: 'PUBLISHED',     // 숨겨졌거나 삭제된 글에는 쓰지 않는다
    seoTitle: <기대값>,
    seoDescription: <기대값>,
  },
  data: { seoDescription: <목표값> },        // ← data 에는 이 필드뿐
})
```

그 사이 누가 고쳤다면 이 조건에 걸리는 행이 없어 `count = 0` 이 되고, 즉시 throw 되어
**트랜잭션 전체가 rollback** 된다. 50건 중 49건만 반영되는 상태는 만들어지지 않는다.

`seoTitle` 이 `where` 에 있는 이유도 같다 — 바꾸지는 않지만, 그 사이 제목이 바뀌었다면
이 정정안이 전제한 글이 아닐 수 있다. `boardType`·`status` 는 **공개 면 전제**다.
숨겨진 글의 SEO 문구를 고치는 것은 이 정정안의 범위가 아니다.

### 4-F. 트랜잭션 옵션 — 기본 5초에 기대지 않는다

```ts
{ maxWait: 10_000, timeout: 60_000 }   // Prisma 기본값: maxWait 2s · timeout 5s
```

| 값 | 근거 |
|---|---|
| `timeout` **60s** | `updateMany` 를 **50회 순차** 실행한다. 왕복 지연이 50ms 만 되어도 2.5s 지만, Supabase 풀러를 거치고 지연이 튀면 기본 5s 를 넘긴다. 중단 자체는 rollback 이라 안전하지만, 운영자는 "왜 실패했는지" 모른 채 재시도하게 된다. 60s 는 건당 1.2s 까지 견디는 값이다 |
| `maxWait` **10s** | 트랜잭션 **시작**을 기다리는 시간이다. 기본 2s 는 풀이 잠깐 붐빌 때 시작도 못 하고 죽는다. 이 작업은 승인 후 1회 수동 실행이라 몇 초 더 기다리는 편이 낫다 |

두 값은 `TRANSACTION_OPTIONS` 상수 하나에 있고, `$transaction` 에 실제로 전달되는지
테스트가 확인한다. 늘리더라도 **무제한으로 두지 않는다** — 멈춘 트랜잭션이 락을 오래 쥐면
서비스 쪽 쓰기가 막힌다.

### 4-D. raw SQL 을 쓰지 않는다

프로젝트 규칙(CLAUDE.md)이다. Prisma `updateMany` + `$transaction` 만 쓴다.

### 4-E. 로그

본문·SEO 문구·개인정보를 출력하지 않는다. **건수와 해시 지문만** 남긴다.
**post id 도 그대로 찍지 않는다** — `post#<sha256 앞 10자>` 로만 나온다. 로그가 공유될 때
어떤 글인지 바로 드러나지 않게 하기 위해서다. 대조가 필요하면 같은 방식으로 다시 계산하면 된다.
**오류 경로도 마찬가지다** — `buildPlan`·`detectDrift` 가 내는 모든 issue detail 에 원본 id 가
들어가지 않는다. 실패 로그가 가장 널리 공유되기 때문에 거기서 새면 의미가 없다.
CSV 파일 자체의 해시도 찍어 어떤 입력으로 돌렸는지 나중에 대조할 수 있다.

### 4-G. import 만으로는 아무 일도 일어나지 않는다 (direct-run 계약)

두 CLI 모두 `isDirectRun()` 이 참일 때만 `main()` 을 부른다. 판정은 `process.argv[1]` 로만 한다.

이건 실제로 한 번 어겼던 계약이다 — 검증 스크립트를 테스트에서 import 했다가
**production 에 GET 50건이 나갔다**(읽기·`x-bot-type` 있어 피해는 없었다).
그래서 순수 함수는 전부 `src/lib/seo/` 로 옮겼고, import 부작용이 0인지 테스트가 확인한다.

---

## 5. 캐시 — DB 만 바꾸면 끝나지 않는다

### 5-A. 두 겹이지만, 공개 면을 막는 것은 **라우트 ISR** 이다

| 겹 | 위치 | TTL | 무효화 키 |
|---|---|---|---|
| 데이터 캐시 | `getJobDetailPublic` 의 `unstable_cache` | 300s | `job-detail` · `job-detail-{postId}` |
| **라우트 ISR** | `src/app/(main)/jobs/[id]/page.tsx` `export const revalidate = 300` | 300s | 경로 `/jobs/{id}` |

`generateMetadata` 가 `getJobDetailPublic()` 을 호출하므로 두 겹을 모두 지나야 하지만,
**방문자에게 보이는 것은 ISR 이 만들어 둔 HTML** 이다. 데이터 캐시만 지워도 공개 면은 그대로다.

> `sitemap` 캐시(`sitemap-posts`, 3600s)는 건드릴 필요가 없다.
> `seoDescription` 은 sitemap 의 URL·lastmod 에 영향을 주지 않는다.

### 5-B. "최대 5분이면 반영된다"고 단정할 수 없다

ISR 은 만료되면 **그 다음 요청에 stale 을 돌려주고 뒤에서 다시 만든다**(stale-while-revalidate).
즉 TTL 이 지난 뒤 **한 번 더 요청해야** 새 값이 나온다. 앞단 CDN 이 더 붙으면 더 걸릴 수도 있다.

그래서 이 문서는 반영 시각을 약속하지 않는다. 대신 **확인한다**(§6).

### 5-C. CLI 는 캐시를 무효화하지 못한다 — 구조적 제약

`revalidateTag` · `updateTag` · `revalidatePath` 는 **Next 런타임 안에서만** 동작한다.
이 CLI 는 독립 Node 프로세스라 호출할 수 없다. 우회하려고 공개 무인증 revalidate API 를
만드는 것은 **하지 않는다** — 누구나 캐시를 털 수 있는 입구가 되기 때문이다.

### 5-D. 쓸 수 있는 선택지

| 방법 | 공개 면(HTML)에 효과 | 비고 |
|---|---|---|
| **① 기다렸다 확인한다** (권장) | ○ | ISR 이 스스로 재생성한다. §6 이 제한시간 동안 반복 확인한다 |
| ② 어드민 글 수정 화면에서 저장 | ○ | `adminUpdatePostContent` → `revalidateJobPost` + `revalidateServicePaths` 가 **경로까지** 무효화한다. 50건을 손으로 하기엔 비현실적이지만, 급한 몇 건에는 쓸 수 있다 |

> 🔴 **`POST /api/admin/revalidate-deleted` 는 선택지가 아니다.**
> 이 엔드포인트는 `revalidatePath` 를 **DELETED/HIDDEN 글에만** 호출한다.
> 전역 태그(`job-detail` 등)는 지우므로 데이터 캐시는 비워지지만,
> 우리 50건은 PUBLISHED 라 **`/jobs/{id}` 경로 캐시가 그대로 남는다.**
> 호출해도 공개 면의 meta description 은 바뀌지 않는다 — 헛된 안심만 준다.

---

## 6. production 전수 검증 (필수)

DB 가 바뀐 것과 공개 면이 바뀐 것은 다르다. **실제 HTML 을 받아** 확인한다.

```bash
npx tsx scripts/seo-desc-verify-production.ts
npx tsx scripts/seo-desc-verify-production.ts --deadline=1800 --interval=60
npx tsx scripts/seo-desc-verify-production.ts --expect=before    # 롤백 후
```

- `/jobs/{id}` **50개**를 GET 해 `<meta name="description">` 을 파싱한다
- **제한시간 동안 반복 확인한다**(기본 15분 · 30초 간격). 아직 옛 문구인 대상만 다시 친다 —
  ISR 은 한 번 더 요청해야 새 값을 내주기 때문이다
- 자사 요청이므로 `x-bot-type: ops-verify` 를 붙인다. **없으면 GA4·EventLog 가 오염된다**
- 승인된 공식 직함(`노인돌봄`·`노인주간보호센터`·`노인요양원`)은 금지 표현으로 세지 않는다
- 출력은 건수와 해시 지문뿐. **post id 도 문구도 그대로 찍지 않는다**
- **내용 검사는 기대값과 정확히 일치할 때만** 한다 — §6-A

### 6-A. 판정 — **기대값과 일치할 때만 내용을 본다**

> 🔴 이 규칙이 이 도구에서 가장 중요하다.
> 확정 CSV 실측: 적용 대상 50건 중 **`currentSeoDescription` 에 미승인 금지 표현이 있는 행이 48**,
> **`proposedSeoDescription` 에 있는 행은 0** 이다.
> 적용 직후 캐시가 안 내려간 상태에서 HTML 을 읽으면 48건에서 금지어가 그대로 나온다.
> 그것은 **정상적인 중간 상태**다. 여기서 위반으로 판정하면 **멀쩡한 정정을 롤백하게 된다.**

URL 마다 먼저 상태를 정한다.

| 상태 | 조건 | 내용 검사 | terminal |
|---|---|---|---|
| `MATCHED` | HTML 이 **이 모드의 기대값과 정확히 같다** | 한다(`after` 만) | ○ |
| `PENDING` | HTML 이 반대쪽 값이다 — 캐시가 안 내려갔다 | **안 한다** | |
| `UNEXPECTED` | current 도 proposed 도 아니다 — 누가 다른 값을 썼다 | **안 한다** | |
| `FETCH_FAILED` | 요청 실패 | 안 한다 | |
| `VIOLATION` | 기대값과 일치**하는데** 그 안에 미승인 금지 표현이 있다 | — | ○ |

모드별로 기대값이 다르다.

| 모드 | 기대값 | 일치하면 |
|---|---|---|
| `--expect=after` | `proposedSeoDescription` | 반영 완료 → **이때만** 금지 표현을 검사한다 |
| `--expect=before` | `currentSeoDescription` | **롤백 완료 → OK.** 옛 문구의 금지 표현은 되돌리기로 한 그 상태다. 다시 위반으로 세지 않는다 |

전체 판정은 상태 집계로 낸다. 우선순위는 **위반 > 요청 실패 > 미반영 > OK**.

| 판정 | 뜻 | 롤백? | 종료 코드 |
|---|---|---|---|
| `OK` | 전건 `MATCHED` | — | 0 |
| `CACHE_PENDING` | `PENDING`·`UNEXPECTED` 가 남았다. **DB 는 이미 맞다**(적용 CLI [6]단계가 확인) | **아니다** | 3 |
| `FETCH_FAILED` | 요청 자체가 실패했다 | 아니다 | 3 |
| `CONTENT_VIOLATION` | 기대값과 일치하는데 금지 표현이 있다 — **제안 문구 자체의 문제** | 검토한다 | 2 |

`CONTENT_VIOLATION` 은 확정 CSV 가 오염됐을 때만 난다(정상 CSV 의 proposed 는 0/50).
방어적으로 남겨 둔 경로이며, 나면 롤백이 아니라 **CSV 를 다시 검토**하는 것이 먼저다.

### 6-B. 라운드를 넘겨도 위반이 사라지지 않는다

`MATCHED` 와 `VIOLATION` 은 **terminal** 이다. 한 번 그렇게 판정된 URL 은
다시 조회하지 않고, 뒤 라운드가 덮어쓰지도 못한다.

라운드마다 카운터를 초기화하면 앞 라운드에서 발견한 진짜 위반이 조용히 사라진다.
그래서 상태를 URL 단위로 유지한다(`createTracker`).

### 6-C. 롤백 검증

```bash
npx tsx scripts/seo-desc-verify-production.ts --expect=before
```

옛 문구로 **정확히 복원**됐는지 본다. 48건에 금지 표현이 있는 것이 **정상이고 기대되는 결과**다 —
그 상태로 되돌리는 것이 롤백이기 때문이다. 이 모드에서는 금지 표현을 검사하지 않는다.

---

---

## 7. 로컬 실행 제약 — 읽기 경로

이 저장소의 개발 환경에서는 Supabase Postgres 직결(`db.*.supabase.co`)이
**ECONNREFUSED** 로 막힌다. 그래서 dry-run 에 한해 Supabase REST(443, GET) 읽기를 둔다.

```bash
npx tsx scripts/seo-desc-apply.ts --read=rest
```

🔒 **write 는 절대 REST 로 하지 않는다.** `--execute` 를 `--read=rest` 와 같이 쓰면 ABORT 한다.
낙관적 잠금과 트랜잭션은 같은 연결 위에 있어야 의미가 있기 때문이다.
**실제 적용은 Postgres 직결이 되는 환경에서 해야 한다.**

---

## 8. 정책 준수

| 항목 | 준수 방법 |
|---|---|
| **DB write 는 COO 에이전트만** (CLAUDE.md) | §8-A |
| **Raw SQL 금지** | Prisma `updateMany` + `$transaction` 만 사용 |
| **SEO 노출면 보호** (네이버) | `seoDescription` 만 바꾼다. `sitemap`·`robots`·`canonical`·일반 `<meta name="robots">` 를 건드리지 않는다. `seoTitle` 도 바꾸지 않는다 |
| **자사 요청 `x-bot-type`** | 검증 스크립트가 항상 붙인다 |
| **개인정보·본문 로그 금지** | 건수와 해시 지문만 출력 |
| **공개 무인증 revalidate API 금지** | 만들지 않았다. 기존 인증 경로(`/api/admin/revalidate-deleted`)만 안내 |
| 변경 금지 파일 | `prisma/schema.prisma` · migration · `.env*` · `.github/workflows/**` · launchd · `src/lib/actions/admin-auth.ts` · `src/app/api/health/auth/route.ts` — **전부 미변경** |

### 8-A. COO-only write 정책 — 실행 주체와 증거

`agents/core/constitution.yaml` 은 DB write 를 COO 에이전트로 한정한다. 이 도구는
그 규칙을 **우회하지 않는다.** 대신 성격이 다르다 — **에이전트 자동화가 아니라
1회성 운영 작업**이다.

| | |
|---|---|
| **실행 주체** | 창업자 승인을 받은 **운영자(사람)**. 터미널에서 손으로 실행한다 |
| **에이전트 경로** | **연결하지 않았다.** `runner.ts` HANDLERS · `.github/workflows/**` · launchd 어디에도 등록되어 있지 않다. `automation_status`(현재 `PAUSED`)를 읽지도 바꾸지도 않는다 |
| **자동 실행 가능성** | 없다. 실행하려면 사람이 `--execute` 와 확인 토큰을 직접 입력해야 한다 |
| **범위** | `Post.seoDescription` 50행. COO 에이전트가 하는 콘텐츠 생성·상태 변경과 겹치지 않는다 |

**실행 증거는 이렇게 남긴다.** 감사 추적이 없으면 "누가 언제 무엇을 바꿨나"를
나중에 확인할 수 없다.

1. CLI 출력 전체를 파일로 저장한다 (개인정보·문구가 없으므로 그대로 보관 가능)
   ```bash
   npx tsx scripts/seo-desc-apply.ts --execute --confirm=APPLY-SEO-DESC-50 \
     2>&1 | tee docs/operations/logs/2026-09-11-seo-desc-apply.log
   ```
2. 로그에 남는 것: CSV SHA-256 · 대상/제외 건수 · 조회 건수 · drift 판정 ·
   영향 행 수 · 트랜잭션 옵션 · 사후 검증 결과 · `post#<지문>` 별 before→after 지문
3. `docs/operations/MASTER-OPERATING-SYSTEM.md` 에 **실행 일시 · 실행자 · merge commit ·
   영향 행 수 · 검증 결과**를 한 줄 기록한다
4. `pending_founder_actions.md` 의 해당 항목을 완료로 갱신한다

로그·기록 없이 실행하지 않는다. 롤백 판단의 근거가 그 로그다.

---

## 9. 실행 전 확인 (창업자 승인 후)

```
[ ] origin/main 최신에서 실행하는가
[ ] CSV 무결성 통과 (dry-run [1] 에 "확정본 일치" 가 찍히는가)
[ ] dry-run: 대상 50 · drift 0 · 전건 JOB/PUBLISHED · mutation 0
[ ] Postgres 직결이 되는 환경인가 (--read=rest 없이 dry-run 이 통과하는가)
[ ] 출력을 로그 파일로 남기는가 (§8-A)
[ ] 적용:  --execute --confirm=APPLY-SEO-DESC-50
[ ] 사후 검증 [6] 에서 seoDescription 50/50 · seoTitle 무변경 50/50
[ ] production 전수 검증 (§6) — 판정이 OK 가 될 때까지 반복 확인
      · CACHE_PENDING 이면 **롤백하지 말고** 제한시간을 늘려 재확인
        (옛 문구의 금지 표현은 정상이다 — 위반으로 세지 않는다)
      · CONTENT_VIOLATION 이면 롤백이 아니라 **CSV 를 먼저 다시 검토**
[ ] 롤백했다면 --expect=before 로 옛 문구 정확 복원 확인 (48건 금지 표현은 정상)
[ ] 실행 기록을 MASTER 정본에 남겼는가
```

---

## 10. 남은 위험

| 위험 | 영향 | 완화 |
|---|---|---|
| 캐시 반영 시각을 **약속할 수 없다** | 낮음 — 옛 문구도 정상 문장이다 | ISR stale-while-revalidate 특성상 구조적으로 제거 불가. §6 이 제한시간 동안 반복 확인한다 |
| commit 후 사후 검증이 실패하면 **write 는 이미 됐다** | 중간 | CLI 가 exit 2 로 멈추고 롤백 명령을 출력한다. 롤백 기준값은 CSV 에 있다 |
| CSV 가 유일한 롤백 기준값이다 | 중간 | CSV 는 `origin/main` 에 있고 해시로 대조한다. **CSV 없이 롤백할 수 없다** |
| `--read=rest` 로 확인한 drift 는 **REST 시점** 값이다 | 낮음 | `--execute` 는 Prisma 로 다시 읽고 낙관적 잠금까지 건다 |
| 적용과 검증 사이에 다른 세션이 같은 글을 고칠 수 있다 | 낮음 | 낙관적 잠금이 write 시점은 막는다. 그 이후 변경은 `--expect=after` 검증에서 불일치로 드러난다 |
| 보류 5건의 금지 표현은 **그대로 남는다** | 의도됨 | 정정안 문서 §4. 창업자 판단 대기 |
| 이 도구는 **`/jobs` 만** 다룬다 | 해당 없음 | 적용 대상 50건이 전부 JOB 이다. MAGAZINE 4건은 전부 보류·보존 |
