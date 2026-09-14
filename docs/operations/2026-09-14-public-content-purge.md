# 공개 콘텐츠 628건 영구 삭제 — 진단·도구·실행 계획

> 2026-09-14 · 기준 `origin/main` `bb91b79b` · **production write 0 · merge 0 · 배포 0**
> 이 배치는 **측정과 도구까지**다. 실행은 창업자 승인 후 별도 배치다.

---

## 0. 되돌릴 수 없다

이 도구에는 **롤백이 없다.** `Post` hard delete 는 복구 경로가 없고, R2 객체 삭제도 마찬가지다.
그래서 SEO 적용 도구보다 사전 검사가 두껍고, **행별 SKIP 이 없다** — 전부 아니면 전무다.

---

## 1. 삭제 대상 — 역사적 후보와 최신 실측

### 1-A. 합집합 검산

| 출처 | 조치 | 건수 |
|---|---|---:|
| 1차 분류 | `HIDE` | 60 |
| 2차 분류 | `PRESERVE_CANDIDATE` | 247 |
| 2차 분류 | `MANUAL_REVIEW` | 159 |
| 2차 분류 | `KEEP_NOINDEX` | 153 |
| 2차 분류 | `BRAND_COPY_HOLD_REVIEW` | 4 |
| 2차 분류 | `OFFICIAL_NAME_ONLY_REVIEW` | 3 |
| 2차 분류 | `BRAND_COPY_PARTIAL_HOLD_REVIEW` | 1 |
| 2차 분류 | `SOURCE_TITLE_ONLY_REVIEW` | 1 |
| | **합계** | **628** |

- **1차 HIDE ∩ 2차 삭제조치 = 0** — 2차 650건은 1차 `REVIEW` 650건과 정확히 같은 집합이라 겹칠 수 없다.
- **예상 628과 실측 628이 일치한다.** 차이 분해가 필요 없다.
- `MANUAL_REVIEW` 의 오래된 JOB 136건은 이미 159 안에 있다 — **따로 더하지 않았다.**

### 1-B. production 최신 상태 (read-only 실측)

| 항목 | 값 |
|---|---|
| 응답 | **628 / 628** (누락 0 · 중복 0) |
| status | `PUBLISHED` **628** (다른 상태 0) |
| boardType | MAGAZINE 262 · JOB 141 · HUMOR 127 · STORY 89 · LIFE2 7 · WEEKLY 2 |
| source | BOT 396 · SHEET 213 · USER 18 · ADMIN 1 |

`source=USER` 18건은 **전부 봇 페르소나**다(`providerId` 가 카카오 숫자가 아니다). 실회원 글이 아니다.

---

## 2. 보호 경계 — 실회원 흔적 0건

| 보호 신호 | 후보 628건 중 |
|---|---:|
| 실회원(카카오 숫자 `providerId` · 비ADMIN) 작성 글 | **0** |
| 실회원 댓글이 달린 글 | **0** |
| 게스트(Turnstile) 댓글이 달린 글 | **0** |
| 실회원 좋아요가 달린 글 | **0** |
| **보호로 제외되는 글** | **0** |

후보 글의 댓글 775건은 **전부 봇/관리자**, 좋아요 1,280건도 **전부 봇/관리자**다.

### 2-A. `protectedFromHideDelete` 에 대한 정정

이 필드는 **DB 컬럼이 아니다.** 2차 분류 CSV 의 파생 플래그(32건)다.
따라서 교집합은 DB 가 아니라 **CSV 기준으로** 강제한다 — 실측 결과 **삭제 후보 ∩ 보호축 = 0**.

### 2-B. 보존 경계

| 축 | 건수 |
|---|---:|
| 1차 `PRESERVE` | 136 |
| 2차 `PRESERVE` | 31 |
| `REWRITE_AUTO_COMPOSED` | 1 |
| `REWRITE_BRAND_COPY`(SEO 적용 완료) | 50 |
| `protectedFromHideDelete=true` | 32 (위 축에 포함) |
| **합집합** | **218** |

**삭제 후보 ∩ 보존 경계 = 0.** 보존 218건은 현재 전건 `PUBLISHED` 다.

