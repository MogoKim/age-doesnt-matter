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

## 1. 축을 셋으로 나눈다

**"보호할 것인가" · "무엇을 고칠 것인가" · "지금 구글 색인 상태가 어떤가"는 서로 다른 질문이다.**

| 축 | 컬럼 | 뜻 |
|---|---|---|
| **보호축** | `protectedFromHideDelete` | **HIDE/DELETE 대상에서 제외**한다 |
| **조치축** | `recommendedAction` | 이 글에 필요한 조치 |
| **상태축** | `currentlyGoogleNoindex` | **현재** Google 색인 제외 상태인가(조치가 아니라 사실) |

**셋은 양립한다.** 보호받는 글이라도 SEO 문구는 고쳐야 할 수 있다 —
실제로 `protectedFromHideDelete=true` 이면서 `REWRITE` 인 글이 **1건** 있다.
보호는 **공개 상태**를 지키는 것이고, REWRITE 는 **문구**를 고치는 것이다. 둘은 충돌하지 않는다.

## 2. 보호축 — `protectedFromHideDelete` 32건

### 2-1. 🔴 `GuestLike` 는 사람 흔적이 아니다

`GuestLike` 가 가진 것은 `ipHash`(SHA-256, 역산 불가)와 `cookieId`(nanoid) **뿐**이다
(`prisma/schema.prisma` `model GuestLike`). **챌린지도 인증도 없다.**
따라서 **행위 주체가 사람인지 자동화인지 판별할 수 없다.**

> 이 판정은 기존 정본과 어긋나지 않는다. `MASTER-OPERATING-SYSTEM.md` §8 과
> `2026-09-10-naver-cafe-purge-facts.md` 도 `GuestLike` 를 "게스트 공감"으로만 적고
> **"실회원 공감 포함 여부는 알 수 없다"** 고 명시한다. 이 문서는 그 유보를 그대로 잇는다.

**그럼에도 보호 신호에는 포함한다.** 판별할 수 없다는 것은 "사람이 아니다"가 아니다.
지우면 되돌릴 수 없으므로 **보수적으로 보호**한다.

### 2-2. 세 축을 분리한다

| 축 | 컬럼 | 글 수 | 뜻 |
|---|---|---:|---|
| **a. 보호 대상** | `protectedFromHideDelete` | **32** | HIDE/DELETE 대상에서 제외 |
| **b. 검증된 사람** | `verifiedHumanContentOrComment` | **11** | Turnstile 게스트 댓글 글 **10** + 익명화된 탈퇴 실회원 글 **1** |
| **c. 익명 반응** | `anonymousGuestLike` | **26** | `GuestLike` 존재. **행위 주체 판별 불가** |

b 와 c 의 교집합 5건, 합집합이 a 32건이다.

**b 만 "사람"이라고 말할 수 있다.** 게스트 댓글은 Turnstile 챌린지를 통과해야 작성되고
(`GuestCommentInput`), 익명화 탈퇴 회원은 카카오 가입 이력이 있다.
**c 26건은 "익명 반응이 있었다"까지만 말한다.**

### 2-3. 이 재판정이 실제로 바꾼 것

1차에서 `NOINDEX_OR_HIDE` 로 묶였던 **ADMIN/STORY 232자 글**에는
**Turnstile 게스트 댓글 1건**이 달려 있었다 → `verifiedHumanContentOrComment=true` → 보호.
계약 기반으로 다시 보지 않았다면 색인면에서 내릴 후보로 남았을 글이다.

## 3. 조치축 — `recommendedAction`

