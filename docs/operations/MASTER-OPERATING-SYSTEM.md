# 우나어 운영 정본 (MASTER OPERATING SYSTEM)

> **이 문서가 우나어 운영의 단일 기준점이다.** 전략·현재 상태·남은 작업·다음 배치를 한 곳에서 본다.
>
> 작성 2026-09-10 · 기준 커밋 `c8f996e0` · production `2026.09.09-c8f996e`
> 통합 대상: Rescue 마스터플랜 · 현재 상태판 · 운영 마스터 하네스
> **모든 수치는 이 문서 작성 시점의 직접 실측이다.** 문서와 실측이 충돌하면 실측을 적었다.

---

## 1. 우나어는 무엇이고 무엇을 하려는가

**서비스**: 40대 중반~60대 중반 여성(핵심 50대)의 커뮤니티. `age-doesnt-matter.com`
**본질**: 일자리 플랫폼이 아니라 **커뮤니티**다. 일자리는 '돈과 일' 축의 한 기능이다.

### 목적

> 우나어를 네이버와 사용자에게 **다시 신뢰받는 커뮤니티**로 소생시킨다.

코드 정리·인프라 정리·문서 정리·자동화 제거·콘텐츠 정리는 전부 **이 목적의 수단**이다.
목적에 직접 기여하지 않는 작업은 긴급해 보여도 뒤로 보낸다.

### 목표 지표

**North Star = 주간 재방문 참여 유저 수** (최근 7일 재방문 + 글/댓글 1회 이상 고유 사용자)

DAU·MAU·PV·SEO 클릭·색인 수는 **생존/유입 참고지표이지 목표가 아니다.**
현재는 복합 지표를 만들지 않고 **네 숫자를 각각 관찰**한다(§6-E).

### 기대 결과

1. 회원이 글과 댓글을 남기는 커뮤니티로 돌아온다.
2. 네이버가 다시 수집·색인·노출한다.
3. 운영자가 무엇이 돌아가는지 알 수 있는 상태가 된다.
4. 창업자의 판단 피로가 줄어든다 — 지금 할 것과 하면 안 되는 것이 분리된다.

### 하지 않는 일 (불변 금지선)

- 네이버 신뢰가 걸린 콘텐츠를 **근거 없이 대량 삭제**하지 않는다.
- 로그인·SEO·DB·자동화·문서를 **한 번에** 흔들지 않는다.
- 소란소란 코드·데이터를 우나어에 섞지 않는다. **별도 서비스·repo·DB·인프라다.**
- "시니어·어르신·노인·실버" 표현을 쓰지 않는다.
- 네이버 노출면(`sitemap`·`robots`·`canonical`·일반 `<meta robots>`)을 훼손하지 않는다.

---

## 2. 마일스톤

| 시점 | 날짜 | 판정 대상 | 현재 |
|---|---|---|---|
| **T+7** | 2026-09-12 | 생존 1차 — "더 망가지지 않는 상태가 됐는가" | **진행 중** (D-2) |
| **T+14** | 2026-09-19 | 신뢰 정리 — noindex/격리/리라이트/삭제 실행 여부 결정 | 대기 |
| **T+30** | 2026-10-05 | 회복 판정 — 네이버 수집·색인·노출·클릭 + 실회원 반응 비교 | 대기 |
| **T+90** | 2026-12-04 | 사업 판단 — 유지 / 축소 / 병렬 지속 결정 | 대기 |

**T+7 은 성장을 판정하지 않는다.** 목적은 출혈이 멎었는지 보는 것이다.

### T+7 판정 기준 대비 현재

| 기준 | 상태 | 근거 |
|---|---|---|
| 로그인 정상 | **PASS** | `/api/health/auth` 200, 전 항목 true |
| 신규 저품질 누적 중단 | **PASS** | BOT·SHEET 신규 발행 0, `prisma.comment.create` 호출 에이전트 0 |
| 위험 자동화 차단 | **PASS** | `automation_status=PAUSED`, 등록 핸들러 6개, 필수 5개만 실행 |
| 검색 지표 관찰 시작 | **PARTIAL** | 기술 방어선 정상이나 네이버 수집 재개 신호 0 |

