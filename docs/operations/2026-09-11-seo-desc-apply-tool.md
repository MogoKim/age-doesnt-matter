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
[1] CSV 검증         59행 · 분류 합계 5종 · applyEligible=true 50 · 고유 id 50 ·
                     보류 9행 제외 · JOB 전용 · seoTitle 제안값 0 · no-op 0
[2] 사전 조회        write 전에 50건을 **전부 다시 읽는다**
[3] 대조             누락 0 · 중복 0 · 대상 밖 id 0 ·
                     seoTitle/seoDescription **null-safe exact match**
                     → 하나라도 어긋나면 mutation 0 으로 전체 ABORT
[4] dry-run 이면 종료
[5] 단일 트랜잭션    updateMany × 50, 각 영향 행이 정확히 1
                     → 아니면 즉시 throw → rollback
[6] 사후 검증        50건 재조회: seoDescription 목표값 일치 + seoTitle 무변경
[7] 캐시 안내        §5
```

### 4-B. ABORT 조건 (전부 mutation 0)

| 코드 | 조건 |
|---|---|
| `CONFIRM_TOKEN` | `--execute` 인데 토큰이 없거나 틀리다 |
| `READ_VIA` | `--execute` 를 `--read=rest` 와 같이 썼다 |
| `ROW_COUNT` · `DECISION_COUNT` · `DECISION_UNKNOWN` | CSV 가 확정본과 다르다 |
| `ELIGIBLE_COUNT` · `ELIGIBLE_MISMATCH` | 적용 대상이 50이 아니거나 보류 행이 섞였다 |
| `DUPLICATE_ID` · `EMPTY_ID` · `BOARD_TYPE` | 대상 목록이 오염됐다 |
| `TITLE_PROPOSAL` | `seoTitle` 제안값이 생겼다 — title 은 write 대상이 아니다 |
| `NO_OP` · `EMPTY_PROPOSAL` | 바꿀 것이 없거나 제안 문구가 비었다 |
| `LIVE_COUNT` · `MISSING` · `LIVE_DUPLICATE` · `LIVE_EXTRA` | 조회 누락·중복·대상 밖 |
| `DRIFT_TITLE` · `DRIFT_DESCRIPTION` | production 값이 CSV current 와 다르다 |
| `ALREADY_APPLIED` | 이미 목표값이다(재실행) — 멱등 덮어쓰기를 허용하지 않는다 |
| `AFFECTED_NOT_ONE` · `AFFECTED_TOTAL` · `TARGET_COUNT` | 영향 행이 기대와 다르다 → **rollback** |

### 4-C. 왜 낙관적 잠금을 또 거는가

사전 조회와 write 사이에도 값이 바뀔 수 있다. 그래서 `where` 에 기대값을 함께 건다.

```ts
tx.post.updateMany({
  where: { id, seoTitle: <기대값>, seoDescription: <기대값> },
  data:  { seoDescription: <목표값> },        // ← data 에는 이 필드뿐
})
```

그 사이 누가 고쳤다면 이 조건에 걸리는 행이 없어 `count = 0` 이 되고, 즉시 throw 되어
**트랜잭션 전체가 rollback** 된다. 50건 중 49건만 반영되는 상태는 만들어지지 않는다.

`seoTitle` 이 `where` 에 있는 이유도 같다 — 바꾸지는 않지만, 그 사이 제목이 바뀌었다면
이 정정안이 전제한 글이 아닐 수 있다.

### 4-D. raw SQL 을 쓰지 않는다

프로젝트 규칙(CLAUDE.md)이다. Prisma `updateMany` + `$transaction` 만 쓴다.

### 4-E. 로그

본문·SEO 문구·개인정보를 출력하지 않는다. **건수와 SHA-256 앞 8자 지문만** 남긴다.
CSV 파일 자체의 해시도 찍어 어떤 입력으로 돌렸는지 나중에 대조할 수 있게 한다.

---

## 5. 캐시 — DB 만 바꾸면 끝나지 않는다

### 5-A. `/jobs/[id]` 의 캐시는 두 겹이다

| 겹 | 위치 | TTL | 무효화 키 |
|---|---|---|---|
| 데이터 캐시 | `getJobDetailPublic` 의 `unstable_cache` | **300s** | `job-detail` · `job-detail-{postId}` |
| 라우트 ISR | `src/app/(main)/jobs/[id]/page.tsx` `export const revalidate` | **300s** | 경로 `/jobs/{id}` |

`generateMetadata` 가 `getJobDetailPublic()` 을 호출하므로 **두 겹 모두** 지나야 새 문구가 보인다.

> `sitemap` 캐시(`sitemap-posts`, 3600s)는 **건드릴 필요가 없다.**
> `seoDescription` 은 sitemap 의 URL·lastmod 에 영향을 주지 않는다.

### 5-B. CLI 는 캐시를 무효화하지 못한다 — 구조적 제약

`revalidateTag` · `updateTag` · `revalidatePath` 는 **Next 런타임 안에서만** 동작한다.
이 CLI 는 독립 Node 프로세스라 호출할 수 없다. 우회하려고 공개 무인증 revalidate API 를
만드는 것은 **하지 않는다** — 누구나 캐시를 털 수 있는 입구가 되기 때문이다.

### 5-C. 그래서 무엇을 하는가 — 기존 경로만 쓴다

| 방법 | 무엇이 지워지나 | 비고 |
|---|---|---|
| **① 그냥 기다린다** (권장) | 두 겹 모두 | 둘 다 TTL 300s → **최대 5분 뒤 자동 반영** |
| ② `POST /api/admin/revalidate-deleted` | 데이터 캐시(`job-detail` 등 전역 태그) | **기존 인증 경로**. `getAdminSession()` 필수. 어드민 로그인 상태에서 호출 |
| ③ 어드민 글 수정 화면 저장 | 해당 글의 두 겹 모두 | `adminUpdatePostContent` → `revalidateJobPost` + `revalidateServicePaths`. 50건을 손으로 하기엔 비현실적 |

②는 원래 DELETED/HIDDEN 정리용이지만 **태그 무효화는 전역**이라 우리 50건의 데이터 캐시도
함께 지워진다. 부수효과는 "다른 캐시도 다시 만들어진다" 뿐이라 안전한 방향이다.
다만 ②로도 **라우트 ISR(HTML)은 남는다** — 결국 최대 5분은 기다려야 한다.

> **권장: ① 5분 대기 후 §6 검증.** 새 엔드포인트도, 새 권한도 필요 없다.

---

## 6. production 전수 검증 (필수)

DB 가 바뀐 것과 공개 면이 바뀐 것은 다르다. **실제 HTML 을 받아** 확인한다.

```bash
npx tsx scripts/seo-desc-verify-production.ts
```

- `/jobs/{id}` **50개**를 GET 해서 `<meta name="description">` 을 파싱한다
- CSV `proposedSeoDescription` 과 **정확히 일치**하는지 본다
- **미승인** 금지 표현이 있는지 본다 — `노인돌봄` · `노인주간보호센터` · `노인요양원` 은
  원문 공고 제목의 공식 직함이라 **보존이 승인된 것**이므로 세지 않는다(정정안 문서 §2)
- 자사 요청이므로 `x-bot-type: ops-verify` 를 붙인다. **없으면 GA4·EventLog 가 오염된다**
- 출력은 건수와 해시 지문뿐. 문구 전문을 찍지 않는다

**통과 기준: 일치 50/50 · 미승인 금지 표현 0 · 요청 실패 0.**
불일치가 나오면 캐시가 아직 안 내려간 것일 수 있으니 5분 뒤 재실행한다.
그래도 남으면 롤백을 검토한다.

롤백 후에는 `--expect=before` 로 옛 문구가 복원됐는지 같은 방식으로 확인한다.

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
| **DB write 는 COO 에이전트만** (CLAUDE.md) | 이 CLI 는 **자동화 훅이 아니다.** 크론·워크플로·`runner.ts` HANDLERS 어디에도 연결하지 않았다. 승인 후 운영자가 손으로 1회 실행하는 도구다. `constitution.yaml` 의 `automation_status` 는 현재 `PAUSED` 이고, 이 도구는 그 값을 읽지도 바꾸지도 않는다 |
| **Raw SQL 금지** | Prisma `updateMany` + `$transaction` 만 사용 |
| **SEO 노출면 보호** (네이버) | `seoDescription` 만 바꾼다. `sitemap`·`robots`·`canonical`·일반 `<meta name="robots">` 를 건드리지 않는다. `seoTitle` 도 바꾸지 않는다 |
| **자사 요청 `x-bot-type`** | 검증 스크립트가 항상 붙인다 |
| **개인정보·본문 로그 금지** | 건수와 해시 지문만 출력 |
| **공개 무인증 revalidate API 금지** | 만들지 않았다. 기존 인증 경로(`/api/admin/revalidate-deleted`)만 안내 |
| 변경 금지 파일 | `prisma/schema.prisma` · migration · `.env*` · `.github/workflows/**` · launchd · `src/lib/actions/admin-auth.ts` · `src/app/api/health/auth/route.ts` — **전부 미변경** |

---

## 9. 실행 전 확인 (창업자 승인 후)

```
[ ] origin/main 최신에서 실행하는가
[ ] CSV sha256(12) = 17f44bb785ac        (dry-run 출력과 대조)
[ ] dry-run: 대상 50 · drift 0 · mutation 0
[ ] Postgres 직결이 되는 환경인가 (--read=rest 없이 dry-run 이 통과하는가)
[ ] 적용:  --execute --confirm=APPLY-SEO-DESC-50
[ ] 사후 검증 [6] 에서 seoDescription 50/50 · seoTitle 무변경 50/50
[ ] 5분 대기 (또는 어드민 로그인 후 POST /api/admin/revalidate-deleted)
[ ] production 전수 검증: 일치 50/50 · 미승인 금지 표현 0 · 요청 실패 0
[ ] 문제가 있으면 즉시 롤백 → --expect=before 로 복원 확인
```

---

## 10. 남은 위험

| 위험 | 영향 | 완화 |
|---|---|---|
| 적용과 캐시 반영 사이 **최대 5분**은 옛 문구가 노출된다 | 낮음 — 옛 문구도 정상 문장이다 | 구조적으로 제거 불가(ISR TTL). §6 검증을 5분 뒤에 한다 |
| commit 후 사후 검증이 실패하면 **write 는 이미 됐다** | 중간 | CLI 가 exit 2 로 멈추고 롤백 명령을 출력한다. 롤백 기준값은 CSV 에 있다 |
| CSV 가 유일한 롤백 기준값이다 | 중간 | CSV 는 `origin/main` 에 있고 해시로 대조한다. **CSV 없이 롤백할 수 없다** |
| `--read=rest` 로 확인한 drift 는 **REST 시점** 값이다 | 낮음 | `--execute` 는 Prisma 로 다시 읽고 낙관적 잠금까지 건다 |
| `/api/admin/revalidate-deleted` 는 **전역 태그**를 지운다 | 낮음 | 캐시 재생성 부하만 발생. 데이터는 바뀌지 않는다 |
| 보류 5건의 금지 표현은 **그대로 남는다** | 의도됨 | 정정안 문서 §4. 창업자 판단 대기 |
| 이 도구는 **`/jobs` 만** 다룬다 | 해당 없음 | 적용 대상 50건이 전부 JOB 이다. MAGAZINE 4건은 전부 보류·보존 |