`PostView` 만 있는 글과 새 `GuestLike` 는 **보호 근거로 보지 않는다**(주체 판별 불가 — 창업자 결정).

---

## 3. Dependency closure — Post 삭제가 건드리는 전부

`prisma/schema.prisma` 전수 스캔 결과, `postId`·`commentId` 를 가진 모델은 **14개**다.

| 테이블 | 경로 | 참조 동작 | 처리 | 예상 삭제량 |
|---|---|---|---|---:|
| `Comment` | postId | **Cascade** | 자동 | 775 |
| `Like`(post) | postId | **Cascade** | 자동 | 1,280 |
| `Like`(comment) | commentId | **Cascade** | 댓글 경유 자동 | 2 |
| `GuestLike`(post) | postId | **Cascade** | 자동 | 0 |
| `GuestLike`(comment) | commentId | **Cascade** | 댓글 경유 자동 | 1 |
| `Scrap` | postId | **Cascade** | 자동 | 0 |
| `PostView` | postId | **Cascade** | 자동 | 45 |
| `JobDetail` | postId | **Cascade** | 자동 | 141 |
| `CpsLink` | postId | **Cascade** | 자동 | 105 |
| `Report`(post) | postId | 🔴 **Restrict** | **선행 수동 삭제** | 0 |
| `Report`(comment) | commentId | 🔴 **Restrict** | **선행 수동 삭제** | 0 |
| `HomeCurationOverride` | postId | 🔴 **Restrict**(기본값) | **선행 수동 삭제** | **4** |
| `Notification` | postId | ⚠️ **SetNull** | **명시 삭제**(고아 방지) | 1 |
| `CommentWaveQueue` | postId | ⚠️ **FK 없음** | **명시 삭제**(고아 방지) | 0 |
| `UserPostWaveQueue` | postId | ⚠️ **FK 없음** | **명시 삭제**(고아 방지) | 0 |
| `Post` | — | — | 본체 | **628** |

### 3-A. 그냥 지우면 실패한다

- **`HomeCurationOverride` 4건이 실재한다.** `onDelete` 가 선언돼 있지 않아 Prisma 기본값 `Restrict` 가 적용되고, **FK 가 `Post` 삭제를 막는다.** 이 4건을 먼저 지우지 않으면 트랜잭션 전체가 실패한다.
- `Report` 는 현재 0건이라 당장은 막히지 않지만, 실행 직전에 신고가 들어오면 막힌다. 도구는 **항상 먼저 지운다**.
- `Notification`·`WaveQueue` 는 막지는 않지만 **조용히 고아가 남는다**. `SetNull` 은 행을 살리고 `postId` 만 비운다. `WaveQueue` 둘은 아예 FK 가 없는 평문 `String` 이다.

### 3-B. 삭제 순서 (단일 트랜잭션)

```
1. Report(commentId ∈ 대상 글의 댓글)   ← Restrict 해제
2. Report(postId ∈ 대상)               ← Restrict 해제
3. HomeCurationOverride                ← Restrict 해제
4. Notification                        ← 고아 방지
5. CommentWaveQueue                    ← 고아 방지 (FK 없음)
6. UserPostWaveQueue                   ← 고아 방지 (FK 없음)
7. Post  ── 나머지 9개 테이블은 여기서 CASCADE
```

단계마다 실제 영향 행 수를 기대값과 대조한다. 하나라도 어긋나면 던지고 **트랜잭션이 통째로 롤백**된다.

---

## 4. R2 이미지

| 항목 | 값 |
|---|---:|
| 후보 글이 참조하는 고유 R2 **객체 키** | 867 |
| **manifest**(후보 전체 객체 · SHA 잠금) | **867** |

### 4-A-1. 실행 전과 실행 후는 다른 수치다

| 시점 | 보호 | R2 삭제 후보 |
|---|---:|---:|
| **실행 전** (628건이 아직 살아 있다) | **867** | 0 |
| **실행 전 live reference 중 글 밖 참조** | **16** | — |
| **DB 삭제 후 예상** | **0** | **867** |

실행 전 보호 867 은 후보 글 자신이 자기 이미지를 참조하기 때문이다 — 정상이다.

