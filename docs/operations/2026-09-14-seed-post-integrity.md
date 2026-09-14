# 공개 시드 글 3건 정합성 — 도구·계획

> 2026-09-14 · 기준 `origin/main` `9cd4a932` · **production write 0 · merge 0 · 배포 0**
> 이 배치는 **측정과 도구까지**다. 실행은 Codex 리뷰 + 창업자 승인 후다.

---

## 0. 무엇을 고치는가

시드 계정(`seed_NNN`)이 쓴 글 **3건**이 `source=USER` · `PUBLISHED` 로 남아
**회원이 쓴 글처럼 보인다.** 공개면에서 내리고 출처를 사실대로 적는다.

```
PUBLISHED / source=USER  →  HIDDEN / source=BOT
```

### 0-A. 🔴 무엇을 지우고 무엇을 지키는가

**Post 와 반응 데이터는 삭제하지 않는다. `HomeCurationOverride` 2건만 의도적으로 제거한다.**

`hard delete` 를 하지 않는다. **tombstone(제목·본문 비우기)도 하지 않는다.**

이 세 글에는 **실회원 댓글 2건**이 달려 있다. 본문을 지우면 그 댓글이 무엇에 대한
말이었는지 알 수 없게 된다 — 사람의 흔적을 망가뜨리는 셈이고, 감사 가능성도 사라진다.

반응 데이터(`Comment`·`Like`·`GuestLike`·`Scrap`·`PostView`·`Report`)는
**한 행도 건드리지 않는다.** `HomeCurationOverride` 2건은 홈 고정을 푸는 것이라
의도적으로 제거한다 — 숨긴 글이 홈에 고정된 채로 남으면 안 되기 때문이다.

### 0-A-1. 🔴 대상 identity 는 manifest 로 고정한다

대상 3건의 **identity 를 파일로 못 박는다** — Post ID · `providerId` · `authorId` 해시 ·
`boardType` · 기대 `status`/`source` · **title/content 해시**.

`docs/operations/data/2026-09-14-seed-post-manifest.csv` · 전체 SHA-256 `ce0b5769bf46c9ad…`

한 글자라도 바뀌면 실행되지 않는다. 트랜잭션 안에서 이 **여덟 축**을 다시 대조하고,
하나라도 어긋나면 **mutation 0 으로 ABORT** 한다. `updateMany` 의 `where` 에도
확정 ID + 기대 `status`·`source` 를 넣는다(낙관적 잠금).

### 0-B. 🔴 `seed-` 가 아니라 `seed_` 다

시드 계정 접두사는 **밑줄**이다. `seed-*` 로 조회하면 **0건으로 오독**된다.
실제로 그 오독 때문에 "시드 글 정합성 해소됨"으로 잘못 보고된 적이 있다(2026-09-14).

---

## 1. 착수 실측 (production read-only · 2026-09-14)

| 항목 | 값 |
|---|---:|
| `seed_NNN` 계정 | 7 |
| **PUBLISHED 시드 글** | **3** (`seed_001` · `seed_005` · `seed_007`) |
| boardType | STORY **2** · HUMOR **1** |
| 댓글 | **9** |
| **실회원 댓글** | **2** |
| Post Like | **4** |
| 실회원 Post Like | **0** |
| GuestLike(comment) | **1** |
| GuestLike(post) · Like(comment) · Scrap · Report | 0 |
| PostView | **5** |
| **HomeCurationOverride** | **2** |
| JobDetail · CpsLink | 0 |
| **R2 이미지 포함 글** | **0** |

세 글 모두 보존 경계 218 안에 있다 — 627건 처분에서 **의도적으로 남긴** 글이다.

**하나라도 다르면 write 전에 멈춘다**(`checkBaseline`). 특히
`realMemberPostLikes` 가 0 이 아니게 되거나 `postsWithR2Image` 가 늘면 전제가 바뀐 것이다.

---

## 2. 하는 일

| 단계 | 대상 | 동작 |
|---|---|---|
| 1 | `HomeCurationOverride` (postId ∈ 3건) | **삭제 2건** — 홈 고정 해제 |
| 2 | `Post` (정확히 그 3건) | `status` → `HIDDEN` · `source` → `BOT` |

