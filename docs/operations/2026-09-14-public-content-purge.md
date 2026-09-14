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
| **삭제 대상**(삭제 글 전용) | **867** |
| **공유 — 삭제 금지** | **0** |
| 외부 이미지(unsplash) — 손대지 않음 | 6 |

전용 객체 prefix: `magazine` 507 · `scraped` 349 · `magazine-thumbnails` 11.

### 4-A. 호스트가 둘인데 버킷은 하나다 🔴

`pub-b0ae…r2.dev` 와 `img.age-doesnt-matter.com` 은 **같은 버킷**이다.
같은 키에 HEAD 를 걸어 **ETag 가 일치**하는 것을 표본 8건에서 확인했다.

그래서 공유 여부를 **URL 로 세면 안 된다.** 보존 글이 다른 호스트로 같은 객체를 참조하고 있으면
공유를 못 보고 지워버린다. 도구는 URL 을 **객체 키로 정규화한 뒤** 센다.

### 4-B. 불확실하면 그 객체만 뺀다

`403`·`429`·`5xx` 는 "없다"는 뜻이 아니다. `UNCERTAIN` 으로 보고 **그 객체만 건너뛴다**.
이미지 실패는 **글 삭제를 막지 않는다**(창업자 지시).

---

## 5. 실행 도구

| 파일 | 역할 |
|---|---|
| `src/lib/purge/public-content-plan.ts` | 순수 — CSV 검증 · 계획 · drift · COO 권한 · 재실행 판정 |
| `src/lib/purge/r2-keys.ts` | 순수 — 객체 키 정규화 · 공유 판정 · HTTP 상태 분류 |
| `src/lib/purge/public-content-exec.ts` | 트랜잭션 실행 · 단계별 영향 행 대조 |
| `scripts/purge-public-content.ts` | CLI (dry-run 기본) |
| `docs/operations/data/2026-09-14-public-content-purge.csv` | 확정 대상 628행 |

### 5-A. 안전장치

- **Raw SQL·REST write 를 쓰지 않는다.** Prisma 트랜잭션만 쓴다.
- **DB write 는 COO 경로만.** `PURGE_AGENT_ID` 가 `coo:` 로 시작하고 `canWrite` 가 참이어야 write 경로가 열린다. (`agents/` 실측상 `canWrite: true` 는 `agents/coo/*` 에만 있다.)
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
확정 CSV 검증 통과 · 628행
보존 경계: 218건 (기대 218)
계획 이슈: 0건
재실행 판정: NOT_STARTED (남은 후보 628/628)
drift 이슈: 0건
삭제 대상 628건 · 보호 신호 자동 제외 0건
보존 대상 현재 잔량: 218/218
dry-run 종료 — DB write 0건 · R2 삭제 0건
```

---

## 7. 사후 검증 계획 (실행 배치에서 수행)

### 7-A. DB

- [ ] 삭제 후보 잔량 **0** (`Post.count({ id: in 628 })` = 0)
- [ ] 보존 대상 **218 → 218** 동일
- [ ] 실회원 글·실회원 댓글 총량 **전후 동일**
- [ ] 테이블별 실제 삭제량이 §3 예상과 일치
- [ ] `Notification.postId` 고아 0 · `WaveQueue` 잔재 0

### 7-B. 노출면

- [ ] 대표 삭제 URL **404 또는 410**
- [ ] 대표 보존 URL **200**
- [ ] `sitemap.xml` 에서 삭제 URL 제거
- [ ] `/` · `/community` · `/magazine` · `/jobs` · `/api/health` · `/api/health/auth` 정상

### 7-C. 캐시

`/jobs/[id]` 는 데이터 캐시(`unstable_cache` 300s)와 라우트 ISR 이 겹쳐 있다.
삭제 직후 즉시 404 가 아닐 수 있다 — **캐시 지연은 롤백 사유가 아니다.**
기존 `POST /api/admin/revalidate-deleted` 가 DELETED/HIDDEN 글의 경로를 무효화한다.
단 이번은 **hard delete** 라 행 자체가 사라지므로, 그 경로가 그대로 쓰이는지 실행 배치에서 먼저 확인해야 한다.

### 7-D. 검색 노출

**검색 노출 감소는 감수한다**(창업자 결정). 네이버 색인 수 하락을 장애로 보지 않는다.

---

## 8. 이번 배치에서 하지 않은 것

- production DB write **0건**
- R2 객체 삭제 **0건**
- merge · 배포 **0건**
- 행별 문구 검토 · 추가 사업 판단 요청 **0건**