글 밖에서 오는 보호 **16** 은 전부 `NaverBlogQueue.imageUrls` 다.
그런데 **그 15행은 이번 실행에서 함께 지워진다**(`magazinePostId` 가 삭제 대상 ·
CLEANUP 정책 · 실측 전부 `EXPIRED` · `naverBlogUrl` 존재 0).
그래서 **삭제 후에는 그 16키도 참조가 없어져 보호 0 · 삭제 후보 867** 이 된다.

🔴 미리보기는 이 "함께 삭제될 행"을 빼고 계산해야 한다. 빼지 않으면 보호 16 / 삭제 851 로
**과대 계상**한다. 같이 빼는 대상: `NaverBlogQueue(magazinePostId)` ·
`Comment(postId)` · `CpsLink(postId)` · `Post(id)`.
글과 무관한 모델(`Banner`·`User`·`SocialPost` 등)은 그대로 둔다.

⚠️ **실제 실행의 보호 계산에는 이 제외를 쓰지 않는다.** 커밋 뒤에는 DB 가 이미 진실이라
전체를 그대로 읽으면 되고, 추정이 끼어들 자리가 없다.
| 외부 이미지(unsplash) — 손대지 않음 | 6 |

전용 객체 prefix: `magazine` 507 · `scraped` 349 · `magazine-thumbnails` 11.

### 4-A. 호스트가 둘인데 버킷은 하나다 🔴

`pub-b0ae…r2.dev` 와 `img.age-doesnt-matter.com` 은 **같은 버킷**이다.
같은 키에 HEAD 를 걸어 **ETag 가 일치**하는 것을 표본 8건에서 확인했다.

그래서 공유 여부를 **URL 로 세면 안 된다.** 보존 글이 다른 호스트로 같은 객체를 참조하고 있으면
공유를 못 보고 지워버린다. 도구는 URL 을 **객체 키로 정규화한 뒤** 센다.

### 4-B. 🔴 글끼리만 비교하면 16개를 잘못 지운다

`Post` 끼리만 대조했을 때는 전용 867 · 공유 0 이었다.
이미지를 들고 있는 **다른 모델**까지 넣으니 공유가 **16** 으로 늘었다.

### 4-B-1. live closure 전수 — schema 전체 기준 (2026-09-14 실측)

`prisma/schema.prisma` 를 이미지·본문 필드로 전수 검색해 **15개 소스**를 모두 넣고
manifest 867키와 교차한 결과다.

| 소스 | 읽은 행/URL | manifest 교집합 |
|---|---:|---:|
| **`NaverBlogQueue.imageUrls`** (15행 · 전부 EXPIRED · 이번에 함께 삭제) | 34 | **16** |
| `SocialPost.imageUrls` | 43 | 0 |
| `Comment.content` | 12,590 | 0 |
| `User.profileImage` | 159 | 0 |
| `Notice.body` | 11 | 0 |
| `Banner.imageUrl` · `AdBanner.imageUrl` | 1 · 1 | 0 |
| `ChannelDraft.imageUrls` · `Popup.imageUrl/content` · `CpsLink.productImageUrl` | 0 | 0 |
| `DraftPost.content` · `Comment.imageUrl` · `CafePost.*` | 0 | 0 |
| 살아남는 `Post` 3,967건 | — | 0 |
| | **합집합** | **16** |

**정정**: 이전 판은 이 16을 "SocialPost 43 + NaverBlogQueue 34" 에서 나온 것처럼 적었다.
모델별로 분해해 보니 **전부 `NaverBlogQueue.imageUrls` 단독 기여**이고 `SocialPost` 는 0 이다.

닫은 뒤 수치가 그대로인 것은 **새 모델들이 실제로 0건 기여하기 때문**이지
검사를 안 해서가 아니다. 각 모델을 단독으로 넣어도 manifest 키를 지키는지 테스트로 고정했다.

제외한 필드와 이유: `Post.sourceUrl` · `CafePost.postUrl` · `AdBanner.clickUrl` ·
`CpsLink.productUrl` · `Notice.url` · `ScheduledPush.url` · `Banner.ctaUrl` 은 링크지 이미지가 아니다.
`CafePost.videoUrls` 는 이미지 확장자 필터에 걸리지 않는다.