| 조치 | 건수 | 뜻 |
|---|---:|---|
| **PRESERVE** | **31** | 보호 대상이면서 문구 수정도 불필요 |
| **PRESERVE_CANDIDATE** | **247** | BOT 매거진 장문 — **확정 보존이 아니다**(§3-4) |
| **KEEP_NOINDEX** | **153** | 🔴 **이미 Google noindex 다. 신규 실행 작업이 아니다** |
| **MANUAL_REVIEW** | **159** | 사람 판단 필요 (그중 JOB **136** — §5) |
| **REWRITE_BRAND_COPY** | **50** | 우나어가 쓴 SEO 카피의 금지 표현 정정 · **적용 대상**(`applyEligible=true`) |
| **BRAND_COPY_PARTIAL_HOLD_REVIEW** | **1** | 정정안은 있으나 **미승인 금지 표현이 남아** 적용 대상에서 제외 |
| **BRAND_COPY_HOLD_REVIEW** | **4** | 우나어 카피지만 **대체어 확정 불가** → 치환 보류, 사람 검토 |
| **OFFICIAL_NAME_ONLY_REVIEW** | **3** | 금지 표현이 **정부 공식 제도명**(`노인일자리사업`)뿐 → 전건 보존 |
| **SOURCE_TITLE_ONLY_REVIEW** | **1** | 금지 표현이 **원문 공고 제목 복사 구간**에만 → 수정 필드 없음 |
| **REWRITE_AUTO_COMPOSED** | **1** | 자동 조합 description |
| **PROPOSE_NOINDEX** | **0** | §3-2 |
| **HIDE / DELETE** | **0** | **이 표는 어떤 행에도 권고하지 않는다**(§3-1) |
| **합계** | **650** ✅ | |

**보호축 × 조치축 교차** — 모순 0:

| 조치 | protected | 비보호 |
|---|---:|---:|
| PRESERVE | **31** | 0 |
| REWRITE_AUTO_COMPOSED | **1** | 0 |
| PRESERVE_CANDIDATE | 0 | 247 |
| KEEP_NOINDEX | 0 | 153 |
| MANUAL_REVIEW | 0 | 159 |
| REWRITE_BRAND_COPY | 0 | 50 |
| BRAND_COPY_PARTIAL_HOLD_REVIEW | 0 | 1 |
| BRAND_COPY_HOLD_REVIEW | 0 | 4 |
| OFFICIAL_NAME_ONLY_REVIEW | 0 | 3 |
| SOURCE_TITLE_ONLY_REVIEW | 0 | 1 |

보호 32 = PRESERVE 31 + REWRITE_AUTO_COMPOSED 1. **보호와 문구 수정이 양립하는 1건**이 여기 있다.

### 3-1. 🔴 HIDE 는 이 표가 권고하지 않는다

**어떤 행에도 HIDE 를 권고하지 않았다.** 1차 분류의 혼합 라벨 `NOINDEX_OR_HIDE` 는 제거했다.
둘은 위험도가 다른 별개 조치다:

| | 범위 | 되돌리기 | 네이버 영향 |
|---|---|---|---|
| **Google noindex** | 구글 색인만 | 쉬움 | **없음**(`sitemap`·`robots`·일반 `<meta robots>` 무변경) |
| **HIDE** | 사이트 공개면 + 네이버 포함 전 채널 | 어려움 | **직접 타격** |

HIDE 는 **별도 고위험 결정**이며, 그 결정을 할 때 `protectedFromHideDelete=true` **32건은 대상에서 제외**한다.

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

### 3-2-b. `currentlyGoogleNoindex=true` 180건 × 조치 교차표

**조치축은 색인 상태를 바꾸지 않는다.** `PRESERVE`·`REWRITE` 는 **콘텐츠 공개 상태와 문구**에 관한 것이고,
**기존 Google noindex 를 자동 해제한다는 뜻이 아니다.** 오독을 막기 위해 교차표를 남긴다.

| 조치 | noindex=true 중 |
|---|---:|
| KEEP_NOINDEX | **153** |
| PRESERVE | **22** |
| MANUAL_REVIEW | **4** |
| REWRITE_AUTO_COMPOSED | **1** |
| **소계** | **180** |

즉 **보호 대상 22건과 판단 대기 4건도 이미 noindex 상태다.** 보호한다고 색인이 켜지지 않는다.
색인 상태를 바꾸려면 `shouldGoogleNoindexCommunityPost` 의 입력(본문 분량·주제·source)이 바뀌어야 한다.

### 3-4. 🔴 `PRESERVE_CANDIDATE` 247건 — 확정 보존이 아니다

