# 우나어 Rescue 현재 상태판

최종 갱신: 2026-09-08 KST
기준 main: `2861da77` (PR #433)
상태: **Rescue 진행 중 — 로그인·GHA DB 인증 종결. 현재 핵심 프로그램은 기반 단순화 / 레거시 제거(R4·R5·R6)**

이 문서는 현재 판정과 다음 게이트만 관리한다. **최상위 운영 정본은 창업자가 승인한
`docs/operations/2026-09-05-unao-rescue-mode-master-plan.md`**이며, 위계는
`Rescue 마스터플랜 > 이 상태판 > 범위별 정책/백로그 > reports/handoff`다.

`docs/constitution/NORTH_STAR.md`는 초기 전략 문서다. 배경으로 읽되 **레거시 재감사 전까지
구현 명령의 근거로 사용하지 않는다.**

## 1. 한 줄 판정

> 우나어는 소생 작전 중이다. 로그인과 GHA DB 인증은 운영 PASS로 종결됐다.
> 지금 할 일은 지표를 정교하게 만드는 것이 아니라 **기반을 단순하게 만드는 것**이다.
> 서비스가 실제로 쓰지 않는 에이전트·workflow·자동화·대시보드·연동을 걷어내고,
> 실회원 가입·재방문·글·댓글이 회복되는지 네 숫자를 그대로 관찰한다.

## 2. 목적과 North Star

- 목적: 우나어를 네이버와 사용자에게 다시 신뢰받는 커뮤니티로 소생시킨다.
- 본질: 40대 중반~60대 중반 여성이 "나만 이런 게 아니구나"를 확인하고 다시 참여하는 공간.
- 회복 관찰: 신규 가입 · 실회원 글 · 실회원 댓글 · 재방문 회원을 **각각 단순 관찰**한다(§5-A).
  복합 대표지표는 만들지 않는다.
- 수단: SEO, 일자리, 매거진, 크롤러, 에이전트, 광고, 운영 대시보드. **쓰지 않는 수단은 제거한다(§9).**

PV, DAU, 색인 수, 자동 발행량, 에이전트 수는 단독 성공 지표가 아니다.

## 3. R0~R8 현재 판정

| 단계 | 현재 판정 | 완료된 것 | 남은 완료 조건 |
|---|---|---|---|
| R0 싱크 고정 | **PASS** | `Rescue 마스터플랜 > 현재 상태판 > 범위별 정책/백로그 > reports/handoff` 위계와 시작 게이트 확정 | 이후 모든 세션이 이 문서 세트를 먼저 읽고 충돌 시 중단 |
| R1 로그인 소생 | **PASS** | health/auth no-store, 내부 DB 오류 노출 차단, 창업자 production 실제 로그인 정상 확인, 최근 7일 실회원 글 9건 | **없음 — 재진단 금지.** 실사용 장애가 재발할 때만 다시 연다 |
| R2 네이버 신뢰 방어 | **PARTIAL / 위험** | sitemap·robots·canonical 기술 방어선 정상 | Search Advisor 수집·색인·노출 확인. 네이버 유입 고점 대비 99.3% 감소 원인 판정 |
| R3 콘텐츠 오염 정리 | **PARTIAL** | BOT·SHEET 신규 발행 16일간 0, 기존 오염 콘텐츠 1차 격리 | 공개 non-USER 768건의 source/reaction/search/duplication 처분표 확정 |
| **R4 자동화 단순화** | **PARTIAL — 현재 핵심 프로그램** | PAUSED, bot write 차단, cron/handler 가드, dead job 정리, **GHA DB 인증 운영 PASS** | C-level·역할극 에이전트, 미사용 workflow·runner·registry, 안 보는 Slack·리포트·AdminQueue 자동화의 5종 분류 판정 → dependency closure 제거 |
| **R5 문서 단순화** | **PARTIAL — 현재 핵심 프로그램** | 정본 위계와 시작 게이트 확정, 충돌 문서와 소란소란 혼입 일부 정리 | 오도·중복·정지 문서 판정. `NORTH_STAR.md`·`constitution*.yaml` 재감사 |
| **R6 코드·지표·연동·스크립트·의존성 단순화** | **PARTIAL — 현재 핵심 프로그램** | RLS·캐시·계측·E2E·cron·레거시 일부 정리 | 오래된 KPI·지표·스냅샷·대시보드, UI·디자인 도구(R6-F), 일회성 scripts·backfill, 미사용 API·패키지·env·테스트 판정 → 제거. **REMOVE dependency closure를 먼저 완료하고, 최종 KEEP 코드의 ops 타입 오류를 0으로 만든다** |
| R7 콘텐츠 재건 | **HOLD** | 기존 gate와 복구 도구 일부 존재 | R1~R6 이후 우나어식 원본 공급·발행 gate 승인 |
| R8 커뮤니티 회복 | **FAIL / 단순 관찰 중** | 신규 가입·실회원 글·실회원 댓글·재방문 회원의 현재 값 확보(§5-A) | 네 숫자의 회복 추세. **복합 지표 구현은 HOLD** |

## 4. 지금까지 줄인 운영 위험

| 영역 | 증거 |
|---|---|
| RLS 오판 | 31개 SELECT 정책 적용, RLS preflight·drift 가드 (#420) |
| 계측 오도 | 실제 동작과 반대인 주석 정정 (#421) |
| JOB stale cache | 홈·목록·상세·sitemap 무효화 연결 (#422) |
| E2E 트래픽 오염 | first-party 요청에만 `x-bot-type` 부착 (#423) |
| cron/handler 오분류 | 모든 workflow 스캔, AST handler 추출, 양방향 가드 (#424, #425) |
| 거짓 성공 | Moderation lifecycle이 완료/실패를 runner에 전달 (#426) |
| 로그인·운영 오류 노출 | auth health 최신성 보장, admin 내부 DB 오류 비노출 (#410) |
| 자동화 출혈 | `automation_status=PAUSED`, bot API write 기본 차단 (#409, #411, #412) |
| DB 복구 절차 | 운영 DB 장애 복구 runbook을 분리해 보존 (#413) |
| 문서 충돌 | obsolete Rescue/feature/소란소란 문서 일부 정리 (#414~#416) |
| 삭제 후 stale 노출 | sitemap·JOB list/home 캐시 무효화 연결 (#417, #419) |
| 죽은 코드 | design·scripts·thumbnail·cook82·GSC dead path 제거 (#428~#432) |
| **false-green 배포 게이트** | **Gate 2 제거 — 무검증 배포가 초록불로 보이던 경로 차단 (R4, 2026-09-08)** |

R4·R6 정리 과정에서 agents/scripts 타입 오류는 `953 → 107`로 줄었다(2026-09-09 실측).
**이 숫자는 삭제의 부산물이지 목표가 아니다.** 줄이는 것 자체를 작업 목표로 삼지 않는다 —
대부분은 지울 코드가 사라지면서 함께 없어진 것이고, 남은 107건은 최종 KEEP 범위 확정 후에 다룬다.

작업 순서는 다음과 같다. **REMOVE dependency closure를 먼저 완료하고, 그 뒤에 남은
최종 KEEP 코드의 ops 타입 오류를 0으로 만든다.** 삭제 후보 코드의 타입 오류를 먼저 고치지
않는다 — 지울 코드를 고치는 것은 버려질 작업이고, 삭제만으로 사라질 오류다.
타입 기반 복원을 어떤 방법으로 할지는 KEEP 범위가 확정된 뒤에 결정한다.

## 5. 현재 생존 지표판

| 지표 | 현재 상태 | 다음 증거 |
|---|---|---|
| production health/auth | **PASS** - 최근 배포 200, 창업자 실제 로그인 정상 확인 | 재발 시에만 재검증 |
| GHA DB 인증 | **PASS / 종결** - 2026-09-08 04:32 UTC 자연 실행 성공 (아래 증거) | 재발 시에만 재검증 |
| Moderation | **PASS** - lifecycle 수정 후 자연 실행 success, AuthenticationFailed 0 | 정기 실행 유지 |
| Gate 2 | **REMOVE 종결 (2026-09-08)** — workflow disabled + dependency closure 제거(PR #434). PR #427은 **CLOSED**(merge 0) | 없음 — 재조사 금지. 판정 근거는 이 상태판과 PR #434다 |
| 커뮤니티 회복 | **FAIL** - 네 숫자 단순 관찰 중 (§5-A) | 회복 추세. 기존 North Star 1명은 **임시 참고치** |
| 어드민 대시보드 | `northStar=4`는 재방문+작성이 아니라 7일 WAU. `DailyKpiSnapshot` 최신 행은 2026-08-23에서 정지 | **R6 대상** — 오래된 KPI·지표·스냅샷·대시보드 KEEP/REMOVE 판정 |
| 네이버 | 기술 노출면 정상, 유입 고점 대비 **99.3% 감소** | Search Advisor 수집·색인·노출, 브랜드 홈 색인 확인 |
| 콘텐츠 출혈 | **PASS - 2026-09-09 SEED 봇·참여 유도·합성 댓글 파동 코드를 전부 제거. `prisma.comment.create` 를 호출하는 에이전트 0건** | 자동화 재개 전까지 0 유지 |
| 공개 콘텐츠 | 839건 중 non-USER 768건(91.5%) | 사용자 반응·검색 신호를 포함한 처분 데이터룸 |
| 실회원 참여 | 188명, 최근 7일 신규 0명·글 9건·댓글 1건 | 네 숫자의 회복 추세 (§5-A) |

현재 숫자가 없는 항목을 PASS로 추정하지 않는다.

## 5-A. 커뮤니티 회복 관찰 방식 (R8)

**복합 지표를 만들지 않는다.** 당분간 아래 네 숫자를 각각 그대로 관찰한다.

| 관찰 대상 | 최근 실측 (2026-09-08) |
|---|---|
| 신규 가입(실회원) | 7일 **0명** / 30일 6명 |
| 실회원 글 | 7일 **9건** / 30일 14건 |
| 실회원 댓글 | 7일 **1건** / 30일 26건 |
| 재방문 회원 | 7일 방문일 2일 이상 **2명** |

- 기존 North Star 수치 **1명은 임시 참고치**다. **개발 게이트도 확정 목표도 아니다.**
- **복합 North Star 시스템 구현은 HOLD.** 계산식·표시·테스트를 새로 만들지 않는다.
- **충분한 실사용 표본이 생기기 전까지 DB 컬럼·스냅샷·그래프를 추가하지 않는다.**
- 표본이 한 자릿수인 동안 지표 정의를 정교하게 만드는 일은 회복에 기여하지 않는다.
- 어드민 `northStar=4`가 재방문+작성이 아니라 7일 WAU라는 사실은 기록으로 남긴다.
  화면 표기 정정은 R6 대상(오래된 KPI·지표·스냅샷·대시보드)으로 넘긴다.

## 6. 열린 P0와 실행 순서

| 순위 | 작업 | 상태/트리거 | 완료 조건 |
|---:|---|---|---|
| ~~0~~ | ~~GHA DB 인증 증명~~ | **종결 2026-09-08** | run `34187374847` success · AuthenticationFailed 0 |
| 1 | `DIRECT_URL` 정정 | 창업자 액션 | GitHub/local direct URL이 user `postgres`, port 5432 |
| 2 | 네이버 Search Advisor 기준선 | 창업자 콘솔 확인 | 수집·색인·노출과 브랜드 홈 상태 기록 |
| ~~3~~ | ~~PR #427 Gate 2~~ | **종결 2026-09-08** | Gate 2 = **REMOVE** 판정. PR #427 **CLOSED**(merge commit 없음) · workflow `disabled_manually` · dependency closure 제거 PR 작성 |
| 4 | **기반 단순화 / 레거시 제거 (R4·R5·R6)** | 대상별 read-only 판정부터 | 5종 분류 판정표 확정 → 승인된 작은 PR로 dependency closure 제거 |
| 5 | R3 공개 non-USER 데이터룸 | Search Advisor와 병렬 가능 | 768건의 보존·noindex·격리·리라이트·삭제 후보표 |
| 6 | R8 관찰 | 상시 | 네 숫자를 각각 기록. 구현 없음 |

### GHA DB 인증 종결 증거 (재조사 금지)

| 항목 | 값 |
|---|---|
| run | `34187374847`, event `schedule` |
| headSha | `384a1e35` |
| 시각 | 2026-09-08 04:32:52 → 04:34:01 UTC |
| conclusion | **success** (job `moderate` 및 전 스텝 success) |
| 시작 로그 | `[Runner] coo:moderator 시작 (automation_status=PAUSED)` |
| 완료 로그 | `[COO] 모더레이션: 모더레이션 완료: 숨김 0건, AI 리뷰 0건` |
| `AuthenticationFailed` 계열 | **0건** (`[Runner] … 실패` 로그도 0건) |
| DB write 증거 | `BotLog` `COO / run / SUCCESS` 행이 같은 초에 기록 |

`agents/cron/runner.ts`는 성공 시 별도 로그를 남기지 않는다(시작·실패만 기록하고 exit code로 판정).
따라서 `[Runner] … 완료` 줄은 원래 존재하지 않으며, 위 4가지가 완료 증거다.

### 병렬 진행 규칙

- 순위 3은 **REMOVE로 종결됐다(PR #434).** 판정 근거는 다음 다섯이다.
  ① `deployment_status` 는 배포 성공 **후** 이벤트라 Gate 2 는 배포를 차단할 수 없었다.
  ② runner 핸들러가 `.then(() => {})` 라 `main()` 의 첫 `await` 에서 프로세스가 죽어
     **도입(2026-04-07) 이래 완주 0회** — Slack·AdminQueue·BotLog 산출 0건, 최근 100 run failure 0건.
  ③ 검사 스텝이 전부 `continue-on-error` 라 무검증 배포가 초록불로 보였다(false-green).
  ④ cron-links 는 `ci.yml` `agents-check` 와 동일 스크립트, 광고는 `E2E Ads` 와 동일 spec 중복이고
     Lighthouse·참여이벤트 결과는 판정 에이전트가 참조조차 하지 않았다.
  ⑤ 유일한 고유 검사인 smoke 는 실서비스 도메인이 아니라 `SITE_URL`(`*.vercel.app`)을 검사했다.
  PR #427 은 merge 없이 close 했다. 상세 조사 기록은 저장소 밖 `unao-reports/r4-gate2-keep-remove-audit.md`
  에 **보조 증거**로 남아 있으나, 판정 정본은 이 상태판과 PR #434다.
- **순위 4가 현재 핵심 프로그램이다.** 지표 작업이 기반 단순화를 막지 않는다.
- 순위 2·4·5는 병렬 진행한다.
- 순위 6은 관찰이므로 다른 작업을 막지 않는다. R8 관찰 결과를 기다리느라 기반 단순화를 미루지 않는다.

## 7. 날짜별 Rescue 게이트와 기대값

T+0은 2026-09-05 KST다. 날짜가 지나도 증거가 없으면 PASS로 넘기지 않고 지연으로 기록한다.

| 체크포인트 | 날짜 | 기대값 | 현재 판정 |
|---|---|---|---|
| T+7 생존 1차 | 2026-09-12 | 로그인 실제 여정 정상, 저품질 신규 누적 중단, 네이버 지표 관찰 시작 | 로그인 **PASS**, 나머지 진행 중 |
| T+14 신뢰 정리 | 2026-09-19 | 콘텐츠 데이터룸을 근거로 noindex·격리·리라이트·삭제 실행 여부 결정 | **대기** |
| T+30 회복 판정 | 2026-10-05 | 네이버 수집·색인·노출·클릭과 실회원 반응을 T+7 기준선과 비교 | **대기** |
| T+90 사업 판단 | 2026-12-04 | 우나어 유지·축소·소란소란 집중·병렬 지속 중 하나를 근거로 결정 | **대기** |

## 8. 현재 허용·중단선

### 허용

- 자연 스케줄과 production read-only 관찰
- R0 문서 정본화
- 네이버·콘텐츠·자동화의 read-only 진단
- 이미 merge된 변경의 production 검증
- **기반 단순화 대상의 5종 분류 read-only 판정** — 판정표까지가 승인 없이 갈 수 있는 범위
- **R8 네 숫자 관찰** — read-only 집계만. 구현 없음

### 재조사 금지 (종결 항목)

- **R1 로그인** — 창업자 운영 확인으로 PASS. 실사용 장애 재발 시에만 다시 연다
- **GHA DB 인증** — run `34187374847`로 종결(§6 증거표). 같은 항목을 다시 진단하지 않는다

### 승인 없이 하지 않는 것

- **제거 PR 실행** — 판정표는 승인 없이 만들 수 있으나 실제 삭제는 창업자·Codex 승인 후
- workflow/launchd 활성화·비활성화
- SEO 노출면 변경
- 콘텐츠 대량 숨김·삭제·리라이트
- 대규모 타입·디자인 리팩토링
- **복합 North Star 계산·표시 구현, DB 컬럼·스냅샷·그래프 추가**
- 소란소란 코드·문서와 우나어 Rescue 혼합

## 9. 기반 단순화 / 레거시 제거 — 현재 핵심 프로그램 (R4·R5·R6)

**새 단계가 아니다.** 기존 R4·R5·R6을 하나의 목적으로 묶어 실행한다. 전략 정본은 마스터플랜 §5-S다.

### 단계별 범위와 현재 파악된 것

| 단계 | 대상 | 현재 파악된 것 |
|---|---|---|
| **R4** | C-level 및 역할극 에이전트 | **ORG_THEATER 10 + SUPERSEDED 4 + `cto:qa-verify` + GROWTH_LEGACY 13 제거(09-08), SEED 봇 4 + COO 참여 유도 7 제거(09-09).** C-level 삭제 후보 잔여 **0** |
| **R4** | 사용하지 않는 workflow · runner · registry | **종결(2026-09-09).** runner HANDLERS **6개** · cron linked **7** · orphaned **0**. GHA **10개** 중 활성 4(ci · lighthouse · quarantine-check · agents-moderation). `automation_status: PAUSED` 라 실제 실행 경로가 있는 것은 `coo:moderator` 하나다. 저장소 launchd plist 2개 |
| **R4** | 보지 않는 Slack · 리포트 · AdminQueue 자동화 | Slack "NSM" 2벌(`ceo/weekly-report.ts` · `cdo/kpi-collector.ts`)이 **모두 삭제됨(2026-09-08)**. 남은 Slack 리포트는 개별 KEEP 근거로 재판정한다 |
| **R5** | 오도·중복·정지된 문서 | **종결(2026-09-09, PR #443).** 런타임이 읽는 것은 `automation_status` 필드 하나와 프롬프트로 주입되는 `constitution.yaml` 본문뿐임을 확인하고, 소비처 0 인 분할 constitution 5개를 제거했다. 죽은 계약(qa_agent · 봇 댓글 수치 · 헬스체크 도메인)과 SERVICE_ARCHITECTURE 의 "핸들러 93개" 표를 실측으로 교체. **NORTH_STAR.md 는 무변경 — 복합 North Star 계산은 HOLD 유지** |
| **R6** | 오래된 KPI · 지표 · 스냅샷 · 대시보드 | **REMOVE 완료(2026-09-09)** — KPI 스냅샷 workflow·수집기·KpiHistoryPanel·전용 조회, ops 일일 리포트, design 광고 루프 제거. `DailyKpiSnapshot` **DB 모델과 기존 데이터는 보존**(migration 없음). `northStar`가 WAU인 표기 정정은 미결 |
| **R6-F** | UI · 디자인 도구 재감사 | **완료(2026-09-09).** figma-first·FIGMA_STRUCTURE·DESIGN_WORKFLOW·Product Designer 템플릿 제거, `ops-runner-manifest` 의 실재하지 않는 Figma launchd 2개 정리. CLAUDE.md 는 "Figma 를 기본 절차로 강제하지 않고 명시 요청 시에만 사용"으로 확정. **UI 규칙·디자인 토큰·BRAND_VISUAL_GUIDE 는 보존** |
| **R6** | 어드민 E2E CI 게이트 | **완료(2026-09-09).** 기존 `E2E Admin` job 은 자격증명이 없으면 `exit 0` 이라 **한 번도 실행되지 않은 채 success** 였다(false-green). `vars.E2E_ADMIN_ENABLED` 가 있을 때만 도는 job-level 스위치로 바꿔 기본을 **명시적 skipped** 로 두고, 활성화 후 대상 URL·자격이 비면 **실패**시킨다. 대상은 `vars.E2E_ADMIN_BASE_URL` 이며 실서비스 도메인이면 테스트 전에 즉시 실패한다. 운영 게시글을 숨기고 지우던 `e2e/08-admin-service-sync.spec.ts` 는 제거했다 |
| **R4 B-3** | 외부 카페 · Google Sheet 공급망 | **REMOVE 종결(2026-09-09, merge `ed99af66`).** 핸들러 **19키**(B-3 17 + 종속 `cto:crawler-health` · `coo:content-scheduler`) · workflow 5개 · `agents/community/**` · `agents/magazine/**` · `agents/core` 고아 9개 · 카페 크롤·큐레이션·브리프·매거진·세션 모듈 제거. 코드 **−28,436줄**. **persona SSoT 와 `qa:content-audit` 가 쓰는 이미지 생성기는 보존.** DB 모델·기존 데이터 무변경(migration 0) |
| **R6** | 일회성 scripts · backfill · persona SSoT | **종결(2026-09-09, PR #444).** persona SSoT 사슬 전체가 runtime importer 0(닫힌 순환 + 테스트·일회성 스크립트만 진입)임을 그래프로 확인하고 제거. 일회성 scripts 16건과 `scripts/smoke-test.ts` REMOVE. 어드민 `northStar` 는 새 지표 없이 실제 산식(7일 WAU)에 맞춰 이름·표시만 정합화 |
| **R6** | 미사용 API · 패키지 · 환경변수 · 테스트 | **PARTIAL.** `GOOGLE_INDEXING_*` 제거(소비처 0), `GOOGLE_SERVICE_ACCOUNT_JSON`·`IMAGE_GENERATOR` 는 소비처가 있어 보존. 삭제 대상 전용 테스트는 함께 제거했다. 패키지 의존성 감사는 미착수 |

### 유지 분류 (5종)

| 분류 | 정의 |
|---|---|
| **KEEP_CORE** | 창업자가 승인한 핵심 제품이며 **실제 사용 증거가 있음** |
| **KEEP_SAFETY** | 보안 · 개인정보 · 데이터 정합성에 필요 |
| **KEEP_RECOVERY** | **실행 절차와 사용 조건이 문서화된** 복구 도구 |
| **REMOVE** | 위 근거가 없거나 대체 경로가 있음 |
| **FOUNDER_DECISION** | 코드와 운영 증거만으로 **사업 의도를 확정할 수 없음** |

> **route·registry·workflow에 존재한다는 사실 자체는 KEEP 근거가 아니다.**
> "언젠가 쓸 수 있음", "등록돼 있음", "코드가 남아 있음"도 근거가 아니다.
> 복구 도구는 실행 절차와 사용 조건이 문서로 있어야 KEEP_RECOVERY다. 이름만으로는 안 된다.

### 완료 기준

1. REMOVE 대상은 코드뿐 아니라 **runner · registry · workflow · env · 문서 · 테스트 · 패키지 참조까지
   dependency closure 전체가 제거**돼야 한다. 코드만 지우고 참조가 남으면 완료가 아니다.
2. **남긴 항목마다 유지 분류와 그 근거인 운영 증거가 기록**돼야 한다. 근거 없이 남은 항목이
   하나라도 있으면 완료가 아니다.
3. FOUNDER_DECISION 항목은 창업자 판단 전까지 미결로 두되, 목록과 판단에 필요한 정보를 함께 제시한다.

### 진행 규칙

- 판정은 read-only로 먼저 한다. 참조원(runner·registry·workflow·env·문서·테스트·패키지)까지 묶어 판정표를 만든다.
- 제거는 되돌리기 쉬운 작은 PR로 나눈다. 삭제 전 재가동 방지선을 먼저 둔다.
- 이미 만든 read-only dependency closure는 **증거로 보존**하되 그 자체가 삭제 승인은 아니다.
- ~~Gate 2와 PR #427 판정~~ → **2026-09-08 종결. Gate 2 = REMOVE, PR #427 = CLOSED.**
- **타입 복구는 REMOVE 이후다.** 삭제 예정 코드의 타입 오류는 고치지 않는다. KEEP 범위 확정 후 최종 KEEP 코드만 ops tsc 0으로 만들며, 복원 방법은 그때 결정한다.
- **SocialPost DB 모델**: 생산자(SNS 게시·메트릭 에이전트)는 2026-09-08 제거됐다. **DB 모델과 기존 데이터는 유지**하며
  후속 **R6 데이터 모델 감사** 대상으로 넘긴다. 이번 PR 에서 migration 은 하지 않았다.
- **`scripts/smoke-test.ts` → REMOVE 종결 (2026-09-09)**: 두 결함이 고쳐지지 않은 채 남아 있었다 —
  ① AdSense 슬롯 검사가 구조적 false-red(광고는 `'use client'` 지연 로드라 초기 HTML 에 없는 것이 정상)
  ② `/api/events` POST 에 `x-bot-type` 미부착. Gate 2 제거 때 "공식 절차로 안내하지 마라"로 판정했고,
  그 뒤로도 호출부가 생기지 않았다. 고쳐서 쓰는 대신 제거한다 — 배포 확인은 `/api/health`·`/api/health/auth`·
  sitemap read-only 점검과 CI E2E 로 한다. `npm run smoke-test` 스크립트도 함께 제거했다.
- 기타 후보: 도메인·env fallback·모델 ID·localStorage key 단일화.

### 소비처 0 DB 모델 — read-only 측정 판정표 (2026-09-09)

Prisma **SELECT(count/findFirst)만** 사용해 측정했다. raw SQL·export·delete·migration 없음.
**이번 배치에서 아무것도 삭제하지 않았다.**

| 모델 | 건수 | 최초 | 최종 | 상태별 | 분류 |
|---|---|---|---|---|---|
| `ChannelDraft` | 653 | 2026-04-02 | 2026-05-15 | PENDING=653 | 역사 보존 |
| `CommentWaveQueue` | 276 | 2026-08-21 | 2026-08-24 | — | 역사 보존 |
| `SocialPost` | 119 | 2026-03-26 | 2026-05-16 | FAILED=8 · DRAFT=2 | 역사 보존 |
| `DailyKpiSnapshot` | 61 | 2026-06-29 | 2026-08-23 | — | 역사 보존 (지표 시계열) |
| `NaverBlogQueue` | 16 | 2026-05-15 | 2026-05-30 | — | 역사 보존 |
| `UserPostWaveQueue` | 11 | 2026-09-05 | **2026-09-09** | — | **개인정보 인접** — `authorId`(실회원 userId) 보유 |

**빈 모델은 하나도 없다.** 따라서 "비어 있으니 지운다"는 경로는 없다.

- `UserPostWaveQueue` 의 최종 생성일이 **2026-09-09** 인 것은 producer 를 그날(PR #439) 제거했기 때문이다.
  실회원 `authorId` 를 담고 있어 다른 다섯과 성격이 다르다 — 삭제하려면 개인정보 처리 기준으로 판단한다.
- `DailyKpiSnapshot` 은 2026-06-29~08-23 의 UV·PV·가입·WAU 시계열이다. 지우면 그 기간 지표를 복원할 수 없다.
- 나머지 넷은 종료된 봇 자동화의 산출 기록이다.

삭제·migration 은 데이터 보존·복구 계획을 먼저 정하고 **별도 배치**로 한다.

- 기타 후보: 도메인·env fallback·모델 ID·localStorage key 단일화.

### 소비처 0 DB 모델 — 후속 판정 대기 (2026-09-09 실측, **이번 배치에서 삭제·migration 하지 않음**)

`prisma.<model>` 접근이 `src/`·`agents/`·`scripts/` 어디에도 없는 모델이다.
**모델과 기존 데이터는 그대로 둔다.** 삭제하려면 데이터 보존·복구 계획을 먼저 정하고 별도 migration 배치로 한다.

| 모델 | 생산자였던 것 | 제거 시점 |
|---|---|---|
| `CommentWaveQueue` | 봇 댓글 파동 producer/consumer | R4 (2026-09-09, PR #439) |
| `UserPostWaveQueue` | 실회원 글 발행 후 자동 댓글 파동 | R4 (2026-09-09, PR #439) |
| `DailyKpiSnapshot` | KPI 스냅샷 수집기 | R4 B-5 (2026-09-09) |
| `SocialPost` | SNS 게시·메트릭 에이전트 | R4 GROWTH_LEGACY (2026-09-08) |
| `ChannelDraft` | 채널 시딩 에이전트 | R4 GROWTH_LEGACY (2026-09-08) |
| `NaverBlogQueue` | 네이버 블로그 발행 | ARCHIVED 2026-06-04 |

- **B-3 이후 고아가 된 `agents/core/` 모듈 9개는 2026-09-09 제거 완료**: `age-fit-blocklist` · `celebrity-race-blocklist` ·
  `content-quality-rules` · `coupang` · `google-api` · `intelligence` · `medical-advice-blocklist` · `political-blocklist` · `slug`.
  전부 runtime importer 0 이었다(테스트만 참조). **호출 경로가 없으면 안전 기능이 아니다** — 이름만 보고 남기지 않는다.
  `coo:moderator` 로 옮기는 것은 신규 정책·동작 추가라 이번 범위가 아니었다. 필요하면 별도 판정으로 새로 설계한다.
  사용자 기능인 `src/lib/coupang.ts` 와 쿠팡 컴포넌트는 보존했다.
  (B-3 이전부터 고아였던 `approval-helper` · `locks` · `trending` 은 별건으로 남아 있다 — 후속 R6.)
- **persona SSoT 는 B-3 범위 밖이다.** `agents/core/persona-registry.ts` → `cafe/curator-personas` ·
  `cafe/curator-shared` · `seed/persona-data` 사슬은 `coo/persona-matcher-*` 가 계속 쓰므로 보존했다.
  어디까지 남길지는 별도 배치로 판정한다.
- **REGISTRY A16~A19(COO 참여 유도 4건)는 PR #438 에서 코드만 지우고 행이 ACTIVE 로 남아 있었다.**
  단일 진실의 원천에 없는 코드가 ACTIVE 로 적혀 있는 상태라 이번에 함께 ARCHIVED 로 정정했다.
- **어드민 E2E 자격증명 (2026-09-09 확정)**: `E2E_ADMIN_EMAIL`·`E2E_ADMIN_PASSWORD` 에 **production 어드민 계정을 등록하지 않는다.**
  qa-admin 은 어드민 화면을 조작하는 시나리오라 대상 사이트에 부수효과가 남는다. **격리된 staging 과 전용 테스트 계정**이
  마련되기 전까지 이 job 은 `vars.E2E_ADMIN_ENABLED` 미설정으로 **명시적 disabled/skipped** 상태를 유지한다.
  계약은 `src/__tests__/e2e-admin-guard.test.ts` 가 정적으로 고정한다.
- **PR #439 어드민 화면 검증 (2026-09-09)**: Codex 가 별도 임시 worktree에서 로컬 전용 관리자 JWT와 `OPS_BOARD_READONLY_URL` 로
  **read-only 로컬 렌더링** 검증을 완료했다 — 모든 POST 차단, production 로그인 호출 없음, DB write 0.
  결과: 데스크톱 1440px·모바일 390px 정상, `/admin` 200, 관리자 오류 없음, 삭제된 KPI 패널 자리의 빈 공간 없음,
  가로 overflow 없음, 실시간 KPI·OKR·인사이트·리텐션 정상 표시.

## 10. 역할과 보고 규칙

- 창업자: 목적·영구 폐기·외부 콘솔 변경 최종 승인.
- Codex: 목적, 순서, 금지선, PASS 기준을 정하고 Claude 보고를 독립 검증.
- Claude Code: 지정된 범위의 read-only 진단·구현·검증. 승인 전 merge 금지.

모든 보고는 `현재 판정 -> 목적 -> AS-IS -> 문제/원인 -> 위험 -> 다음 액션 -> PASS 기준`을
포함한다. 작업 완료 보고만 있고 상위 마일스톤 변화가 없으면 Rescue 완료로 세지 않는다.

## 11. 갱신 규칙

- 상태가 바뀌는 merge 또는 운영검증 직후 이 문서를 같은 책임자가 갱신한다.
- 완료에는 PR/commit, production, 운영지표 중 해당되는 증거를 연결한다.
- 오래된 handoff와 report는 수정하지 않고 역사 기록으로 둔다.
- 이 상태판과 실제 코드·workflow·DB가 다르면 실제 상태를 우선하고 문서를 즉시 정정한다.