### 4-C. 실행은 HEAD → DELETE → HEAD

지웠다고 **추정하지 않는다**. S3 계열은 없는 키에도 `204` 를 주므로 응답 코드만으로는
판정이 안 된다. DELETE 뒤 HEAD 가 `404` 여야만 `DELETED` 라고 쓴다.

### 4-C-1. 🔴 manifest 는 867(전체)이고 공유 판정은 실행 시점이다

manifest 를 851(전용)로 굳히면 **실행 시점의 보호 변화를 담지 못한다.**
트랜잭션에서 회원 흔적이 새로 발견돼 어떤 글이 보호되면 그 글은 살아남는데,
계획 때 "전용"으로 박아둔 그 글의 이미지는 그대로 지워진다.

그래서 manifest 는 후보 글이 참조하는 **전체 867키**를 담고
(`…-r2.txt` · SHA `f9eda12f…`), **삭제할지 말지는 커밋 뒤 다시 계산한 공유 집합**이 정한다.

**보호 집합 = manifest ∩ 지금 살아 있는 모든 참조 키**다.

살아 있는 참조는 **남아 있는 모든 `Post`**(`thumbnailUrl` + 본문) + `SocialPost.imageUrls` ·
`ChannelDraft.imageUrls` · `NaverBlogQueue.imageUrls` · `Banner.imageUrl` 에서 모은다.

🔴 **삭제 대상은 이 계산의 입력이 아니다.** 이전 구현은 공유를 "삭제 대상이 참조하는 키"
안에서만 찾아서, **보호돼 살아남은 글만 쓰는 키가 공유로 안 잡히고 지워졌다.**
지금은 `liveReferencedKeys(livePosts, foreign)` 에 `doomedIds`·`deletedIds`·preflight 스냅샷을
아예 넘기지 않는다 — 그래서 DB 가 `COMPLETE` 라 후보가 0건인 재개에서도 정확히 계산된다.

dry-run 에서는 후보 628건이 아직 살아 있어 **867 전건이 보호**로 잡힌다(정상).
운영자가 예상 삭제량을 볼 수 있게 "삭제 후 기준" 미리보기(**보호 0 · R2 삭제 후보 867**)를
따로 찍지만, **그 값은 어떤 판정에도 쓰지 않는다.** §4-A-1 참조.

### 4-C-2. `--r2-only` 는 아무 때나 못 쓴다

DB 가 시작 전인데 이미지만 지우면 **살아 있는 글의 이미지가 깨진다.**
그래서 `DB COMPLETE` 이거나 **남은 후보가 전부 현재 보호 대상**일 때만 허용한다.
그 외에는 ABORT — 실측으로도 `NOT_STARTED` 에서 거부되는 것을 확인했다.

이미 지워진 키는 `ALREADY_GONE` 으로 조용히 지나가므로 재개는 안전하다.

### 4-D. 불확실하면 그 객체만 뺀다

`403`·`429`·`5xx` 는 "없다"는 뜻이 아니다. `UNCERTAIN` 으로 보고 **그 객체만 건너뛴다**.
이미지 실패는 **글 삭제를 막지 않는다**(창업자 지시).

---

## 5. 실행 도구

| 파일 | 역할 |
|---|---|
| `agents/purge/public-content-policy.ts` | 순수 — CSV·manifest 검증 · 계획 · drift · 회원 판정 · semantic 정책 · 사후 검증 |
| `agents/purge/r2-objects.ts` | 순수 — 객체 키 정규화 · 공유 판정 · HTTP 상태 분류 |
| `agents/purge/public-content-exec.ts` | 트랜잭션 실행 — **보호 재판정·CASCADE 계수를 트랜잭션 안에서** |
| `agents/purge/r2-client.ts` | R2 SigV4 · HEAD→DELETE→HEAD |
| `agents/coo/public-content-purge.ts` | **COO 핸들러** — 유일한 실행 입구 |
| `agents/cron/runner.ts` | `coo:public-content-purge` 등록 (LOCAL ONLY · 스케줄 미연결) |
| `docs/operations/data/2026-09-14-public-content-purge.csv` | 확정 대상 628행 (SHA 잠금) |
| `docs/operations/data/2026-09-14-public-content-purge-r2.txt` | R2 manifest **867키** (후보 전체 객체 · SHA 잠금) |

