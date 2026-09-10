# 네이버 카페 유래 데이터 — 폐기 전 실측 사실 (2026-09-10)

> 기준 커밋 `c8f996e0` · production Supabase REST **읽기 전용** 측정 · **DB write 0**
> 측정 도구: `agents/scripts/purge-naver-cafe-data.ts` (dry-run) + read-only probe
> ⚠️ 이 문서에는 row ID·제목·본문·댓글·닉네임을 남기지 않는다. 집계와 분류만 남긴다.

## 1. 대상 정의

**명시적 네이버 유래 Post** = `cafePostId IS NOT NULL` **OR** `sourceUrl ILIKE '%cafe.naver.com%'`

| 조건 | 건수 |
|---|---:|
| `cafePostId` 보유 | 6,275 |
| `sourceUrl` 이 cafe.naver.com | 1,174 |
| **합집합 (대상)** | **7,449** |

정의는 `agents/purge/naver-origin-policy.ts` 의 `NAVER_ORIGIN_FILTER` 하나뿐이고, dry-run 과 실제 실행이 같은 값을 쓴다.

## 2. 처분 분류

| 처분 | 대상 | 건수 | 이유 |
|---|---|---:|---|
| **HARD DELETE** | Post | **7,223** | 실회원 흔적 없음 |
| **TOMBSTONE** | Post | **226** | 실회원 댓글·공감·게스트공감·신고가 붙어 있어 hard delete 시 사람의 흔적까지 cascade 로 사라진다 |
| **DELETE** | `CafePost` | **33,031** | 네이버 카페 원문 사본 (`topComments` 보유 32,335 · `commentCrawled=true` 25,426) |
| **DELETE** | `CafeTrend` | **191** | 원문 파생 텍스트 보유 (`hotTopics.examples` · `personaHints.examplePosts` · `magazineTopics` · `cafeSummary`) |
| **DELETE** | `CommentWaveQueue` | **276** | `cafePostId` 참조 봇 댓글 예약 큐 |
| **DELETE** | tombstone 글 위의 봇 댓글 | **1,765** | 네이버 원문에서 파생된 봇 발화 |
| **PRESERVE** | 실회원 댓글 (tombstone 글 위) | **75** | 사람이 쓴 글 — 자동 삭제하지 않는다 |
| **PRESERVE** | `authorId` NULL 댓글 (tombstone 글 위) | **56** | 게스트·탈퇴 회원 — 사람 흔적 |
| **PRESERVE** | USER Post | **73 공개 / 전체** | 정책상 절대 대상 아님 |
| **PRESERVE** | `BotLog` | 125,025 | 카페 크롤 로그 99,026건을 포함하나 `logData` 는 **카운터뿐**(최대 120B, 키: totalProcessed·totalFailed 등), `details` 최대 35자. **원문 없음** |
| **PRESERVE** | `AdminQueue` | 160 | `payload` 는 소셜 발행 문구(xText·threadsText·personaId). 카페 원문이 아니고 Post 링크 키도 없다. ⚠️ Codex 재판정 여지 |
| **PRESERVE** | `UserPostWaveQueue` | 11 | 실회원 글 대상 큐 — 네이버 유래 아님. 개인정보 인접이라 별도 판단 |

## 3. 실회원 활동 영향

네이버 유래 Post 7,449건 위의 활동:

| 항목 | 총계 | 봇 | 실회원 | 처리 |
|---|---:|---:|---:|---|
| Comment | 54,623 | 54,492 | **75** (+ `authorId` NULL 56) | 봇분은 삭제/cascade · 실회원분 75 + NULL 56 은 **보존** |
| Like | 15,925 | 15,880 | **45** | hard delete 대상 글의 것은 cascade · tombstone 글의 것은 보존 |
| GuestLike | 111 | – | **111** | 전량 tombstone 글에 있어 **보존** |
| Scrap | 0 | – | 0 | 없음 |
| Report | 1 | – | **1** | tombstone 글에 있어 **보존** (FK `Restrict` 충족) |

**실회원 흔적이 사라지는 건수 = 0.** 흔적이 있는 글은 전부 tombstone 으로 남긴다.

## 4. Phase B — 레거시 164건 분류

대상: `source=BOT` · 공개 · `cafePostId IS NULL` · `createdAt < 2026-05-20` = **164건**

| 판정 | 건수 |
|---|---:|
| CONFIRMED_NAVER | **0** |
| LIKELY_NAVER | **0** |
| NOT_NAVER | **163** |
| UNKNOWN | **1** |

판정 근거(원문은 프로세스 메모리에서만 비교했고 저장·출력하지 않았다):

