# Post.summary 백필 — 운영 절차

> 상태: **스크립트 작성 완료 / 백필 실행 불가(선행 보정 필요)**
> 작성 2026-07-30

## 왜 하는가

`sheet-scraper`가 `summary`를 쓰지 않던 시절 저장된 글들이 목록에서 미리보기 없이 제목만 보인다.

- PR #247 — 신규 크롤이 `buildSummary`로 summary를 채우도록 수정
- PR #249 — `buildSummary`에 출처 꼬리표 제거 추가
- 2026-07-30 launchd 운영경로 분리 — 옛 코드가 돌던 로컬 크론을 `unao-ops`로 전환, `fmkorea`는 운영 제외

여기까지로 **신규 유입은 멈췄다**. 남은 것이 과거분 2,168건이다.

## 대상

| 조건 | 값 |
|---|---|
| status | `PUBLISHED` (HIDDEN/DELETED/DRAFT/SEO_ONLY 제외) |
| boardType | `STORY`, `LIFE2`, `HUMOR`, `MENOPAUSE` (그 외 보드 제외) |
| summary | `IS NULL` |
| 건수 | **2,168건** (STORY 1,376 · LIFE2 387 · HUMOR 373 · MENOPAUSE 32) |

`content` 원문은 절대 수정하지 않는다. `summary` 필드만 쓴다.

## 스크립트

`agents/scripts/backfill-post-summary.ts`

```bash
# dry-run (기본값 — DB 수정 0)
npx tsx agents/scripts/backfill-post-summary.ts
npx tsx agents/scripts/backfill-post-summary.ts --limit 200
npx tsx agents/scripts/backfill-post-summary.ts --csv

# write (창업자 승인 후, 단계별로만)
npx tsx agents/scripts/backfill-post-summary.ts --write --limit 10  --confirm-write-sample
npx tsx agents/scripts/backfill-post-summary.ts --write --limit 100 --confirm-write-batch --csv
npx tsx agents/scripts/backfill-post-summary.ts --write --limit 500 --confirm-write-large-batch --csv
```

### 안전장치

| 가드 | 동작 |
|---|---|
| `--write` 없음 | dry-run. DB 수정 0 |
| `--write` + confirm 플래그 없음 | **거부 후 exit 1** |
| `--write` + `--limit` 없음 | **거부 후 exit 1** (limit 없는 전체 write 금지) |
| `--limit`이 confirm 등급 상한 초과 | **거부 후 exit 1** (sample 10 / batch 100 / large-batch 500) |
| raw SQL | 사용하지 않음. Prisma delegate만 |
| 수정 필드 | `summary` 단독. `content` 및 그 외 필드 무변경 |

### CSV (롤백 대장)

`--csv`로 `agents/scripts/backfill-post-summary-{mode}-{ts}.csv` 생성 (`.gitignore` 대상).

컬럼: `id, boardType, createdAt, title, prevSummary, newSummary, leaks, slang, tooShort`

대상이 `summary IS NULL`이므로 `prevSummary`는 항상 빈 값이다. **롤백 = CSV의 id를 `summary = null`로 되돌리기.**

---

## ⚠️ 현재 백필을 실행하면 안 되는 이유

2026-07-30 dry-run 전체 실측:

```
스캔        2168건
생성 가능    2067건
null 유지    101건   (본문이 출처뿐이거나 비어 있음 — 그대로 둔다)

꼬리표 잔존
  사이트명      1건 ❌
  출처문구      4건 ❌
  URL         19건 ❌
  합계         23건 ❌

known issue
  초성 은어 'ㅊㅊ' 잔존 44건
```

`buildSummary`의 `stripTailSource`는 **문자열 꼬리(tail)만** 제거한다. 신규 크롤 글은 출처가 대개 본문 맨 끝에 붙어 통과했지만, 과거 글에는 **본문 앞·중간**에 출처가 있는 경우가 많다.

실제 잔존 사례:

| 유형 | 실측 summary |
|---|---|
| 앞머리 URL | `https://youtube.com/shorts/... 쇼츠에 떠서해봤는데 바로되네요.` |
| 괄호형 출처 | `(자료출처:인터넷) ☞ 국민연금 월 167만원이 중요한 이유 ?` |
| 중간 출처 | `...안 산 사람이 승자" 확산 출처 : SBS \| 네이버 포모대신 조모...` |
| 링크카드 도메인 | `...충청 화법하니까 그거 생각난다 ... instiz.net` |
| 초성 은어 | `...적어진다고 ㅊㅊ:` |

이 상태로 백필하면 **23건에 출처가 박힌 채 2,067건이 확정**되고, 되돌리려면 재백필해야 한다. PR #141이 막았던 P0(원문 출처 노출)의 부분 재발이다.

### 선행 작업

`agents/core/summary.ts` 보강 PR이 먼저다.

1. `ㅊㅊ` 등 초성 은어 라벨 인식 (44건)
2. 위치 무관 URL 제거 — 현재 `TAIL_URL`은 꼬리만 본다 (19건)
3. 괄호형 무특정 출처 `(자료출처:인터넷)` / `(그림출처:인터넷)` 제거 (기존 백로그 항목과 동일)
4. 링크카드 잔여 도메인 토큰(`instiz.net`, `blog.naver.com`, `x.com`, `naver.me`) 제거
5. 유닛 테스트에 위 5종 케이스 추가

보강 후 dry-run을 재실행해 **꼬리표 잔존 0건**이 되면 그때 10건 샘플 write로 넘어간다.

## 진행 순서

| 단계 | 내용 | 전제 |
|---|---|---|
| 0 | `buildSummary` 꼬리표 보강 PR | — |
| 1 | dry-run 재실행 → 잔존 0건 확인 | 0 머지 |
| 2 | `--write --limit 10 --confirm-write-sample` | 창업자 승인 |
| 3 | 결과 10건 육안 확인 | — |
| 4 | `--limit 100 --confirm-write-batch` | 창업자 승인 |
| 5 | `--limit 500 --confirm-write-large-batch` 반복 | 창업자 승인 |
| 6 | 목록·검색 UI 재측정 (preview 노출률, 꼬리표 0건) | — |

각 write 단계는 **창업자 승인이 매번 필요하다.** 승인 없이 다음 단계로 넘어가지 않는다.