### 5-0. 🔴 TOCTOU — Serializable + 트랜잭션 내 재판정

트랜잭션은 **`isolationLevel: 'Serializable'`** 로 연다. 보호 조회와 삭제가 같은 스냅샷에서
일어나야, 조회 뒤 커밋 전에 들어온 댓글·Like·Scrap 이 무시되지 않는다.
기본 `ReadCommitted` 면 그 삽입을 못 보고 지워버린다.

직렬화 충돌(`P2034` · `could not serialize` · `deadlock detected`)은 **재시도하지 않는다.**
되돌릴 수 없는 삭제라 다시 미는 것보다 멈추는 편이 낫다. 그 시점 트랜잭션은 롤백됐다 = mutation 0.



preflight 에서 "사람 흔적 없음"을 확인하고 트랜잭션을 열기까지 수십 초가 뜬다.
그 사이 회원이 댓글·좋아요·스크랩을 남기면 **방금 참여한 흔적을 지우게 된다.**

그래서 최종 삭제 집합은 **트랜잭션 안에서** 다시 계산한다. 바깥 preflight 결과는
상한선일 뿐이고, 트랜잭션 안에서 줄어드는 건 정상, **늘어나면 ABORT** 다.
CASCADE 예상량도 같은 트랜잭션 안에서 확정한다.

보호 축은 **여섯**이다 — 실회원 작성 · 실회원 댓글 · 게스트 댓글 · 실회원 좋아요 ·
**실회원 댓글 공감** · 실회원 스크랩.

🔴 **댓글 공감**: `Like` 는 글에도 댓글에도 붙고(`postId` XOR `commentId`),
댓글 공감 행은 `postId` 가 **null** 이라 글 기준 조회에 안 잡힌다.
그래서 봇 댓글에 실회원이 공감을 눌러도 그 글이 지워졌다.
이제 `Like.commentId → Comment.postId` 경로를 preflight 와 트랜잭션 **양쪽에서** 읽는다.
`PostView` 와 새 `GuestLike` 는 주체를 알 수 없어 보호 근거가 아니다(창업자 결정).

**게스트 댓글 계약**: `guestNickname` **AND** `guestPasswordHash` 가 둘 다 있어야 한다.
닉네임만 있는 행은 비회원 댓글 계약을 만족하지 않으므로 사람 흔적으로 세지 않는다.

### 5-0-A. 🔴 익명화된 탈퇴 회원도 실제 회원이다

`cto:anonymize-withdrawn-apply` 가 30일 지난 WITHDRAWN 계정의 `providerId` 를
`withdrawn_<원본>` 으로 바꾼다. 숫자만 보고 판정하면 **익명화된 탈퇴 실회원이
봇으로 분류돼 그 사람의 글이 지워진다.** 접두사를 벗겨서 판정하되,
접두사만 믿지 않고 **`status=WITHDRAWN` 까지 함께 확인**한다.

### 5-0-B. drift 잠금 — 여섯 축 + 관측 1

`status` · `boardType` · `source` · `authorId` 해시 · `title` 해시 · `content` 해시.
`boardType` 은 전체 허용목록이 아니라 **ID 별 기대값**과 맞춘다.

`updatedAt` 은 **관측만** 한다. 실측(2026-09-14) 628건 중 3~4건이 CSV 생성 뒤
`updatedAt` 이 바뀌었는데 **본문 drift 0 · 제목 drift 0** 이었다. 원인은
`viewCount`·`likeCount`·`trendingScore` 비정규화 갱신이다. ABORT 축으로 두면
조회수가 오르는 것만으로 도구가 영영 못 돈다. 실제 편집은 본문·제목 해시가 잡는다.

### 5-0-C. 🔴 링크 판정은 경로 세그먼트 정확 비교다