1. **구조**: 164건 전부 `sourceUrl`·`sourceSite` 가 NULL 이다. 어드민 분류상 `cafePostId IS NULL` 인 BOT 은 `seed`(자체 생성)이고, 카페 큐레이션(`curate`)은 정의상 `cafePostId` 를 갖는다.
2. **구성**: MAGAZINE 102 · JOB 48 · 커뮤니티 14(STORY 10 · LIFE2 2 · HUMOR 1 · MENOPAUSE 1). MAGAZINE·JOB 은 카페와 무관한 별도 파이프라인이다.
3. **본문 대조**: 커뮤니티 14건을 `CafePost` 33,031건 전량과 대조 — 본문 Jaccard 최대 **0.078**, 본문 포함률 최대 **0.269**. 복사 수준(0.5/0.85)에 크게 못 미친다. UNKNOWN 1건은 제목 토큰 유사도 0.429뿐이고 본문 유사도는 0.073 이라 흔한 한국어 어휘가 겹친 것이다.

**결론: 레거시 164건은 폐기 범위에 넣지 않는다.**

⚠️ **탐지 사각**: `CafePost` 보존 정책은 "90일 경과 + Post 미참조분 삭제"다. 2026-03~05 에 크롤된 미참조 원문은 이미 사라졌을 수 있어, 본문 대조만으로는 완전하지 않다. 위 판정은 **구조 근거가 1차**이고 본문 대조는 보강이다.

## 5. Dependency closure

### 5-1. Post FK (DB 레벨 cascade — REST DELETE 에도 그대로 적용)

| 참조 모델 | onDelete | hard delete 시 |
|---|---|---|
| `Comment` `Like` `GuestLike` `Scrap` `PostView` `CpsLink` `HomeCurationOverride` `JobDetail` | **Cascade** | 함께 삭제 |
| `Report` | **Restrict** | ⚠️ 삭제 차단. 해당 1건은 tombstone 대상이라 충돌 없음 |
| `Notification` | **SetNull** | `postId` 만 NULL (알림 행은 남음, 144건) |

### 5-2. 코드·운영 소비처

| 대상 | 소비처 | 폐기 후 |
|---|---|---|
| `prisma.cafePost` | `agents/scripts/purge-old-logs.ts` 1곳 | 보존 정책 purge — 대상이 0건이 될 뿐 정상 동작 |
| `prisma.cafeTrend` | `src/lib/slack-commands.ts` `handleTrend()` 1곳 | 행이 없으면 "아직 오늘의 트렌드 분석 결과가 없어요" 반환 — **graceful** |
| `/landing` | `src/app/landing/page.tsx` → 홈 redirect (307 실측) | 영향 없음 |
| `src/lib/queries/cafe-posts.landing.ts` | DB 접근 없이 빈 배열 반환하는 stub | 영향 없음 |
| API 라우트 · 어드민 화면 | **0건** | 없음 |
| workflow · launchd | 우나어 카페 크롤 **0건** (`agents/cafe/` 부재, `com.unao.cafe-crawler-*` 없음) | 재수집 경로 없음 |
| `cto:purge-old-logs` | runner HANDLERS 에 **없음**(미스케줄) | 대상 테이블이 자동 감소하지 않아 기준선이 동결된다 |

### 5-3. DB 밖 잔재 (이번 배치 범위 밖 — 별도 조치 필요)

| 위치 | 내용 | 조치 |
|---|---|---|
| **Cloudflare R2** (`pub-*.r2.dev` / `img.age-doesnt-matter.com`) | 네이버 유래 Post 의 썸네일 **518건**이 참조 | DB 삭제로 사라지지 않는다. R2 객체 삭제는 별도 배치 |
| Supabase Storage | **버킷 0개** | 해당 없음 |
| `unao-prod` 로컬 | `agents/cafe/` 코드 사본 · `logs/cafe-crawler-*.log` 등 로그 28개 | 로컬 정리 별도 (이번 배치는 읽기만) |

### 5-4. 백업 · PITR

| 항목 | 상태 |
|---|---|
| PITR | **비활성** (2026-08-20 창업자 확인, `2026-08-20-database-disaster-recovery.md` §8-1) |
| daily backup | **있음** — 자정 무렵 1회 |
| 보존 기간 | **미확인** — Supabase 플랜 설정값. 창업자 콘솔 확인 필요 |

⚠️ **영구 폐기의 의미**: 삭제해도 **백업 보존 기간 동안은 백업 안에 남는다.** 보존 기간이 지나야 완전 소멸한다.
그리고 **삭제 이후 백업으로 복원하면 지운 데이터가 되살아난다.** 복원 필요 시 이 폐기를 다시 적용해야 한다 —
runbook §5 에 그 절차를 둔다.

## 6. 기준선 동결 근거

`naverOrigin` · `CafePost` · `CafeTrend` · `CommentWaveQueue` 는 **정확히 일치**를 요구한다.
생산자(카페 크롤러 · 큐레이터 · 트렌드 분석 · 댓글 파동)가 R4 B-3 에서 전부 제거됐고,
`cto:purge-old-logs` 도 핸들러에 없어 자동 감소 경로가 없다.

`postTotal` 은 실회원 글로 늘 수 있어 ±1%, `tombstonePosts` 는 실회원이 지금도 댓글을 달 수 있어
**하한만** 본다(늘어나는 방향은 안전 — hard delete 가 줄고 tombstone 이 는다).
