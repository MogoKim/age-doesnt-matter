# 네이버 카페 유래 데이터 — 폐기 전 실측 사실 (2026-09-10, 개정 2판)

> 기준 커밋 `c8f996e0` · production Supabase REST **읽기 전용** 측정 · **DB write 0**
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
| **DELETE** | `BotLog` (CAFE_CRAWLER 99,026 + 원문 조각 보유 552) | **99,578** |
| **DELETE** | R2 객체 | **518키**(현재 존재 504) |
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
| **로컬(`unao-prod`)** | `agents/cafe/` 코드 사본 · `logs/cafe-crawler-*.log` 포함 28개 | **DELETE (별도 조치)** | DB·R2 밖이라 이 도구 범위가 아니다. runbook 에 수동 절차로 둔다 |
| **Supabase Storage** | 버킷 **0** | 해당 없음 | 이미지는 전부 R2 |

## 6. 백업 — **backup expiry pending**

| 항목 | 상태 |
|---|---|
| PITR | **비활성** (2026-08-20 창업자 확인) |
| daily backup | 있음 |
| 플랜 · 보존 기간 · 가장 오래된 복원 지점 | **backup expiry pending** — 창업자 콘솔 확인 전까지 미확정 |

🔴 **복원 시 자동 재적용을 하지 않는다.** 백업에서 복원하면 폐기한 데이터가 되살아나므로,
**복원 절차의 필수 게이트**로 이 도구를 다시 실행하도록 runbook §5 에 고정했다.

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

`Post` 총계는 고정하지 않는다 — 실회원이 지금도 글을 쓴다(2026-09-10 측정 중 11,715 → 11,718, 공개 USER 73 → 76).