`includes` 로 보면 안 된다. 그러면 `/community/abc1234` 가 `abc123` 에 걸리고,
`점심-뭐드세요-2` 가 `점심-뭐드세요` 에 걸리고, `?ref=<id>` 같은 query 도 걸리고,
`https://example.com/community/<id>` 같은 **남의 URL 도 걸린다.**
그 결과 엉뚱한 행의 `linkUrl` 을 null 로 지운다.

그래서 URL 을 파싱해 **호스트를 우리 사이트로 제한**하고,
**디코딩한 `pathname` 의 세그먼트와 정확히 일치**하는지만 본다.
query·fragment 는 애초에 보지 않는다. 퍼센트 인코딩된 한글 slug 는 디코딩 후 일치한다.

### 5-A-0. 🔴 실행 경로는 **하나**다

| 경로 | 되는가 | 근거 |
|---|---|---|
| GitHub Actions 스케줄 | ❌ | workflow 에 연결하지 않았다(`LOCAL ONLY`). 테스트로 고정 |
| `agents/cron/runner.ts coo public-content-purge` | ❌ | **실측**: `automation_status=PAUSED` 라 runner 가 스킵한다 → `[Runner] automation_status=PAUSED — coo:public-content-purge 실행 스킵` |
| **창업자 승인 후 COO 모듈 직접 실행** | ✅ | **유일한 실행 경로** |

즉 runner 등록은 "DB write 는 COO 만"이라는 소유권을 코드로 표시한 것이고,
실제 방아쇠는 사람이 당긴다. PAUSED 가 풀려도 스케줄에 없으므로 저절로 돌지 않는다.

```
# dry-run (write 0)
npx tsx agents/coo/public-content-purge.ts

# 실제 삭제 — 창업자 승인 후 1회
npx tsx agents/coo/public-content-purge.ts --execute --confirm=PURGE-PUBLIC-CONTENT-628

# 이미지만 재개
npx tsx agents/coo/public-content-purge.ts --execute --confirm=PURGE-PUBLIC-CONTENT-628 --r2-only
```

### 5-A-1. 완료 상태는 DB 와 R2 를 따로 본다

한 단어로 뭉치면 **이미지가 남았는데 done 이라고 말하게 된다.**

| 상태 | 뜻 | exit |
|---|---|---:|
| `DRY_RUN` | write 0 | 0 |
| `DB_COMPLETE_R2_PENDING` | DB 는 끝났지만 R2 자격증명 없음 / `UNCERTAIN>0` / `remaining>0` | **3** |
| `R2_COMPLETE` | DB 는 이미 끝나 있었고 이미지 정리를 마쳤다 | 0 |
| `FULLY_COMPLETE` | 둘 다 끝났다 | 0 |

`DB_COMPLETE_R2_PENDING` 을 0 으로 끝내면 아무도 이어서 돌리지 않는다. 그래서 3 이다.

### 5-A. 안전장치

- **Raw SQL·REST write 를 쓰지 않는다.** Prisma 트랜잭션만 쓴다.
- **DB write 는 COO 경로만.** 이전 판의 `PURGE_AGENT_ID` 환경변수 게이트는 **문자열 위장**이라 제거했다 — 아무나 값을 넣으면 통과했다. 이제 실행 코드가 `agents/coo/` 안에 있고 `agents/cron/runner.ts` 의 `coo:public-content-purge` 로 등록돼 있다.
- `agents/core/db.ts` 의 Prisma 만 쓴다(`agents/` → `src/` 런타임 import 금지 규칙 준수). DB 모듈은 **지연 로드**라 import 만으로는 연결하지 않는다.
- 기본 dry-run. `--execute` **와** `--confirm=PURGE-PUBLIC-CONTENT-628` 이 **둘 다** 있어야 쓴다.
- 확정 CSV **전체 SHA-256** 검증 — `35f1130ecfdca6e3a4b34bc8fbe0f066b977a5f24026622c735344e153cde70d`
- 실행 직전 재검사: 무결성 → 정합성 → 보존 교집합 → 권한 → 재실행 상태 → drift → 보호 신호.
- 하나라도 불일치하면 **mutation 0 상태에서 ABORT**.
- 영향 행 수가 기대와 다르면 즉시 실패 · 부분 삭제 커밋 없음.
- 로그에 ID·제목·본문·개인정보를 쓰지 않는다 — `post#<10자 지문>` 과 집계만.

