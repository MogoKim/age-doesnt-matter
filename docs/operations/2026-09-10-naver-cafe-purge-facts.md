# 네이버 카페 유래 데이터 — 실측 사실과 폐기 실행 기록 (2026-09-10, 개정 3판)

> 🔴 **폐기는 2026-09-10 실행 완료됐다** — `09:10:12~09:32:39Z` = **18:10:12~18:32:39 KST**.
> 결과는 [§9](#9-실행-결과-2026-09-10-실행-완료) 를 본다.
>
> ⚠️ **§1~§8 의 수치는 `c8f996e0` 시점의 폐기 전 측정값**이다. **실행 직전 값도, 현재 값도 아니다.**
> 측정과 실행 사이에 시간이 흘러 일부 총계가 움직였다(예: `Post` 11,718 → 실행 직전 **11,720**,
> `BotLog` 125,025 → 실행 직전 **125,026**). 실행 직전·직후 값은 **§9-E 하나로만** 본다.
>
> 측정 기준 커밋 `c8f996e0` · 실행 커밋 `e7778998`(PR #454 squash merge) · production Supabase REST
> ⚠️ row ID·제목·본문·댓글·닉네임·secret·project ref 평문을 남기지 않는다. 집계와 분류만 남긴다.
>
> **1판 정정 3건** — 2판에서 바로잡았다.
> ① 실회원 판정을 providerId 접두어(bot·seed·curator)로 했다 → **순수 숫자 `^\d+$`** 로 통일(7건 오분류).
> ② FK 를 Prisma schema 로 읽었다 → **migration SQL 이 정본**. `HomeCurationOverride` 는 RESTRICT 다.
> ③ BotLog 를 30건 표본으로 "원문 없음" 이라 했다 → 전수 스캔 결과 **8,861건이 원문 조각 보유**.

## 1. 대상 정의

`cafePostId IS NOT NULL` **OR** `sourceUrl ILIKE '%cafe.naver.com%'` → **7,449건**
(cafePostId 6,275 · sourceUrl 1,174 / source 분포 BOT 6,275 · SHEET 1,174 / 공개 0 · HIDDEN 7,380 · DELETED 69)

정의는 `NAVER_ORIGIN_FILTER` 하나뿐이고 dry-run 과 execute 가 같은 값을 쓴다.
조회는 전부 `order=id.asc` + `id=gt.<cursor>` keyset 이며, 가져온 뒤 **중복·누락을 exact count 와 대조**한다(실측 중복 0 · 누락 0).

## 2. 실회원 SSoT

`providerId` 가 **순수 숫자**면 사람이다(카카오 user ID). 실측 **실회원 188 · 봇 320 / 전체 508** —
정본 상태판의 "실회원 188명"과 정확히 일치한다. 접두어 목록 방식은 195로 7건 어긋났다.
`authorId` NULL 은 게스트·탈퇴로 **별도의 사람 흔적**으로 센다.

| 지표 | 접두어 방식(1판) | 숫자 SSoT(2판) |
|---|---:|---:|
| 실회원 계정 | 195 | **188** |
| 네이버 유래 글의 실회원 댓글 | 75 | **71** |
| 네이버 유래 글의 실회원 공감 | 45 | **40** |

## 3. 실제 FK — migration SQL 기준

Prisma schema 와 DB 가 어긋난다. **DB 가 정본**이다.

| 테이블 | schema | **실제(migration)** | hard delete 영향 |
|---|---|---|---|
| Comment · Like · GuestLike · Scrap · PostView · CpsLink · JobDetail | Cascade | **CASCADE** | 함께 삭제 |
| Notification | SetNull | **SET NULL** | `postId` 만 NULL |
| **HomeCurationOverride** | Cascade | **RESTRICT** ⚠️ | **삭제 차단** |
| **Report** | Restrict | **RESTRICT** | **삭제 차단** |

⚠️ **2판 누락(3판에서 정정)** — 위 표는 `Post` FK 만 봤다. `Comment` 에도 CASCADE 자식이 있다.
`GuestLike.commentId` 와 `Like.commentId` 는 **댓글**을 참조하며 둘 다 CASCADE 다.
즉 **봇 댓글을 지우면 그 댓글에 달린 공감·게스트 공감도 함께 사라진다.**
판정 도구는 이 경로를 흔적으로 세지도, 계측하지도 않았다. 실제 영향은 §9-C 에 적었다.

`HomeCurationOverride` 는 `20260601000000_add_home_curation_override` 에서 RESTRICT 로 만들어졌고,
`Report` 는 init 의 CASCADE 를 `20260423000000_..._report_restrict` 가 RESTRICT 로 바꿨다.
→ **참조가 있는 글은 임의 삭제하지 않고 tombstone 으로 재분류**한다(관리자 흔적 보존).

## 4. 처분

| 처분 | 대상 | 건수 |
|---|---|---:|
| **HARD DELETE** | Post (흔적 없음) | **7,125** |
| **TOMBSTONE** | Post (사람·관리자 흔적 보유) | **324** |
| **DELETE** | tombstone 글 위 봇 댓글 | **2,545** |
| **DELETE** | `CafePost` | **33,031** |
| **DELETE** | `CafeTrend` | **191** |
| **DELETE** | `CommentWaveQueue` | **276** |
| **DELETE** | `BotLog` (CAFE_CRAWLER 99,026 + 원문 조각 보유 552) | **99,578** — 완료 판정도 이 **전체 잔량 0** 으로 한다(CAFE_CRAWLER 만 보면 파생분이 남는다) |
| **DELETE** | R2 객체 | **518키** — 현재 존재 **504**, 이미 없음 **14**. 실제 삭제 대상은 504이며 없던 14는 `skipped` 로 구분해 센다 |
| **PRESERVE** | 실회원 댓글 **71** · NULL 댓글 **56** · GuestLike **111** · Report **1** · HomeCurationOverride **139** | |
| **PRESERVE** | USER Post 전량 · `Notification` 1,010 · `AdminQueue` 160 · 그 외 BotLog 25,447 | |

tombstone 사유별 글 수(중복 포함): 관리자 큐레이션 120 · GuestLike 98 · 실회원 댓글 69 · NULL 댓글 49 · 실회원 공감 38 · 신고 1 → **합집합 324**.

## 5. 외부·파생 데이터 closure

| 대상 | 실측 | 판정 | 근거 |
|---|---|---|---|
| **R2 객체** | 고유 키 **518**, 현재 존재 504 | **DELETE** | 전부 `pub-…r2.dev`. **보존 Post 와 공유되는 키 0** — 공유되면 삭제하지 않도록 도구가 제외한다. 자격증명 보유(`CLOUDFLARE_R2_*`) |
| **Notification** | 네이버 유래 연결 **144** (COMMENT 26 · HOT_POST 96 · LIKE 22) | **PRESERVE** | `content` 최대 28자 정형문, **원문 제목 조각 0건**, `linkUrl` 1건. FK 가 SET NULL 이라 글이 사라져도 행은 남고 원문은 없다 |
| **AdminQueue** | **160** (CONTENT_PUBLISH, payload ≤519B) | **PRESERVE** | 소셜 발행 문구(xText·threadsText·personaId). **원문 제목 조각 0건**, Post 링크 키 없음 |
| **BotLog** | 전체 125,025 · CAFE_CRAWLER **99,026** · 원문 조각 보유 **8,861**(CAFE_CRAWLER 8,309 · COO 429 · SEED 121 · CEO 1 · CMO 1) | **DELETE 99,578 / PRESERVE 25,447** | `details` 최대 198자에 원문 제목이 들어간다. 카페 크롤러 로그는 파이프라인 전체가 대상. 나머지 봇 로그는 원문 무관 |
| **로컬(`unao-prod`)** | `agents/cafe/` **54파일** · cafe 로그 **22개**(18MB) | **DELETE — 2026-09-10 완료** | DB·R2 밖이라 도구 범위가 아니다. ⚠️ 2판의 "로그 28개"는 실측과 달랐다(실제 22). §9-D 참조 |
| **Supabase Storage** | 버킷 **0** | 해당 없음 | 이미지는 전부 R2 |

## 6. 백업 — **backup expiry pending**

| 항목 | 상태 |
|---|---|
| PITR | **비활성** (2026-08-20 창업자 확인) |
| daily backup | 있음 |
| 플랜 · 보존 기간 · 가장 오래된 복원 지점 | **backup expiry pending** — 창업자 콘솔 확인 전까지 미확정 |

🔴 **복원 시 자동 재적용을 하지 않는다.** 백업에서 복원하면 폐기한 데이터가 되살아나므로,
**복원 절차의 필수 게이트**로 이 도구를 다시 실행하도록 runbook **§5-1** 에 고정했다.

➡️ 폐기 실행 후 **전체 복원을 하지 않기로 결정**했다(2026-09-10). 근거는 §9-H 를 본다.

## 7. 레거시 164건 (변경 없음)

`source=BOT` · 공개 · `cafePostId IS NULL` · 2026-05-20 이전 164건 →
**CONFIRMED_NAVER 0 · LIKELY_NAVER 0 · NOT_NAVER 163 · UNKNOWN 1 → 폐기 범위 제외**

근거: ① 전건 `sourceUrl`·`sourceSite` NULL(seed 경로. 큐레이션은 정의상 `cafePostId` 보유)
② MAGAZINE 102 · JOB 48 · 커뮤니티 14 ③ 커뮤니티 14건을 `CafePost` 33,031건 전량과 본문 대조 — Jaccard 최대 **0.078**, 포함률 최대 **0.269**.
원문은 프로세스 메모리에서만 비교했고 저장·출력하지 않았다.

⚠️ 탐지 사각: `CafePost` 보존 정책이 "90일 경과 + Post 미참조분 삭제"라 2026-03~05 미참조 원문은 이미 없을 수 있다. 구조 근거가 1차, 본문 대조는 보강이다.

## 8. 기준선 취급

`naverOrigin`·`CafePost`·`CafeTrend`·`CommentWaveQueue`·`BotLog(CAFE_CRAWLER)`·R2 는 **줄어드는 방향만** 허용한다
(생산자가 전부 제거됐고 `cto:purge-old-logs` 도 핸들러에 없다). 그래서 **중간 실패 후 재실행이 막히지 않는다.**
보존 대상(실회원 댓글·NULL 댓글·GuestLike·Report·HomeCurationOverride·공개 USER Post)은 **한 건이라도 줄면 즉시 중단**한다.

`Post` 총계는 고정하지 않는다 — 실회원이 지금도 글을 쓴다(**측정 창** 안에서 11,715 → 11,718, 공개 USER 73 → 76).
⚠️ 이 11,718 은 **측정 시점 값**이다. 측정 이후에도 2건이 더 늘어 **실행 직전에는 11,720** 이었다(§9-E).

---

## 9. 실행 결과 (2026-09-10, 실행 완료)

창업자 최종 승인 → PR #454 squash merge → 코드 동일성 대조 → main CI success →
실행 직전 dry-run → `--execute` 순서로 종결했다. 도구 코드는 승인본 `a712115a` 와 **blob 단위로 동일**하다.

| 시각 (UTC) | 시각 (KST) | 사건 |
|---|---|---|
| `08:59:58Z` | **17:59:58** | PR #454 squash merge → `e7778998` |
| `09:03:10~09:08:18Z` | 18:03:10~18:08:18 | 실행 직전 dry-run — mutation **0** |
| `09:10:12~09:32:39Z` | **18:10:12~18:32:39** | `--execute` 실행 → `done ok:true` |

### 9-A. 실행 로그 (`09:10:12Z → 09:32:39Z` = **18:10:12 → 18:32:39 KST** · exit 0 · `done ok:true`)

| 단계 | 결과 |
|---|---|
| P0 BotLog | affected **99,578** · 잔량 **0** |
| P1 R2 | expected 518 · 실제 삭제 **504** · 이미 없음 **14** · 잔존 **0** |
| P2 hard delete | affected **7,125** · 네이버 유래 잔량 324 |
| P3 봇 댓글 | affected **2,545** · 잔량 0 |
| P4 tombstone | affected **324** · 서명 324 전건 전 필드 일치(미완 0) |
| P5 `CommentWaveQueue` | 276 → **0** |
| P6 `CafeTrend` | 191 → **0** |
| P7 `CafePost` | 33,031 → **0** |

ABORT · FAIL-CLOSED · R2 403/429/5xx · DB 비정상 응답 **0건**. 재개 없이 1회 완주했다.

### 9-B. 검증표 12항목 — 전항 PASS

네이버 유래 Post **0** · tombstone 서명 **324** · 봇 댓글 **0** ·
`CafePost`/`CafeTrend`/`CommentWaveQueue` 각 **0** · BotLog 폐기 대상 **0** · R2 잔존 **0** ·
실회원 댓글 **71** · NULL 댓글 **56** · GuestLike(글 경로) **111** · Report **1** ·
HomeCurationOverride **139** · 공개 USER Post **76**(시작값 이상).

독립 재측정(실행 후 read-only): tombstone Post **324** · 그 글의 Comment **127**(= 71 + 56) · GuestLike **111**.

### 9-C. 🔴 검증표가 잡지 못한 부수 손실 — 댓글에 달린 공감

**GuestLike 총계가 283 → 201 로 82건 줄었다.** 검증표는 GuestLike 를 **글 경로(`postId`)** 로만 셌고
그 111건은 그대로다. 줄어든 82건은 **댓글 경로(`commentId`)** 다.

| 경로 | 실행 직전(역산) | 실행 후(실측) |
|---|---:|---:|
| `GuestLike.postId` (글에 달린 게스트 공감) | 160 | **160** — 변화 없음 |
| `GuestLike.commentId` (댓글에 달린 게스트 공감) | 123 | **41** — **82건 폐기** |

원인은 §3 정정에 적은 `Comment → GuestLike/Like` CASCADE 다. 봇 댓글 **54,496건**
(P3 직접 삭제 2,545 + hard delete 글의 cascade 51,951)이 사라지면서 **그 댓글에 달려 있던 공감이 함께 삭제**됐다.

- 이 손실은 **불가역**이며 사전에 계측하지도, 창업자에게 보고하지도 않았다. 도구 설계 누락이다.
- **`Like.commentId` 경로의 손실 건수는 알 수 없다.** 실행 전 `Like` 를 글/댓글 경로로 분해해 재지 않았다.
  실행 후 댓글 경로 `Like` 는 **63건(실회원 44 · 봇 19)** 이다 — 실회원이 댓글에 공감을 누르는 행동이
  실재하므로, 봇 댓글에 달렸던 실회원 공감 일부가 함께 사라졌을 가능성을 **배제할 수 없다**.
- 사라진 82건은 **봇이 쓴 댓글에 달려 있던 게스트 공감**이다. 그 공감을 **누른 쪽이 누구였는지는 알 수 없다** —
  `GuestLike` 는 비로그인 흔적(`ipHash`·`cookieId`)이라 실회원 여부를 판별할 근거 자체가 없다.
- 실회원이 **직접 쓴 댓글 71건**과 그 댓글 자체는 **보존**됐다(실행 전후 71 불변).

교훈: 처분 대상의 FK 는 `Post` 뿐 아니라 **함께 지우는 모든 테이블**에 대해 자식을 훑어야 한다.

### 9-D. DB·R2 밖 잔재 (수동 삭제 완료)

| 대상 | 실측 | 조치 |
|---|---:|---|
| `unao-prod/agents/cafe/` | **54파일**(`.magazine-daily-*.json` 51 · `.nid-aut-alerted` · `.session-halted` · `storage-state.json`) | 삭제, 빈 디렉터리 제거 |
| `unao-prod/logs/` cafe 로그 | **22개**(`cafe-crawler-*` 20 · `naver-cafe-sheet-scraper*` 2, 18MB) | 삭제 |

삭제 후 잔존 0. `unao-prod/logs` 의 비-cafe 파일 6개와 `agents/` 의 다른 하위 디렉터리는 건드리지 않았다.

### 9-E. DB 집계 — 측정 시점 / 실행 직전 / 실행 후

**세 시점을 섞지 않는다.** `c8f996e0` 측정과 실행 사이에 시간이 흘렀고 그 사이 총계가 움직였다.

| 테이블 | ① 측정 시점 (`c8f996e0`, 폐기 전) | ② **실행 직전** | ③ **실행 후(실측)** | ② 의 근거 |
|---|---:|---:|---:|---|
| Post | 11,718 | **11,720** | **4,595** | 역산 (③ + hard delete 7,125) |
| BotLog | 125,025 | **125,026** | **25,448** | 역산 (③ + 폐기 99,578) |
| Comment | 67,086 | 67,086 | **12,590** | 역산 (③ + 54,496), ① 과 동일 |
| GuestLike | 283 | 283 | **201** | 역산 (③ + 82), ① 과 동일 |
| CafePost / CafeTrend / CommentWaveQueue | 33,031 / 191 / 276 | **33,031 / 191 / 276** | **0 / 0 / 0** | 실행 `start-state` **직접 실측** |
| Like | 31,187 | *미계측* | **16,612** | 실행 직전 총계를 재지 않았다 |
| User | 508 | *미계측* | **508** | 변화 없음 |
| Notification | 1,010 | *미계측* | **1,010** | 변화 없음 |

- **`Post` 감소는 정확히 7,125** = hard delete 건수다. 실행 22분 동안 신규 Post 는 **0건**이었다
  (`publicUserPosts` 76 → 76 이 이를 뒷받침한다). ②의 11,720 은 이 전제 위의 역산값이다.
- ①의 11,718·125,025 는 **역사적 기준선**이며 "실행 직전"으로 인용하지 않는다.
- `Comment` 감소 **54,496** 은 실행 `start-state` 가 직접 측정한 `botCommentsOnNaver` 와 **정확히 일치**한다.
- `Like` 는 실행 직전 총계도, 글/댓글 경로 분해도 재지 않았다 — §9-C 의 불확정성이 여기서 나온다.

### 9-F. 배포 표면

`/` 200 · `/api/health` 200 · `/api/health/auth` 200 · `/community/stories` 200 · `/magazine` 200 ·
`sitemap.xml` 200 · `<loc>` **859 → 859 불변**(폐기 대상이 전부 비공개였다).

### 9-G. 반드시 함께 읽을 기록

1. **보존 범위는 아래 네 줄로만 말한다.** "실회원이 작성한 콘텐츠·댓글·공감은 보존했다"는
   **포괄적 단정은 쓰지 않는다** — 댓글 경로에서 실제 손실이 있었고, 그 손실의 실회원 포함 여부를 확정할 수 없다.
   - **실회원이 작성한 글과 댓글 71건은 보존**됐다(실행 전후 71 불변). USER Post 는 판정 단계에서 항상 PRESERVE 다.
   - **글 경로로 측정한 보존 지표는 전부 불변**이다 — NULL 작성자 댓글 56 · 글에 달린 GuestLike 111 ·
     Report 1 · HomeCurationOverride 139 · 공개 USER Post 76. 실회원 공감이 달린 글은 `like-human` 흔적으로
     TOMBSTONE 처리되어 글 자체가 삭제되지 않았다.
   - **봇 댓글 삭제로 `GuestLike` 82건이 cascade 삭제**됐다(§9-C). 불가역이다.
   - **`Like` 댓글 경로의 정확한 손실 건수와 실회원 공감 포함 여부는 알 수 없다** —
     실행 전 `Like` 를 글/댓글 경로로 분해해 재지 않았기 때문이다. 있었다고도, 없었다고도 말하지 않는다.
2. **hard delete 한 7,125건의 `PostView` 조회 이력은 함께 폐기됐다.** `PostView` 는 `Post` FK 가 CASCADE 다.
   같은 이유로 그 글들의 `Like`·`Scrap`·`CpsLink`·`JobDetail` 행도 함께 사라졌다.
   `Scrap` 은 흔적으로 세지 않았다 — 실행 후 전체 **0건**이나 실행 전 값을 재지 않았으므로 "손실 0"이라고 단정하지 않는다.
3. **`backup expiry` 는 여전히 pending 이다.** daily backup 은 남아 있고 보존 기간·가장 오래된 복원 지점은 미확인이다.
   이 실행으로 **백업에서까지 소멸했다고 주장하지 않는다.** 복원하게 되면 runbook **§5-1** 게이트를 반드시 거친다.
   ※ 전체 복원 자체는 **하지 않기로 결정**했다 — §9-H.

### 9-H. 운영 결정 — **전체 백업 복원은 하지 않는다** (2026-09-10, 창업자)

§9-C 의 불가역 손실을 확인한 뒤 내린 결정이다.

| | |
|---|---|
| 결정 | **daily backup 을 이용한 전체 복원을 하지 않는다** |
| 근거 ① | 손실 행은 **의도적으로 폐기한 봇 댓글의 자식**이다. 되살리려면 그 봇 댓글부터 되살려야 한다 |
| 근거 ② | 전체 복원은 **폐기한 데이터 전체를 부활**시킨다 — 폐기의 목적 자체가 무효가 된다 |
| 근거 ③ | 복원 시점 이후 쌓인 **정상 데이터(실회원 글·댓글·가입)가 손상**될 위험이 더 크다 |
| 판정 | 82건을 되살리는 이득 < 부활·손상 위험. **기록으로 남기고 진행한다** |

⚠️ 이 결정은 **"복원을 하지 않는다"** 이지 **"백업에서 소멸했다"** 가 아니다.
`backup expiry` 는 여전히 pending 이고, 보존 기간이 지나기 전까지 백업에는 폐기 데이터가 남아 있다.
그래서 runbook **§5-1** 게이트와 폐기 도구는 **그대로 유지**한다 — 다른 사유로 복원하게 되면 반드시 다시 밟는다.