이전 판은 이 247건을 `PRESERVE` 로 묶고 "검색 자산"이라 적었다. **과대 확정이었다.**

이 247건이 가진 근거는 **`source=BOT` · `boardType=MAGAZINE` · 본문 1,000자 이상** 뿐이다.

| 축 | 247건 값 |
|---|---:|
| 30일 비봇 실조회 | **0** |
| 실회원 댓글·공감·신고 | **0** |
| 익명 공감(`GuestLike`) | **0** |
| 검색 유입 | **미측정**(§6) |

**분량은 가치의 증거가 아니다.** 자동 생성 장문일 수 있고, 그것을 구분할 데이터가 지금 없다.
그래서 `PRESERVE_CANDIDATE` 로 되돌렸다 — **보존 후보이지 보존 확정이 아니다.**
확정하려면 검색 유입 측정이 선행돼야 한다.

### 3-3. REWRITE 60건 — 금지 표현의 출처

| 출처 | 건수 |
|---|---:|
| **BRAND_COPY** (`seoTitle`/`seoDescription` = 우나어가 쓴 카피) | **59** |
| SOURCE_TITLE 전용 (원문 제목만) | **0** |
| AUTO_COMPOSED | **1** |

> 🔄 **2026-09-11 재분해.** 위 59건을 **출현 위치 단위**로 다시 판정한 결과
> 실제 **적용 대상은 50건**이고 나머지 9건은 보존 또는 판단 보류다.
> `REWRITE_BRAND_COPY 50`(`applyEligible=true`) · `BRAND_COPY_PARTIAL_HOLD_REVIEW 1` ·
> `BRAND_COPY_HOLD_REVIEW 4` · `OFFICIAL_NAME_ONLY_REVIEW 3` · `SOURCE_TITLE_ONLY_REVIEW 1`.
> HOLD 계열 합 **5**. 근거·전건 표:
> [`2026-09-11-seo-brand-copy-rewrite.md`](./2026-09-11-seo-brand-copy-rewrite.md)
> (`PROPER_NOUN_EXACT` 는 **0** — 상호에 금지어가 있는 24건과 상호를 인용한 9건의 **교집합이 0**이다).

JOB 55건 분해: 원문 title 직함 10 · description 에만 45 · 둘 다 9 ·
그 description 이 `seoDescription` 필드 유래 **54/55**.

🔴 **1차 분류 문서의 "55건이 외부 공고 공식 직함" 서술은 틀렸다.**
production 표본에서 확인된 실제 문구는 `어르신 모시는 보람 있는 일` 같은 **우나어 마케팅 카피**다.
"외부 원문이라 손댈 수 없다"는 근거는 성립하지 않는다.

---

## 4. `source=USER` 비실회원 **22건 전체** — 정체 종결

이전 판은 REVIEW 에 포함된 **19건**만 봤다. 1차에서 `PRESERVE` 로 확정된 **3건**까지 합쳐
**22건 전체**를 작성자 계정과 다시 대조했다.

| | 건수 |
|---|---:|
| **시드 계정 글** | **21** |
| **익명화된 탈퇴 실회원 글** | **1** |
| **합계** | **22** ✅ |

- 시드 계정은 **고유 7개**다(22건을 7개 계정이 나눠 썼다).
- 1차에서 빠져 있던 **3건의 작성자는 전부 기존 19건의 시드 계정 집합과 동일**하다 — 신규 계정 없음.
  그 3건은 `PRESERVE`(사람 흔적 또는 실조회)로 확정돼 있었고 **콘텐츠 보호 상태를 그대로 유지**한다.
- 🔴 다만 **`source` 정합성 문제는 남는다**: 시드봇 가상 페르소나 글 21건이 `source=USER` 로 남아
  공개 면에서 **회원 글처럼 보인다.** 이것은 보호 여부와 별개 축이며 §7-5 결정 사항이다.
- boardType 분해(22건): STORY 9 · JOB **5** · HUMOR 4 · WEEKLY 2 · MAGAZINE 2

이 문서의 2차 분류 모수(650)에는 그중 **19건**만 들어온다 — 나머지 3건은 1차에서 이미 확정됐기 때문이다.

