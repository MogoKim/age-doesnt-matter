# 공개 콘텐츠 REVIEW 650건 — 2차 분류

> **read-only 분류다. 이 배치에서 콘텐츠 상태를 바꾸지 않았다.**
> DB write · Post 상태 변경 · HIDE/DELETE 실행 · migration **0건**.
>
> 기준 main `ef1a93f5` · 측정 2026-09-11 · 모수는 1차 분류의 `verdict=REVIEW` **650건**
> 선행: [`2026-09-11-public-content-disposition.md`](./2026-09-11-public-content-disposition.md)
> 전건 표: [`data/2026-09-11-review-tier2.csv`](./data/2026-09-11-review-tier2.csv) (650행 · 20열, **비식별**)
>
> 🔒 작성자 ID·닉네임·이메일·`providerId`·전화번호·**글 본문**을 문서와 CSV 어디에도 적지 않았다.
> 계정은 **형태 계층**으로만 분류했다.

---

## 0. 합계 검증

| | 건수 |
|---|---:|
| 1차 REVIEW | **650** |
| 갈래 A (`source=USER` 비실회원) | **19** |
| 갈래 B (나머지 non-USER) | **631** |
| **A + B** | **650** ✅ |

조치축(`recommendedAction`) 합계도 **650** 으로 일치한다(§3).

---

## 1. 축을 둘로 나눈다 — 보호축과 조치축

이 표의 핵심 구조다. **"보호할 것인가"와 "무엇을 고칠 것인가"는 다른 질문이다.**

| 축 | 컬럼 | 뜻 |
|---|---|---|
| **보호축** | `humanTrace` | 사람이 남긴 흔적이 있는가. **true 면 HIDE/DELETE 대상이 아니다** |
| **조치축** | `recommendedAction` | 이 글에 필요한 조치가 무엇인가 |

**둘은 양립한다.** 사람 흔적이 있는 글이라도 SEO 문구는 고쳐야 할 수 있다 —
실제로 `humanTrace=true` 이면서 `REWRITE_BRAND_COPY` 인 글이 **1건** 있다.
보호받는다고 해서 고칠 게 없다는 뜻이 아니고, 고칠 게 있다고 해서 내려도 된다는 뜻이 아니다.

---

## 2. 보호축 — `humanTrace` 32건

### 2-1. 게스트 댓글 계약으로 재판정했다

🔴 **`Comment.authorId = NULL` 을 전부 비인간으로 취급하면 안 된다.**
현재 게스트 댓글 계약은 `guestNickname` **AND** `guestPasswordHash` 가 함께 있는 것이다
(`prisma/schema.prisma` `model Comment`). 이 계약으로 갈래 B 의 살아있는 댓글 **911건**을 다시 갈랐다.

| 구분 | 건수 | 판정 |
|---|---:|---|
| 계정 작성 — 봇/시드(`bot-*` 886 · `curator-*` 15) | **901** | 비인간 |
| **정상 게스트**(`guestNickname` + `guestPasswordHash`) | **10** | **사람** |
| `authorId=NULL` 인데 게스트 계약 미충족 | **0** | — |

정상 게스트 댓글이 달린 글은 **10건**이다.

### 2-2. 사람 흔적 합집합

| 축 | 글 수 |
|---|---:|
| 비회원 공감(`guestLikeCount` > 0) | 25 |
| 정상 게스트 댓글(`guestCommentCount` > 0) | 10 |
| **합집합 (갈래 B)** | **31** |
| 갈래 A 중 사람 흔적 | 1 |
| **`humanTrace=true` 총계** | **32** |

내역: 공감만 22 · 댓글만 6 · 둘 다 4 (갈래 B 기준 31).

**`humanTrace=true` 32건은 HIDE/DELETE 대상으로 분류하지 않았다.**
검증: `humanTrace=true` 이면서 `KEEP_NOINDEX`/`PROPOSE_NOINDEX` 인 행 **0건**.

### 2-3. 이 재판정이 실제로 바꾼 것

1차 분류에서 `NOINDEX_OR_HIDE` 로 묶였던 **ADMIN/STORY 232자 글**은
**정상 게스트 댓글 1건**이 달려 있었다. 이 배치에서 `humanTrace=true` → `PRESERVE` 로 보호됐다.
계약 기반으로 다시 보지 않았다면 색인면에서 내릴 후보로 남았을 글이다.

---

## 3. 조치축 — `recommendedAction`

| 조치 | 건수 | 뜻 |
|---|---:|---|
| **PRESERVE** | **278** | 보존. 사람 흔적 또는 검색 자산 |
| **KEEP_NOINDEX** | **153** | 🔴 **이미 Google noindex 다. 신규 실행 작업이 아니다** |
| **MANUAL_REVIEW** | **159** | 사람 판단 필요 |
| **REWRITE_BRAND_COPY** | **59** | 우나어가 쓴 SEO 카피의 금지 표현 정정 |
| **REWRITE_AUTO_COMPOSED** | **1** | 자동 조합 description |
| **PROPOSE_NOINDEX** | **0** | 아래 §3-2 |
| **합계** | **650** ✅ | |

