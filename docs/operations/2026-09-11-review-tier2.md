# 공개 콘텐츠 REVIEW 650건 — 2차 분류

> **read-only 분류다. 이 배치에서 콘텐츠 상태를 바꾸지 않았다.**
> DB write · Post 상태 변경 · HIDE/DELETE 실행 · migration **0건**.
>
> 기준 main `ef1a93f5` · 측정 2026-09-11 · 모수는 1차 분류 CSV 의 `verdict=REVIEW` **650건**
> 선행 문서: [`2026-09-11-public-content-disposition.md`](./2026-09-11-public-content-disposition.md)
> 전건 표: [`data/2026-09-11-review-tier2.csv`](./data/2026-09-11-review-tier2.csv) (650행 · 18열, **비식별**)
>
> 🔒 **비식별**: 작성자 ID·닉네임·이메일·`providerId`·전화번호를 문서와 CSV 어디에도 적지 않았다.
> 계정은 **형태 계층**(접두어 종류·도메인 종류)으로만 분류했고, 글 본문도 싣지 않았다.

---

## 0. 합계 검증

| | 건수 |
|---|---:|
| 1차 분류 REVIEW | **650** |
| 갈래 A (`source=USER` 비실회원) | **19** |
| 갈래 B (나머지 non-USER) | **631** |
| **A + B** | **650** ✅ |

2차 분류 합계도 **650** 으로 일치한다(§1·§2 표 합).

---

## 1. 갈래 A — `source=USER` 비실회원 19건

작성자 **고유 계정 8개**. 계정은 값이 아니라 **형태**로만 판정했다.

| 2차 분류 | 건수 | 근거 |
|---|---:|---|
| **SEED_BOT** | **18** | `providerId` 가 `seed-` 접두어 · email 없음 · 계정 생성 **2026-03** · 글 발행도 2026-03 |
| **WITHDRAWN_REAL_MEMBER** | **1** | `providerId` 가 `withdrawn_` 접두어 · `status=WITHDRAWN` · `signupSource=WEB` |
| **FOUNDER_PERSONA** | 0 | 페르소나 allowlist(`@unao.bot` 5계정) 일치 **0건** |
| **UNKNOWN** | 0 | 위 경로로 전부 설명됐다 |

### 1-A. SEED_BOT 18건 — 시드봇 가상 페르소나

`seed-` 접두어 계정은 **시드봇(A05)** 의 가상 페르소나다.
`docs/features/A05-seed-bot.md`(**ARCHIVED 2026-09-09**) 원문:

> "커뮤니티 초기 활성화를 위해 35~40명의 **가상 50~60대 페르소나**가 하루 180개+ 활동(글/댓글/좋아요)을 자동 생성한다."

즉 **`source=USER` 로 발행됐지만 사람이 쓴 글이 아니다.** 시드봇 스케줄러·workflow 는 R4 에서 제거됐고
현재 신규 발행은 0이지만, **이미 발행된 18건은 공개 면에 남아 있다.**

- 계정 role 전부 `USER` · status 전부 `ACTIVE` · `isOnboarded=true` · `signupSource=null`
- 글 5건은 `Post.createdAt` 이 계정 생성보다 이르다 → 마이그레이션·소급 입력 흔적
- 표본 검증(production 200): 본문 131자 / 129자 — 전형적인 단문 시드 글

### 1-B. WITHDRAWN_REAL_MEMBER 1건 — 가짜 계정이 아니다

🔴 **이 1건은 원래 카카오 실회원이다.** `withdrawn_` 접두어는 우리가 붙인 것이다:

```
agents/scripts/anonymize-withdrawn-users.ts:38
  providerId: `withdrawn_${u.providerId}`,   // 재가입 시 새 계정(원 providerId 못 찾음)
```

F-12 **30일 경과 탈퇴자 PII 익명화**(`cto:anonymize-withdrawn-apply`)가 `providerId` 를 덮어쓴 결과다.
그래서 "`providerId` 가 순수 숫자" 라는 실회원 SSoT 를 **사후적으로** 통과하지 못한다.

- `signupSource=WEB` — 실제 웹 가입 경로를 거쳤다
- 표본 검증(production 200): 본문 13자 "안녕하세요 반갑습니다~~" — 가입 인사글
- **처분 시 실회원 글과 같이 취급해야 한다.** 봇 글로 분류하면 안 된다

> ⚠️ 실회원 판정 SSoT(`providerId` 순수 숫자)는 **탈퇴·익명화된 과거 실회원을 구분하지 못한다.**
> 1차 분류의 "`source=USER` 비실회원 22건"에 이 성격이 섞여 있었다. 이 문서가 그것을 분리한다.

---

## 2. 갈래 B — 나머지 non-USER 631건