### 5-B. 재실행

남은 후보 수로 판정한다. 전건 남아 있으면 `NOT_STARTED`, 전건 없으면 `COMPLETE`(할 일 없음),
**섞여 있으면 `PARTIAL` 이고 자동으로 이어서 지우지 않는다** — 사람이 봐야 한다.

---

## 6. dry-run 결과 (2026-09-14 · write 0)

```
확정 CSV 628행 · R2 manifest 867키 — 무결성 통과
보존 경계 218건 (기대 218)
계획 이슈: 0건
재실행 판정: NOT_STARTED (남은 후보 628/628)
drift 이슈: 0건
  (관측 37건 — 막지 않음: updatedAt 만 바뀐 글. 본문·제목은 동일)
삭제 후보 628건 · 보호 자동 제외 0건
boardType: {"JOB":141,"HUMOR":127,"MAGAZINE":262,"STORY":89,"LIFE2":7,"WEEKLY":2}
── semantic 평문 참조 ──
  VoteEvent.linkedPostId              0  BLOCK
  Event.bodyPostId                    0  BLOCK
  User.firstGreetingPostId            0  CLEANUP
  NaverBlogQueue.magazinePostId      15  CLEANUP
  SocialPost.sourcePostId             9  CLEANUP
  SocialPost.linkUrl                  5  CLEANUP
  ChannelDraft.linkUrl               97  CLEANUP
  AdminAuditLog.targetId              7  PRESERVE
── R2 보호 판정 ── manifest 867 · 살아 있는 참조로 보호 867 · 삭제 후보 0
   (미리보기 — 삭제 후 기준: 보호 0 · R2 삭제 후보 867)
── R2 (dry-run) ── manifest 867키 · 삭제 0
상태: DRY_RUN
```

### 6-0. R2 수치는 두 시점으로 읽는다

| 시점 | 보호 | R2 삭제 |
|---|---:|---:|
| **실행 전** (후보 628건이 아직 살아 있다) | **867** | **0** |
| **DB 삭제 후 예상** | **0** | **867** |

실행 전 보호 867 은 후보 글 자신이 자기 이미지를 참조하기 때문이다 — 정상이다.
`updatedAt` 관측 37건은 `viewCount`·`likeCount`·`trendingScore` 비정규화 갱신이며
본문·제목 drift 는 0 이다(§5-0-B).

## 6-A. semantic 평문 참조 — 정책과 잔존 이유

| 모델·필드 | 건수 | 정책 | 왜 |
|---|---:|---|---|
| `VoteEvent.linkedPostId` | 0 | **BLOCK** | 살아 있으면 이벤트가 깨진다 — mutation 전 ABORT |
| `Event.bodyPostId` | 0 | **BLOCK** | 같은 이유 |
| `User.firstGreetingPostId` | 0 | CLEANUP | 글이 사라지면 무효한 포인터 → `null` |
| `NaverBlogQueue.magazinePostId` | **15** | CLEANUP | `naver-blog:post` 는 2026-06-04 ARCHIVED — **소비자 없는 dead queue** |
| `SocialPost.sourcePostId` | **9** | CLEANUP | 출처 포인터 무효 → `null` |
| `SocialPost.linkUrl` | **5** | CLEANUP | 404 가 될 링크 → `null` (경로 매칭으로 찾는다) |
| `ChannelDraft.linkUrl` | **97** | CLEANUP | 404 가 될 홍보 초안 링크 → `null` |
| `AdminAuditLog.targetId` | **7** | **PRESERVE** | **감사 기록이다.** 대상이 사라져도 "무엇에 무슨 조치를 했는지"는 남아야 한다 |

`BLOCK` 은 트랜잭션 안에서도 다시 센다 — preflight 이후 이벤트가 생겨도 막힌다.

---

## 7. 사후 검증 계획 (실행 배치에서 수행)

### 7-A. DB