### 3-1. 🔴 HIDE 는 이 표가 권고하지 않는다

**어떤 행에도 HIDE 를 권고하지 않았다.** 1차 분류의 혼합 라벨 `NOINDEX_OR_HIDE` 는 제거했다.
둘은 위험도가 다른 별개 조치다:

| | 범위 | 되돌리기 | 네이버 영향 |
|---|---|---|---|
| **Google noindex** | 구글 색인만 | 쉬움 | **없음**(`sitemap`·`robots`·일반 `<meta robots>` 무변경) |
| **HIDE** | 사이트 공개면 + 네이버 포함 전 채널 | 어려움 | **직접 타격** |

HIDE 는 **별도 고위험 결정**이며, 그 결정을 할 때 `humanTrace=true` **32건은 대상에서 제외**한다.

### 3-2. `currentlyGoogleNoindex` — 이미 적용된 상태와 신규 작업을 구분한다

`shouldGoogleNoindexCommunityPost`(`src/lib/seo/community-google-noindex.ts`, 순수 함수)를
그대로 재현해 650건의 **현재 상태**를 판정했다.

| | 건수 |
|---|---:|
| `currentlyGoogleNoindex = true` | **180** |
| `currentlyGoogleNoindex = false` | **470** |

1차 분류의 `NOINDEX_OR_HIDE` **152건**을 이 정책으로 다시 보면:

| | 건수 |
|---|---:|
| **이미 noindex** | **151** |
| 아직 index | **1** (ADMIN/STORY 232자) |

그 1건은 §2-3 대로 **게스트 댓글이 있어 `PRESERVE` 로 보호**됐다.
그래서 `PROPOSE_NOINDEX` 는 **0건**이다 — **정책과 어긋나 새로 내려야 할 글이 없다.**

⚠️ **이미 noindex 인 153건을 "할 일"로 보고하지 않는다.** 이미 적용된 상태다.

### 3-3. REWRITE 60건 — 금지 표현의 출처

| 출처 | 건수 |
|---|---:|
| **BRAND_COPY** (`seoTitle`/`seoDescription` = 우나어가 쓴 카피) | **59** |
| SOURCE_TITLE 전용 (원문 제목만) | **0** |
| AUTO_COMPOSED | **1** |

JOB 55건 분해: 원문 title 직함 10 · description 에만 45 · 둘 다 9 ·
그 description 이 `seoDescription` 필드 유래 **54/55**.

🔴 **1차 분류 문서의 "55건이 외부 공고 공식 직함" 서술은 틀렸다.**
production 표본에서 확인된 실제 문구는 `어르신 모시는 보람 있는 일` 같은 **우나어 마케팅 카피**다.
"외부 원문이라 손댈 수 없다"는 근거는 성립하지 않는다.

---

## 4. 갈래 A — `source=USER` 비실회원 19건 (고유 계정 8개)

| 분류 | 건수 | 근거 | 조치 |
|---|---:|---|---|
| **SEED_BOT** | **18** | `seed-` 접두어 · email 없음 · 2026-03 생성. 시드봇(A05, **ARCHIVED 2026-09-09**)의 가상 페르소나 | MANUAL_REVIEW |
| **WITHDRAWN_REAL_MEMBER** | **1** | 아래 §4-1 | **PRESERVE** |
| FOUNDER_PERSONA / UNKNOWN | 0 / 0 | 증거로 전부 설명됨 | — |

### 4-1. 탈퇴 회원 SSoT — 활성 지표와 콘텐츠 출처 판정을 분리한다

`withdrawn_` 접두어는 **우리가 붙인 값**이다:

```
agents/scripts/anonymize-withdrawn-users.ts:38
  providerId: `withdrawn_${u.providerId}`,
```

F-12 **30일 경과 탈퇴자 PII 익명화**가 `providerId` 를 덮어쓴다.
그래서 실회원 SSoT(`providerId` 순수 숫자)를 **사후적으로** 통과하지 못한다.

**두 판정을 분리한다:**

| 판정 | 정의 | 이 배치의 처리 |
|---|---|---|
| **활성 실회원 지표**(R8 회원 소생) | `providerId` 순수 숫자 **AND** `role ≠ ADMIN` | **기존 정의 유지.** 탈퇴자는 활성 회원이 아니므로 여기 들어가면 안 된다 |
| **콘텐츠 출처 판정**(이 문서) | 글을 누가 썼는가 | **검증된 `withdrawn_` 익명화 계정을 봇으로 취급하지 않는다** |

검증 기준(둘 다 충족해야 익명화 계정으로 인정):
`providerId` 가 `withdrawn_` 접두어 **AND** `User.status = WITHDRAWN`.
해당 1건은 `signupSource = WEB` 이며 본문 **13자 가입 인사글**이다.

> 이 규칙이 없으면 **과거 실회원이 쓴 글이 봇 글로 분류되어 처분 대상이 된다.**

---