### 2-0. 먼저 확인한 사실 — 이 631건에 사람 반응은 없다

| 축 | 631건 중 |
|---|---:|
| 실회원 댓글 / 공감 / 신고 | **0 / 0 / 0** |
| 30일 비봇 실열람(`post_view`) | **0** |
| 비회원(게스트) 공감 | **25** |
| 살아있는 댓글이 달린 글 | 301 |

🔴 **댓글 301건을 사람 흔적으로 읽으면 안 된다.** 이 글들에 달린 살아있는 댓글 **911건의 작성자**를 실측하니
**봇/시드 계정 901건**(`bot-*` 886 · `curator-*` 15), 게스트 10건이었다. 자동 생성 댓글이다.
→ 이 배치에서 **사람 흔적으로 인정한 축은 `guestLike` 25건뿐**이다.

⚠️ **검색 유입을 `post_view` 로 오인하지 않았다.** `post_view` 는 "사람이 글을 열었다"이지 "검색으로 들어왔다"가 아니다.
검색 유입 분해는 Search Console 이 필요하고 이 배치의 read-only 경로에 없다(§4).

### 2-1. 분류 결과

| 2차 분류 | 건수 | boardType 분해 |
|---|---:|---|
| **PRESERVE_CANDIDATE** | **272** | MAGAZINE 248 · STORY 14 · HUMOR 7 · LIFE2 3 |
| **NOINDEX_OR_HIDE** | **152** | HUMOR 87 · STORY 62 · LIFE2 3 |
| **MANUAL_REVIEW** | **147** | JOB 131 · MAGAZINE 9 · HUMOR 4 · STORY 3 |
| **REWRITE** | **60** | JOB 55 · MAGAZINE 4 · STORY 1 |
| **합계** | **631** | |

### 2-2. 판정 규칙 (순서대로 첫 매치)

| # | 조건 | 분류 | 왜 |
|---|---|---|---|
| 1 | 실제 SEO 노출면에 금지 표현 | **REWRITE** | 삭제가 아니라 문구 정정이다 |
| 2 | 동일 제목 중복 | **MANUAL_REVIEW** | 정본 1건 선택은 사람 판단 |
| 3 | 비회원 공감 > 0 | **PRESERVE_CANDIDATE** | 이 글에 남은 유일한 사람 흔적 |
| 4 | MAGAZINE **AND** 본문 ≥ 1,000자 | **PRESERVE_CANDIDATE** | 재수집 시 남는 검색 자산 **후보**. 실열람 0이라 확정 아님 |
| 5 | JOB | **MANUAL_REVIEW** | 공고 유효·만료가 DB 에 없다 |
| 6 | 본문 < 300자 | **NOINDEX_OR_HIDE** | 단문·사람 흔적 0 → 색인면에서만 내림(삭제 아님) |
| 7 | 그 외 | **MANUAL_REVIEW** | 단일 축으로 판정 불가 |

**분량 분포**(631건): p25 187자 · 중앙값 340자 · p75 2,222자.
MAGAZINE 261건 중 252건이 ≥1,000자, JOB 186건 중 184건이 300~999자, STORY·HUMOR·LIFE2 는 대부분 <300자다.

### 2-3. 🔴 REWRITE 60건 — JOB 공식 직함과 우나어 자체 카피의 분리

금지 표현이 **어디서 왔는지**를 나눴다. 이것이 이 배치의 가장 중요한 정정이다.

| 출처 | 건수 | 뜻 |
|---|---:|---|
| **BRAND_COPY** (`seoTitle`/`seoDescription` 필드) | **47** | **우나어가 직접 쓴 SEO 카피**다 |
| **BRAND_COPY + SOURCE_TITLE** | **12** | 우나어 카피와 원문 직함에 **둘 다** 있다 |
| **SOURCE_TITLE 전용** (원문 제목만) | **0** | |
| AUTO_COMPOSED (자동 조합 description) | 1 | |

**우나어 자체 카피가 관여한 것이 59/60 이다.** boardType 으로는 JOB 55 · MAGAZINE 4.

🔴 **이전 판(merge 된 1차 분류 문서)의 서술을 정정한다.**
그 문서는 "62건 중 55건(89%)이 채용 공고의 공식 직함이라 브랜드 카피 위반과 성격이 다르다"고 적었다.
**실측하니 반대다.** JOB 55건을 title/description 으로 분해하면:

| | 건수 |
|---|---:|
| 원문 title 의 공식 직함에 금지어 | 10 |
| description 에만 금지어 | **45** |
| 둘 다 | 9 |
| 그 description 이 `seoDescription` 필드(사람이 쓴 카피)에서 온 것 | **54 / 55** |

즉 JOB 의 금지 표현은 **대부분 외부 공고 원문이 아니라 우나어가 작성한 SEO description** 이다.
production 표본 검증에서 실제로 렌더되는 문구를 확인했다:

- `어르신 모시는 보람 있는 일` · `어르신 댁 방문하는 보람 있는 일` — **우나어가 쓴 마케팅 카피**
- `노인주간보호 운전원` · `노인복지센터` — 공고 원문 직함

→ **"외부 원문이라 손댈 수 없다"는 근거는 성립하지 않는다.** 정정 우선순위가 높다.

---

## 3. 대표 표본 검증 (production 원시 HTML · `x-bot-type` 부착)

| 표본 | 분류 | HTTP | 검증 결과 |
|---|---|---|---|
| JOB ×3 | REWRITE | 200 | live `<meta description>` 에 `시니어`·`어르신`·`노인` **실제 렌더 확인** |
| MAGAZINE ×2 | REWRITE | 200 | live title·description 양쪽에 `실버`/`노인` 렌더 확인 |
| MAGAZINE ×2 | PRESERVE_CANDIDATE | 200 | 본문 3,469 / 3,457자 장문 · 금지어 없음 |
| HUMOR ×1 | NOINDEX_OR_HIDE | 200 | 본문 245자 단문 확인 |
| JOB ×2 | MANUAL_REVIEW | 200 | 금지어 없음 · 공고 형태 확인 |
| STORY ×2 | SEED_BOT | 200 | 본문 131 / 129자 — 단문 시드 글 |
| STORY ×1 | WITHDRAWN_REAL_MEMBER | 200 | 본문 13자 가입 인사글 |



**부수 발견**: 공개 글 **236건에 `slug` 가 없다**(JOB 191 · MAGAZINE 28 · MENOPAUSE 9 · STORY 6 · WEEKLY 2).
JOB 은 **191건 전부** slug 가 없어 `/jobs/{cuid}` 로만 접근된다. sitemap 영향은 이 배치에서 확인하지 않았다.

---

## 4. 이 배치에서 측정하지 못한 것

- **검색 유입** — Search Console 데이터가 필요하다. `post_view` 로 대체하지 않았고, 대체 가능한 것처럼 쓰지도 않았다.
- **JOB 공고 유효·만료** — DB 에 만료 필드가 없다. 발행 경과 중앙값 80일 · 90일 초과 67건이라는 사실만 남긴다.
- **`seed-` 계정의 원 소유 주체** — 계정 형태로 시드봇임은 확정했으나 그 이상은 증거가 없다. 추정하지 않았다.

---

## 5. 창업자 결정이 필요한 항목

| # | 항목 | 선택지 |
|---|---|---|
| **1** | **REWRITE 59건(우나어 자체 카피) 정정 범위** — 브랜드 규칙 직접 위반이다 | 전면 정정 / 단계적 |
| **2** | REWRITE 중 원문 공식 직함 부분(10건 title) 처리 | 원문 보존 / 치환 |
| **3** | NOINDEX_OR_HIDE 152건 실행 여부 | 실행 / 보류 — 되돌릴 수 있다 |
| **4** | PRESERVE_CANDIDATE 272건 확정 여부 | 보존 확정 / 추가 관찰 |
| **5** | MANUAL_REVIEW 147건(JOB 131 포함) 처리 기준 | 공고 만료 기준 수립 |
| **6** | **SEED_BOT 18건 처분** — `source=USER` 로 남아 있어 회원 글처럼 보인다 | 그대로 / source 정정 / 비공개 |
| **7** | **WITHDRAWN_REAL_MEMBER 1건** — 실회원 글로 보존 확인 | 보존(권고) |

**결정 전까지 실행하지 않는다.**

---

## 6. 재현 방법

Supabase REST **GET only**. write 경로가 없다.

1. `GET /rest/v1/Post?status=eq.PUBLISHED` · `GET /rest/v1/JobDetail` · `GET /rest/v1/User`
2. `GET /rest/v1/Comment|Like|GuestLike|Report` — 글별 반응, 댓글 작성자 성격
3. `GET /rest/v1/EventLog?eventName=eq.post_view&isBot=eq.false&createdAt=gte.{30일 전}`
4. production `generateMetadata` 3분기(커뮤니티·매거진·JOB)로 SEO title/description 재구성
5. 금지 표현을 **`seoTitle`/`seoDescription` 필드 유래**와 **원문 `title` 유래**로 분리
6. §1·§2-2 규칙을 순서대로 적용

---

## 7. 이 배치에서 하지 않은 것

- production DB write · Post 상태 변경 · HIDE/DELETE 실행 · migration — **0건**
- env · workflow · launchd 변경 — **0건**
- 개인정보·식별자·본문 전문 커밋 — **0건**
- 자동 생성·가짜 회원 활동 복구 — **하지 않았다**