그 외에는 **아무것도 하지 않는다.**

`HomeCurationOverride` 를 먼저 지우는 이유는 FK 때문이 아니라(숨김은 FK 가 안 막는다)
**홈에 고정된 채로 숨겨지는 중간 상태를 만들지 않기 위해서**다. 한 트랜잭션이라 외부에는 안 보이지만,
순서를 코드로 고정해 두면 나중에 트랜잭션을 쪼개더라도 안전하다.

---

## 3. 안전장치

### 3-A. 🔴 구조로 막는다

트랜잭션 인터페이스(`SeedTx`)에 `comment`·`like`·`guestLike`·`scrap`·`report`·`postView` 를
**아예 넣지 않았다.**
실수로 그 테이블을 건드리는 코드를 쓰면 **컴파일이 안 된다.**
주석으로 "건드리지 마라"라고 적는 것보다 확실하다.

`post` 에는 `updateMany` 만 있다 — `delete`·`deleteMany` 경로가 타입에 없다.

`data` 에 넣을 수 있는 필드는 `status`·`source` **둘뿐**이다(`assertPatchShape`).
`title`·`content` 를 끼워 넣으면 던진다 — tombstone 을 코드로 막는 장치다.

### 3-B. 나머지

- `isolationLevel: 'Serializable'` · 직렬화 충돌(P2034)은 **재시도하지 않고 ABORT**
- 낙관적 잠금 — `where` 에 기대 `status`·`source` 를 넣는다
- 트랜잭션 안에서 **identity 8축** 재확인(id·authorId·providerId·boardType·status·source·title·content)
- 영향 행이 대상 수와 다르면 ABORT · 큐레이션 영향 행이 기대와 달라도 ABORT
- 기본 dry-run · `--execute` + `--confirm=HIDE-SEED-PUBLIC-POSTS-3` 둘 다 필요
- DB write 는 **COO 경로만**(`agents/coo/`) · `LOCAL ONLY` 라 스케줄 미연결
- 로그에 ID·제목·본문·개인정보를 쓰지 않는다

---

## 4. 사후 기대값

### 4-A. 🔴 판정은 셋이 각자 한 가지만 본다

| 판정 | 보는 것 |
|---|---|
| `verifyAfter` | **성공 정의** — 확정 3건이 HIDDEN/BOT · 공개 시드 글 0 · 큐레이션 0 |
| `compareReactions` | 반응 **12축 감소만** 실패 (증가는 허용) |
| `verifyContentUnchanged` | 제목·본문 **해시 일치** |

이전 판은 `verifyAfter` 가 반응 5축을 **exact equality** 로 또 봤다.
그래서 12축과 **판정이 둘**이 됐고, 실행 중 누가 댓글을 달아 9 → 10 이 되면
12축은 통과하는데 5축이 실패하는 모순이 생겼다. 반응 판정은 하나여야 한다.

전체 `Post`·`PUBLISHED`·`HIDDEN` **절대값은 판정에서 뺐다.**
다른 배치가 글을 쓰거나 지워도 이 작업의 성패와 무관하다 — **관측값으로 출력만** 한다.

| 성공 판정 | 기대 |
|---|---:|
| 확정 manifest 3건이 **HIDDEN + BOT** | **3/3** |
| 공개 시드 글 잔량 | **0** |
| HomeCurationOverride | **0** |
| 반응 12축 | **감소 0** |
| title·content 해시 | manifest 와 **정확히 일치** |

| 관측값 (판정 아님) | 참고 |
|---|---:|
| 전체 Post · PUBLISHED · HIDDEN | 출력만 한다 |

### 4-0. 반응 12축 (착수 = 사후 기준선)

| 축 | 착수값 |
|---|---:|
| `comments` / `realMemberComments` | 9 / **2** |
| `postLikes` / `realMemberPostLikes` | 4 / 0 |
| `commentLikes` / `realMemberCommentLikes` | 0 / 0 |
| `guestLikesOnPosts` / `guestLikesOnComments` | 0 / **1** |
| `scraps` / `realMemberScraps` | 0 / 0 |
| `postViews` / `reports` | 5 / 0 |