## 5. JOB 채용 공고 — 만료 판정이 왜 자동화되지 않는가

🔴 **"만료 필드가 없다"는 이전 서술은 틀렸다.** `JobDetail.expiresAt` 은 **존재한다.**

```
prisma/schema.prisma  model JobDetail
  expiresAt  DateTime?
  @@index([expiresAt])
```

실측(REST exact count):

| | 건수 |
|---|---:|
| 공개 JOB 글 | **191** |
| 그 `JobDetail` 매칭 | **191** |
| `expiresAt` **NULL** | **191 (전건)** |
| `expiresAt` NOT NULL | **0** |
| 전체 `JobDetail` 중 `expiresAt` NULL | 340 / 340 |

그리고 **공개 조회가 이 필드를 적용하지 않는다.**
`getJobDetailPublic`(`src/lib/queries/posts/posts.jobs.ts:249`)의 where 는
`{ id, status: 'PUBLISHED', boardType: 'JOB' }` 뿐이고 `expiresAt` 을 읽지도 거르지도 않는다
(`select` 에도 없다).

→ **필드는 있으나 채워진 적이 없고 소비되지도 않는다.** 그래서 만료 여부를 데이터로 판정할 수 없다.
발행 경과는 중앙값 **80일** · 90일 초과 **67건**이다. 이것만 사실로 남긴다.

---

## 6. 측정하지 못한 것 (추정하지 않았다)

- **검색 유입** — Search Console 이 필요하다. `post_view` 로 대체하지 않았다.
  `post_view` 는 "사람이 글을 열었다"이지 "검색으로 들어왔다"가 아니다.
- **JOB 공고의 실제 유효성** — §5.
- **`seed-` 계정의 원 소유 주체** — 계정 형태로 시드봇임은 확정했으나 그 이상은 증거가 없다.

### 6-1. `slug` NULL 236건 — 결함으로 단정하지 않는다

공개 글 **236건**에 `slug` 가 없다(JOB **191건 전부** · MAGAZINE 28 · MENOPAUSE 9 · STORY 6 · WEEKLY 2).

이것은 **설계 사실**이다 — JOB 은 `/jobs/{cuid}` 경로를 쓰고 `slug` 를 만들지 않는다.
**결함이라고 단정할 근거가 이 배치에 없다.** 확인해야 할 것은 셋이고, 모두 **확인 대기**다:

| 확인 대상 | 상태 |
|---|---|
| route 가 `slug` 없이 정상 동작하는가 | 표본 200 확인 · 전수 미확인 |
| `canonical` 이 정본 URL 을 가리키는가 | **미확인** |
| `sitemap` 에 포함되는가 | **미확인**(sitemap 859 URL 과의 대조 안 함) |

---

## 7. 창업자 결정이 필요한 항목

| # | 항목 | 선택지 |
|---|---|---|
| **1** | **REWRITE_BRAND_COPY 59건 정정 범위** — 브랜드 규칙 직접 위반 | 전면 정정 / 단계적 |
| **2** | REWRITE 중 원문 공식 직함 부분(title 10건) | 원문 보존 / 치환 |
| **3** | MANUAL_REVIEW 159건(JOB 131 포함) 기준 수립 | 공고 만료 기준 · `expiresAt` 운영 시작 여부 |
| **4** | PRESERVE 278건 확정 여부 | 보존 확정 / 추가 관찰 |
| **5** | **SEED_BOT 18건** — `source=USER` 로 남아 회원 글처럼 보인다 | 그대로 / source 표기 정정 / 비공개 |
| **6** | **HIDE 를 검토할지 여부** — 별도 고위험 결정 | 검토 시 `humanTrace=true` 32건 제외가 전제 |
| 7 | `slug` NULL 236건 영향 확인 착수 | canonical·sitemap 대조 |

**결정 전까지 실행하지 않는다.**

---

## 8. 재현 방법

Supabase REST **GET only**. write 경로가 없다.

1. `GET /rest/v1/Post?status=eq.PUBLISHED` · `/JobDetail` · `/User`
2. `GET /rest/v1/Comment` — `guestNickname` + `guestPasswordHash` 동시 존재로 게스트 판정
3. `GET /rest/v1/GuestLike` — 비회원 공감
4. `GET /rest/v1/EventLog?eventName=eq.post_view&isBot=eq.false&createdAt=gte.{30일 전}`
5. `shouldGoogleNoindexCommunityPost` 를 그대로 재현해 `currentlyGoogleNoindex` 판정
6. production `generateMetadata` 3분기로 SEO title/description 재구성 → 금지 표현 출처 분리
7. 보호축(`humanTrace`)과 조치축(`recommendedAction`)을 **따로** 계산

---

## 9. 이 배치에서 하지 않은 것

- production DB write · Post 상태 변경 · HIDE/DELETE 실행 · migration — **0건**
- env · workflow · launchd 변경 — **0건**
- 개인정보·식별자·**본문 인용** 커밋 — **0건**
- 자동 생성·가짜 회원 활동 복구 — **하지 않았다**