---

## 3. 현재 main 반영분

`origin/main = c8f996e0` · Rescue 시작(2026-09-05) 이후 **43개 커밋 merge**.

| 영역 | 반영 |
|---|---|
| 로그인·인증 | health/auth no-store, 어드민 DB 오류 비노출 (#410) |
| 자동화 차단 | `automation_status=PAUSED` (#409), bot API write 기본 차단 (#412), moderator 생존 (#411) |
| 자동화 제거 | Gate 2 (#434) · C-level 10 (#435) · SUPERSEDED 4 (#436) · GROWTH_LEGACY 13 (#437) · SEED+댓글파동 (#438) · B-5 관측 (#439) · **B-3 외부 카페·시트 공급망 (#440, −28,436줄)** · 잔여 정리 (#442) · KEEP 운영화 (#446) |
| 코드·타입 | ops 타입 오류 91 → **0** (#448), 죽은 코드 5배치 (#428~#432) |
| 캐시·정합성 | sitemap/JOB 캐시 무효화 (#417·#419·#422), cron-links 실측화 (#424·#425), moderator false-green (#426) |
| 보안·의존성 | prod 취약점 46 → **13**, critical **0** (#451) · **Next 14 → 16.3.4 · React 19** (#452) |
| 문서 | R0 정본화 (#433), 오도 문서 정리 (#414~#416), R5 정본화 (#443), 상태판 갱신 (#441·#445·#453) |

---

## 4. 설계 / 구현 / 운영 검증 분리

"구현했다"와 "운영에서 확인했다"는 다르다. 셋을 나눠 적는다.

| 항목 | 설계 | 구현 | **운영 검증** | 검증 근거 |
|---|:--:|:--:|:--:|---|
| 로그인·세션 복구 | ✅ | ✅ | ✅ | production 실제 로그인 + health/auth 200 |
| 자동화 PAUSED | ✅ | ✅ | ✅ | 2026-09-09 23:09 UTC 자연 실행 success |
| Moderation lifecycle | ✅ | ✅ | ✅ | 2026-09-09 16:36 UTC 자연 실행 success |
| GHA DB 인증 | ✅ | ✅ | ✅ | run `34187374847` success · AuthenticationFailed 0 |
| B-3 공급망 제거 | ✅ | ✅ | ✅ | `agents/cafe/` 부재 · 카페 크롤 plist 0 · 신규 발행 0 |
| Next 16 / React 19 | ✅ | ✅ | ✅ | production LCP median 2,264ms · perf 99 · #418 0/20 |
| 네이버 기술 방어선 | ✅ | ✅ | ✅ | 857 URL 200 · canonical 100% · noindex 0 · Yeti 200 |
| 네이버 **색인 회복** | ✅ | — | ❌ | 수집 0 · 색인 0 · 노출 0 (외부 의존) |
| 콘텐츠 오염 처분 | ✅ | 🔸 도구만 | ❌ | PR #454 **HOLD** — 실행 0 |
| 목록 SSR 크롤 경로 | ❌ | ❌ | ❌ | 글 링크 0건 — 미착수 |
| 커뮤니티 회복 | ✅ | — | ❌ | 7일 신규가입 0 · 댓글 0 |

---

## 5. 완료 / 부분 완료 / HOLD / 미착수

| 구분 | 항목 |
|---|---|
| **완료** | R0 싱크 고정 · R1 로그인 소생 · R4 자동화 단순화 · R5 문서 단순화 · Next 16/React 19 전환 · 보안 업데이트(critical 0) · ops 타입 0 |
| **부분 완료** | R2 네이버 신뢰(기술 PASS / 색인 0) · R3 콘텐츠 오염(격리 완료, 처분 미실행) · R6 코드·연동(패키지 의존성 감사 미착수) |
| **HOLD** | **PR #454 네이버 카페 데이터 영구 폐기** — 도구·테스트·문서·dry-run 2회 완료, production write 0. 창업자 지시로 중단 |
| **미착수** | R7 콘텐츠 재건 · R8 커뮤니티 회복(관찰만) · 목록 SSR 크롤 경로 · 브랜드 금지어 63 URL · Prisma schema ↔ DB FK 불일치 정정 |

---

## 6. 영역별 진행률

### 6-A. 기술 기반 — **90%**

| 항목 | 상태 |
|---|---|
| Next 16 / React 19 | ✅ production 검증 완료 |
| prod 취약점 | ✅ critical **0** (high 5 · moderate 6, 전부 major 필요) |
| ops 타입 오류 | ✅ **0** |
| 테스트 | ✅ 1,176건 통과 |
| lint | ✅ error 0 · 경고 84 baseline 고정 |
| 남은 것 | 패키지 의존성 감사, Prisma schema ↔ DB FK 불일치 |

### 6-B. 제품 — **75%**

실측(2026-09-10): 공개 페이지 **42** · 어드민 페이지 **20** · API 라우트 **50**.
로그인·글쓰기·댓글·일자리·매거진 정상.
⚠️ 2026-08-19 스코어카드의 "공개 route 33 · API 54" 는 시점이 다르다 — 위가 현재 값이다.
남은 것: 목록 페이지 SSR 결손, 어드민 KPI 표기 정정(`northStar=4`는 실제로 7일 WAU).

### 6-C. 콘텐츠 — **60%**

| 지표 | 값 |
|---|---:|
| Post 전체 | 11,718 |
| PUBLISHED | **844** |
| HIDDEN | 10,602 |
| DELETED | 262 |
| DRAFT | 10 |
| 공개 USER | **76** |
| 공개 BOT | 464 |
| 공개 SHEET | 299 |
| 공개 ADMIN | 5 |

공개 콘텐츠의 **91%가 non-USER**다. 출혈은 멎었으나(신규 발행 0) **처분은 미실행**이다.

### 6-D. 검색(네이버) — **35%**

| 축 | 상태 |
|---|---|
| 기술 수집 가능 | ✅ 857 URL 전수 200 · canonical 자기참조 100% · 일반 robots noindex 0 · X-Robots-Tag 0 · Yeti 200 · 404 정상 |
| 내부 링크 경로 | ❌ 목록 페이지에 글 링크 **0건** — sitemap 외 발견 경로 없음 |
| 네이버 수집 | ❌ **0** (2026-08-16 이후) |
| 네이버 색인 | ❌ **0** |
| 네이버 노출·클릭 | ❌ **0** |

**"기술적으로 수집 가능"과 "실제 색인"은 별개다.** 지금은 첫 단계(수집 재개)에서 멈춰 있다.

### 6-E. 회원 소생 — **15%**

| 관찰 대상 | 7일 | 30일 |
|---|---:|---:|
| 신규 가입(실회원) | **0** | 4 |
| 실회원 글 | **14** | 19 |
| 실회원 댓글 | **0** | 6 |
| 실회원 계정 총계 | \- | **188** |

실회원 판정 SSoT = `providerId` 가 순수 숫자(카카오 ID). 접두어 방식은 7건 어긋난다.
**실회원 글 7일 14건은 직전 측정(9건)보다 늘었다.** 댓글은 0이다.

---

## 7. 실제 활성 자동화

### GitHub Actions — 파일 10개 / **active 6 · disabled 4**

| workflow | 상태 | 최근 자연 실행 |
|---|---|---|
| Agents — Daily | **active** | 2026-09-09 23:09 UTC **success** |
| Agents — Moderation | **active** | 2026-09-09 16:36 UTC **success** |
| Agents — Weekly | **active** | 자연 실행 대기 |
| CI (Smart QA) | **active** | PR마다 실행 · 전부 success |
| Lighthouse CI | **active** | PR마다 실행 · 전부 success |
| Quarantine Check | **active** | 자연 실행 대기 |
| Agents — Job Scraper | `disabled_manually` | — |
| Prewarm Detail Pages | `disabled_manually` | — |
| Push — Scheduled Dispatch | `disabled_manually` | — |
| Run Script (일회성) | `disabled_manually` | — |

### 에이전트 런타임

`automation_status = **PAUSED**` (constitution.yaml). 코드가 파싱하는 값은 이것 하나뿐이다.
PAUSED 에서도 도는 **필수 태스크 5개**:

| 키 | 이유 |
|---|---|
| `coo:moderator` | 금지어 감지·자동 숨김 — 멈추면 유해 콘텐츠가 노출된다 |
| `cto:security-audit` | 로그인 실패·어드민 민감 액션 감사 |
| `cto:count-reconcile` | 비정규화 카운트 정합성(멱등) |
| `cto:anonymize-withdrawn-apply` | 30일 경과 탈퇴자 PII 익명화 |
| `cmo:seo-snapshot` | Google Search Console read-only 관측 |

등록 핸들러는 **6개**다 — 위 필수 5개 + `coo:job-scraper`(workflow 가 `disabled_manually` 라 실제로는 돌지 않는다).
B-3 제거로 카페·시트 계열은 전부 사라졌다.
⚠️ PR #442 는 "핸들러 17 → 7" 로 보고했으나 **현재 main 실측은 6개**다.

### launchd (로컬 머신) — **우나어 관련 2개 loaded**

| job | 상태 |
|---|---|
| `com.unao.unao-prod-sync` | loaded · exit 0 |
| `com.unaeo.opsboard` | loaded · PID 524 |

**우나어 카페 크롤러 plist(`com.unao.cafe-crawler-*`)는 0개다.** 재수집 경로가 없다.

---

## 8. DB · env · workflow · launchd 실제 상태

### DB (Supabase, read-only 집계)

| 테이블 | 건수 |
|---|---:|
| Post | 11,718 |
| Comment | 67,086 |
| Like / GuestLike | 31,187 / 283 |
| User | 508 (실회원 **188** · 봇 320) |
| Notification | 1,010 |
| BotLog | 125,025 |
| DailyKpiSnapshot | 61 (2026-06-29~08-23 에서 **정지**) |

**소비처 0 모델**(삭제 미실행): `ChannelDraft` 653 · `CommentWaveQueue` 276 · `SocialPost` 119 · `NaverBlogQueue` 16 · `UserPostWaveQueue` 11.
**Prisma schema ↔ 실제 DB 불일치**: `HomeCurationOverride.postId` 가 schema 는 Cascade, DB 는 **RESTRICT**다(migration 기준). 모르고 삭제 코드를 짜면 런타임에 막힌다.

### env

| 위치 | 키 수 | 비고 |
|---|---:|---|
| `unao-prod/.env.local` | **105** | 운영 실행용. DATABASE_URL·DIRECT_URL·Supabase·Auth·Kakao·R2·Anthropic·Google 서비스계정 **존재** |
| `unao-main/.env.local` | **4** | 개발 워크스페이스. DB 접속정보 **없음** |

`SLACK_WEBHOOK_URL` **없음** — Slack 리포트 경로가 실제로 끊겨 있다.
⚠️ `DATABASE_URL`·`DIRECT_URL` 은 **현재 인증 실패** 상태다. DB 접근은 Supabase REST 로 한다.
**값은 이 문서 어디에도 적지 않는다.**

### 배포

production `2026.09.09-c8f996e` · `/` 200 · sitemap **857 URL** · `/api/health` 200(`database: ok`) · `/api/health/auth` 200 · 익명 `/admin` 307.

### 열린 PR · worktree

| PR | 상태 |
|---|---|
| **#454** 네이버 카페 데이터 폐기 도구 | **HOLD** · OPEN · merge 금지 · production write 0 |
| **#455** 창업자 페르소나 발행 화면 | 병렬 Lane · merge 금지 |

로컬 worktree **37개**. 대부분 과거 작업 잔재이며 정리 대상이다(§9 D-3).

---

## 9. 남은 작업 전체와 의존관계

```
[A] 네이버 회복 축
 A-1 목록 SSR 크롤 경로 복구 ──┐
 A-2 브랜드 금지어 63 URL 정정 ─┼─→ A-4 수집 재개 관측 → (외부) 네이버 색인
 A-3 콘텐츠 처분 실행(#454) ───┘        ↑ 창업자·네이버 의존

[B] 콘텐츠 신뢰 축
 B-1 공개 non-USER 768건 처분표 ──→ B-2 처분 실행 ──→ A-3 과 합류
 B-3 본문 100자 미만 공개 글 판정 ─┘

[C] 기반 정리 축  (A·B 와 독립)
 C-1 Prisma schema ↔ DB FK 불일치 정정
 C-2 소비처 0 DB 모델 5종 처분
 C-3 패키지 의존성 감사
 C-4 어드민 KPI 표기 정정 · DailyKpiSnapshot 정지 처리

[D] 운영 위생 축  (독립)
 D-1 문서 정본 정리(이 문서로 통합)
 D-2 회복 관측 체계 상시화
 D-3 worktree 37개 정리
```

**의존의 핵심**: A-4(수집 재개)는 우리가 만들 수 없다. A-1·A-2·A-3 을 끝내도 **네이버가 다시 올 때까지 기다려야 한다.** 그래서 A 축은 "할 수 있는 것을 끝내고 관측한다"가 전부다.

---

## 10. 앞으로의 실행 배치

### 배치 1 — 네이버 크롤 경로 복구 (A-1)

| | |
|---|---|
| 범위 | 커뮤니티·매거진·일자리 목록의 글 링크를 서버 HTML 에 넣는다 |
| 왜 | 현재 목록의 서버 HTML 은 380자(내비·푸터)뿐이고 **글 링크가 0건**이다. JS 를 실행하지 않는 수집기는 sitemap 외에 글을 발견할 길이 없다 |
| 완료 조건 | Yeti UA 로 받은 목록 HTML 에 글 링크 ≥ 12개 · SSR 텍스트 ≥ 2,000자 · 기존 UX·필터·정렬 동작 불변 · CI·Lighthouse 회귀 없음 |
| 위험 | 낮음. 데이터 무변경, 되돌리기 쉬움 |

### 배치 2 — 콘텐츠 처분표 확정 (B-1·B-3)

| | |
|---|---|
| 범위 | 공개 non-USER 768건을 보존·noindex·리라이트·삭제 후보로 분류한 **판정표**. 실행 아님 |
| 완료 조건 | 768건 전건 분류 · 각 분류의 근거 지표(반응·검색·중복·분량) 명시 · 사용자 영향 건수 산출 · 실행 0 |
| 위험 | 없음 (read-only) |

### 배치 3 — 기반 정합성 정리 (C-1·C-2·C-4)

| | |
|---|---|
| 범위 | Prisma schema ↔ DB FK 전수 대조 및 정정안 · 소비처 0 모델 5종 처분안 · 어드민 KPI 표기 정정 |
| 완료 조건 | 46개 모델 FK 대조표 · 불일치 목록과 정정안(migration 없음) · KPI 표기 정정 PR |
| 위험 | 낮음. schema 는 설명이고 DB 를 바꾸지 않는다 |

### 배치 4 — 네이버 카페 데이터 폐기 실행 (A-3, **현재 HOLD**)

| | |
|---|---|
| 범위 | PR #454 의 도구로 실제 폐기 |
| 완료 조건 | runbook 검증표 12항목 전부 PASS |
| 위험 | **높음 · 불가역**. 창업자 재개 지시 필요 |

### 배치 5 — 회복 관측 상시화 (D-2)

| | |
|---|---|
| 범위 | 수집 재개·색인·노출과 실회원 4지표를 주 2회 read-only 기록 |
| 완료 조건 | 관측 절차·기록 양식 확정 · T+30 판정에 쓸 시계열 확보 |
| 위험 | 없음 |

---

## 11. 창업자 결정이 필요한 항목

**여기 있는 것만 창업자 결정이 필요하다.** 나머지는 실측·판정으로 처리한다.

| # | 항목 | 왜 창업자여야 하나 | 지금 막고 있는 것 |
|---|---|---|---|
| **1** | PR #454 폐기 재개 여부 | 불가역 · 14만 건 · 사용자 흔적 영향 | 배치 4 전체 |
| **2** | Supabase 플랜·백업 보존 기간 확인 | 콘솔 접근 권한 | "언제 완전 소멸"을 말할 수 없음 |
| **3** | 공개 non-USER 768건 처분 방향 | 콘텐츠 정책 판단 | 배치 2 이후 실행 |
| **4** | `DIRECT_URL` 인증 정정 | 운영 자격증명 | Prisma 경로 DB 작업 전부 |
| **5** | PR merge 승인 (#454·#455 및 신규) | 배포 권한 | 모든 배치의 반영 |
| **6** | worktree 37개 정리 승인 | 미커밋 작업 유실 위험 | D-3 |

**창업자 결정이 필요 없는 것** (Claude·Codex 가 처리): 목록 SSR 복구 설계, 처분표 작성, FK 대조, KPI 표기 정정, 관측 기록, 문서 정리.

---

## 12. 문서 정본 정리

### 이 문서로 대체 — 운영 기준으로 쓰지 않는다

| 문서 | 처리 | 이유 |
|---|---|---|
| `docs/operations/UNAO_RESCUE_STATUS.md` | **대체** | 진행률·현재 상태는 이 문서로 통합. 과거 실측 기록은 보존 |
| `docs/ops/OPERATING_MASTER_HARNESS.md` | **부분 대체** | 문서 지도·역할 분담은 이 문서로. PR 분할·운영검증 기준은 **계속 유효** |

### 계속 정본 — 이 문서와 함께 본다

| 문서 | 역할 |
|---|---|
| `docs/operations/2026-09-05-unao-rescue-mode-master-plan.md` | Rescue 전략·금지선의 **원본 근거**. 이 문서는 그 요약이 아니라 실행 상태다 |
| `CLAUDE.md` · `AGENTS.md` | 세션 규칙·역할 |
| `docs/features/REGISTRY.md` | 기능 라이프사이클 |
| `docs/operations/2026-08-20-database-disaster-recovery.md` | DB 재해복구 |
| `docs/operations/2026-09-10-naver-cafe-purge-facts.md` · `-runbook.md` | 폐기 실측·절차 (HOLD 중이나 증빙으로 보존) |

### 재감사 대기 — 구현 근거로 쓰지 않는다

`docs/constitution/NORTH_STAR.md` · `agents/core/constitution.yaml`(automation_status 제외) · `docs/constitution/RULE_MAINTENANCE.md`
— 파일명에 `constitution` 이 있어도 정본으로 자동 인정하지 않는다.

### 역사 기록 — 현재 상태로 읽지 않는다

`docs/operations/2026-08-21-unao-as-is-scorecard.md`(2026-08-19~21 시점) ·
`docs/operations/2026-09-05-claude-foundation-reset-audit-report.md` ·
`docs/features/A01-cafe-crawler.md` · `A04-external-content.md` (둘 다 ARCHIVED)

---

## 13. 이 문서를 갱신하는 규칙

1. **수치는 실측만 적는다.** 문서에서 옮겨 적지 않는다.
2. 문서와 실측이 충돌하면 **실측을 적고, 충돌 사실을 남긴다.**
3. "완료"는 **운영 검증까지** 끝났을 때만 쓴다(§4 3단 분리).
4. 진행률은 배치 종결 시점에만 갱신한다. 매일 고치지 않는다.
5. 창업자 결정 항목(§11)은 **정말 창업자여야만 하는 것**만 둔다.