🔴 `reports` 는 **`postId` 경로와 `commentId → Comment.postId` 경로의 합집합**이다.
댓글 신고는 `postId` 가 null 이라 글 기준 조회로는 안 잡힌다.

**감소하면 실패 · 증가는 허용**한다. 실행 중 누가 댓글을 달거나 조회해서 늘어나는 것은
정상이고, 그걸 실패로 보면 사람이 서비스를 쓰는 것만으로 작업이 실패한다.

### 4-1. 제목·본문은 해시로 본다

"비어 있지 않다"만 보면 누가 **다른 문구로 덮어써도 통과**한다.
manifest 의 `titleSha256`·`contentSha256` 과 **정확히 같아야** 한다(`verifyContentUnchanged`).

**반응 데이터가 한 건이라도 줄면 실패다.**
Post 와 반응 데이터는 삭제하지 않는다. `HomeCurationOverride` 2건만 의도적으로 제거한다.
실행 중 누가 댓글을 달거나 조회해서 **늘어나는 것은 정상**이다 — 감소만 실패로 본다.

### 4-B. 노출면 (실행 배치에서 확인)

- [ ] 공개 URL **404 또는 410**
- [ ] `sitemap.xml` 에서 3건 제외
- [ ] `/` · `/community` · `/magazine` · `/jobs` · `/api/health` · `/api/health/auth` 정상

⚠️ 커뮤니티 글 URL 은 `/community/<보드slug>/<id>`(SSoT: `src/lib/board-registry.ts`)이고
canonical slug 로 **301** 한 뒤 최종 상태가 정해진다. 리다이렉트를 따라가야 판정할 수 있다.

`sitemap` 은 `status IN (PUBLISHED, SEO_ONLY)` 만 담으므로 `HIDDEN` 이 되면 자동으로 빠진다.

---

## 5. 파일

| 파일 | 역할 |
|---|---|
| `agents/purge/seed-post-integrity.ts` | 순수 — 시드 판별 · manifest · identity 8축 · 반응 12축 · 본문 해시 · 사후 검증 |
| `agents/purge/seed-post-integrity-exec.ts` | 트랜잭션 실행 (반응 테이블이 타입에 없다) |
| `agents/purge/seed-post-integrity.test.ts` | 실패 경로 테스트 **102건** |
| `agents/coo/seed-post-integrity.ts` | COO 핸들러 — 유일한 실행 입구 |
| `docs/operations/data/2026-09-14-seed-post-manifest.csv` | **확정 identity manifest**(SHA 잠금) |

실행:

```
# dry-run (write 0)
npx tsx agents/coo/seed-post-integrity.ts

# 실제 — 리뷰·승인 후 1회
npx tsx agents/coo/seed-post-integrity.ts --execute --confirm=HIDE-SEED-PUBLIC-POSTS-3
```

---

## 6. dry-run 결과 (2026-09-14 · write 0)

```
── 착수 실측 ──
  PUBLISHED 시드 글       3 ({"HUMOR":1,"STORY":2})
  댓글 / 실회원 댓글      9 / 2
  Post Like / 실회원      4 / 0
  GuestLike(comment)      1
  PostView                5
  HomeCurationOverride    2
  R2 이미지 포함 글       0
  ── 반응 12축 ──
    comments 9 · realMemberComments 2
    postLikes 4 · realMemberPostLikes 0
    commentLikes 0 · realMemberCommentLikes 0
    guestLikesOnPosts 0 · guestLikesOnComments 1
    scraps 0 · realMemberScraps 0
    postViews 5 · reports 0

착수 조건: 기대와 일치 (이슈 0건)
대상: 3건 · PUBLISHED/USER → HIDDEN/BOT
dry-run 종료 — DB write 0건
```

---

## 7. 이 배치에서 하지 않은 것

- production DB write **0건**
- merge · 배포 **0건**
- MASTER 6-C 진행률 변경 — **실행 완료 후**에 95% → 100% 로 종결한다