| 2차 모수 내 분류(19건) | 건수 | 조치 |
|---|---:|---|
| **SEED_BOT** | **18** | MANUAL_REVIEW |
| **WITHDRAWN_REAL_MEMBER** | **1** | **PRESERVE** |

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

## 5. JOB 채용 공고 — 수치와 만료 판정

### 5-1. JOB 총계 구분

| | 건수 |
|---|---:|
| 공개 JOB 글 전체 | **191** |
| 이 문서 모수(650) 안의 JOB | **191** |
| └ 갈래 B JOB | 186 |
| └ 갈래 A(시드 계정) JOB | **5** |
| **`MANUAL_REVIEW` 인 JOB** | **136** = 갈래 B **131** + 갈래 A **5** |
| `REWRITE_BRAND_COPY` 계열 JOB | 55 = **적용 대상 50** · 부분 보류 **1** · 치환 보류 **3** · 원문 제목 전용 **1** |

⚠️ **"MANUAL_REVIEW 159건(JOB 131 포함)" 은 틀린 표기다.** MANUAL_REVIEW 안의 JOB 은 **136**이다.

### 5-2. 만료 판정이 자동화되지 않는 이유

🔴 **"만료 필드가 없다"는 서술은 틀렸다.** `JobDetail.expiresAt` 은 **존재한다.**

```
prisma/schema.prisma  model JobDetail
  expiresAt  DateTime?
  @@index([expiresAt])
```

실측(REST exact count):

| | 건수 |
|---|---:|
| 공개 JOB 글 / `JobDetail` 매칭 | 191 / **191** |
| `expiresAt` **NULL** | **191 (전건)** |
| `expiresAt` NOT NULL | **0** |
| 전체 `JobDetail` 중 NULL | 340 / 340 |

그리고 **공개 조회가 이 필드를 적용하지 않는다.**
`getJobDetailPublic`(`src/lib/queries/posts/posts.jobs.ts:249`)의 where 는
`{ id, status: 'PUBLISHED', boardType: 'JOB' }` 뿐이고 `expiresAt` 을 읽지도 거르지도 않는다.

→ **필드는 있으나 채워진 적이 없고 소비되지도 않는다.** 그래서 만료를 데이터로 판정할 수 없다.
발행 경과 중앙값 **80일** · 90일 초과 **67건** — 이것만 사실로 남긴다.

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
| **1** | **REWRITE_BRAND_COPY 50건 정정 적용 여부** — 정정안 작성 완료(DB write 미실행, fail-closed 절차 명세됨) | 적용 / 단계적 / 보류 |
| **2** | REWRITE 중 원문 공식 직함(title 10건) | 원문 보존 / 치환 |
| **2-b** | **보류 5건**(HOLD 계열) — `실버타운` 1(대체어 부재) + 상호 부분 일치 4. 그중 1건은 제안문이 있으나 **적용 제외** | 현행 유지 / 개별 판단 |
| **3** | **PRESERVE_CANDIDATE 247건 확정 여부** — 지금은 분량 외 근거가 없다 | 검색 유입 측정 후 재판정 / 현행 유지 |
| **4** | **MANUAL_REVIEW 159건**(그중 **JOB 136**) 기준 수립 | `expiresAt` 운영 시작 여부 · 공고 만료 기준 |
| **5** | **시드 계정 글 21건의 `source` 정합성** — `source=USER` 로 회원 글처럼 보인다 | 그대로 / source 표기 정정 / 비공개 |
| **6** | **HIDE 를 검토할지 여부** — 별도 고위험 결정 | 검토 시 `protectedFromHideDelete=true` **32건 제외**가 전제 |
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
7. 보호축(`protectedFromHideDelete`)과 조치축(`recommendedAction`)을 **따로** 계산

---

## 9. 이 배치에서 하지 않은 것

- production DB write · Post 상태 변경 · HIDE/DELETE 실행 · migration — **0건**
- env · workflow · launchd 변경 — **0건**
- 개인정보·식별자·**본문 인용** 커밋 — **0건**
- 자동 생성·가짜 회원 활동 복구 — **하지 않았다**