CLI 가 이 검사를 **통과해야만** `done` 을 출력한다. 하나라도 어긋나면 ABORT 한다.

- [ ] **실제로 지운 ID** 잔량 **0** — 후보 628 이 아니라 `deletedIds` 기준이다.
      보호 제외가 생긴 실행에서는 후보가 남는 게 **정상**이라 후보 기준으로 보면 오판한다.
- [ ] 보호 제외한 글은 **전건 그대로 살아 있다**(`protectedRemaining`)
- [ ] 보존 대상 **218 → 218** 동일
- [ ] 실회원 글·실회원 댓글 총량 **전후 동일**
- [ ] **삭제한 글 기준 자식 행 잔량 0** — 차분이 아니다.
      이전 계약(`before=후보 전체` − `after=deletedIds`)은 집합이 달라서,
      보호 제외가 한 건이라도 생기면 그 글의 자식 행이 "안 지워진 것"으로 잡혀
      멀쩡한 실행이 실패했다. 보호된 글의 자식은 **남아 있는 게 맞다**.
      기대값은 트랜잭션이 확정한 cascade 계수로 기록한다
- [ ] `Notification.postId` 고아 0 · `WaveQueue` 잔재 0
- [ ] **semantic 8종 전부** 확인 — BLOCK·CLEANUP 은 0, `AdminAuditLog` 는 남아 있어야 정상.
      한 축이라도 안 보면 `SEMANTIC_NOT_CHECKED` 로 잡힌다

### 7-B. 노출면

- [ ] 대표 삭제 URL **404 또는 410**
- [ ] 대표 보존 URL **200**
- [ ] `sitemap.xml` 에서 삭제 URL 제거
- [ ] `/` · `/community` · `/magazine` · `/jobs` · `/api/health` · `/api/health/auth` 정상

### 7-C. 캐시 — hard delete 는 기존 경로로 다 못 지운다

**정정**: 이전 판은 `POST /api/admin/revalidate-deleted` 가 동작한다고 썼다. **반만 맞다.**

그 엔드포인트는 `status IN (DELETED, HIDDEN)` 인 **행을 읽어서** 경로를 만든다.
hard delete 후에는 그 행이 없으므로 **628개 상세 경로의 `revalidatePath` 는 돌지 않는다.**

돌기는 도는 것도 있다. 마지막의 전역 태그 무효화는 행과 무관하게 실행된다:
`sitemap-posts` · `post-detail` · `post-meta` · `community-board-page` ·
`home-trending`/`stories`/`humor` · `jobs-list` · `home-jobs` · `job-detail`.
→ **sitemap 과 목록·홈·상세 데이터 캐시는 이걸로 비워진다.**

남는 것은 **삭제된 글 상세 URL 의 라우트 ISR 경로 캐시**뿐이다.

확정한 방법 (새 공개 무인증 API 를 만들지 않는다):

1. 삭제 **직전에** CLI 가 628개 상세 경로를 파일로 뽑는다(보드별 prefix + id/slug).
2. 삭제 후 어드민 세션으로 `POST /api/admin/revalidate-deleted` 를 1회 호출한다
   → 전역 태그가 비워져 **sitemap 에서 즉시 빠진다.**
3. 상세 경로 ISR 은 **재배포로 무효화한다.** Vercel 배포는 라우트 캐시를 새로 만든다.
   추가 배포가 싫으면 ISR 만료(`revalidate 300`)를 기다린다 — 최대 5분이다.
4. 검증은 §7-B 로 한다. 대표 삭제 URL 이 **404/410**, 보존 URL 이 **200**,
   `sitemap.xml` 에 삭제 URL 이 **0건**이어야 통과다.

**캐시 지연은 롤백 사유가 아니다.** 다만 위 검증을 통과하기 전에는 done 이라고 쓰지 않는다.

### 7-D. 검색 노출

**검색 노출 감소는 감수한다**(창업자 결정). 네이버 색인 수 하락을 장애로 보지 않는다.

---

## 8. 이번 배치에서 하지 않은 것

- production DB write **0건**
- R2 객체 삭제 **0건**
- merge · 배포 **0건**
- 행별 문구 검토 · 추가 사업 판단 요청 **0건**
