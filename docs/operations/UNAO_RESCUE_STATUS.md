# 우나어 Rescue 현재 상태판

최종 갱신: 2026-09-08 KST
기준 main: `384a1e35` (PR #432)
상태: **R0 싱크 기준 확정 / Rescue 진행 중 — GHA DB 인증 종결, North Star 측정 계약 확정**

이 문서는 현재 판정과 다음 게이트만 관리한다. 서비스 본질은
`docs/constitution/NORTH_STAR.md`, Rescue 전략과 완료 기준은
`docs/operations/2026-09-05-unao-rescue-mode-master-plan.md`가 정본이다.

## 1. 한 줄 판정

> 우나어는 코드 청소 단계가 아니라 소생 작전 중이다. 로그인과 GHA DB 인증은 운영 PASS로 종결됐다.
> 네이버·콘텐츠·커뮤니티 생존 지표를 최신 데이터로 판정할 수 있을 때까지 Rescue는 끝나지 않는다.
> North Star는 측정 계약이 확정됐고 구현·재측정 전까지 확정 기준선이 없다.

## 2. 목적과 North Star

- 목적: 우나어를 네이버와 사용자에게 다시 신뢰받는 커뮤니티로 소생시킨다.
- 본질: 40대 중반~60대 중반 여성이 "나만 이런 게 아니구나"를 확인하고 다시 참여하는 공간.
- North Star: 최근 7일 안에 재방문했고 글 또는 댓글을 1회 이상 남긴 고유 사용자 수.
  조작적 정의(창·활동일·참여 조건)는 §5-A가 정본이다.
- 수단: SEO, 일자리, 매거진, 크롤러, 에이전트, 광고, 운영 대시보드.

PV, DAU, 색인 수, 자동 발행량, 에이전트 수는 단독 성공 지표가 아니다.

## 3. R0~R8 현재 판정

| 단계 | 현재 판정 | 완료된 것 | 남은 완료 조건 |
|---|---|---|---|
| R0 싱크 고정 | **PASS** | North Star > Rescue 전략 > 현재 상태 > backlog 위계와 시작 게이트 확정 | 이후 모든 세션이 이 문서 세트를 먼저 읽고 충돌 시 중단 |
| R1 로그인 소생 | **PASS** | health/auth no-store, 내부 DB 오류 노출 차단, 창업자 production 실제 로그인 정상 확인, 최근 7일 실회원 글 9건 | **없음 — 재진단 금지.** 실사용 장애가 재발할 때만 다시 연다 |
| R2 네이버 신뢰 방어 | **PARTIAL / 위험** | sitemap·robots·canonical 기술 방어선 정상 | Search Advisor 수집·색인·노출 확인. 네이버 유입 고점 대비 99.3% 감소 원인 판정 |
| R3 콘텐츠 오염 정리 | **PARTIAL** | BOT·SHEET 신규 발행 16일간 0, 기존 오염 콘텐츠 1차 격리 | 공개 non-USER 768건의 source/reaction/search/duplication 처분표 확정 |
| R4 자동화 사망 정리 | **PARTIAL** | PAUSED, bot write 차단, cron/handler 가드, dead job 정리, **GHA DB 인증 운영 PASS** | PR #427, KEEP/OFF/REMOVE 최종 반영 |
| R5 문서 정본화 | **PARTIAL** | 정본 위계와 시작 게이트 확정, 충돌 문서와 소란소란 혼입 일부 정리 | stale backlog/registry 정합화 |
| R6 코드/인프라 | **PARTIAL** | RLS·캐시·계측·E2E·cron·레거시 일부 정리 | ops tsc 0, config 단일화, R6-F 디자인 시스템 |
| R7 콘텐츠 재건 | **HOLD** | 기존 gate와 복구 도구 일부 존재 | R1~R6 이후 우나어식 원본 공급·발행 gate 승인 |
| R8 커뮤니티 회복 | **FAIL / 측정 계약 정합화 중** | 2026-09-08 임시 측정값 1명 확보, 측정 계약 결정 승인(§5-A) | 승인된 산식 구현 후 재측정 → 확정 기준선. 그 뒤 재방문 참여 유저와 실회원 글·댓글 추세 회복 |

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

R6 정리 과정에서 agents/scripts 타입 오류는 `953 -> 932`로 줄었다. 감소 자체가 완료 기준은
아니며 `agents/core/db.ts` 타입 복원 후 0이 되어야 타입 안전성 복구로 판정한다.

## 5. 현재 생존 지표판

| 지표 | 현재 상태 | 다음 증거 |
|---|---|---|
| production health/auth | **PASS** - 최근 배포 200, 창업자 실제 로그인 정상 확인 | 재발 시에만 재검증 |
| GHA DB 인증 | **PASS / 종결** - 2026-09-08 04:32 UTC 자연 실행 성공 (아래 증거) | 재발 시에만 재검증 |
| Moderation | **PASS** - lifecycle 수정 후 자연 실행 success, AuthenticationFailed 0 | 정기 실행 유지 |
| Gate 2 | workflow는 active, `qa:deploy-audit`은 PAUSED에서 실질 스킵 | PR #427 **최신 main 재검증 대기** → 승인 후 merge → 실제 audit 결과 |
| North Star | **FAIL - 1명 (기존 EventLog 전용 임시 측정값)** | 승인 산식 구현 후 재측정. 이 1명을 확정 기준선으로 쓰지 않는다 |
| 어드민 대시보드 | `northStar=4`는 재방문+작성이 아니라 7일 WAU | 표시명·계산 계약 정합화 (§5-A) |
| 네이버 | 기술 노출면 정상, 유입 고점 대비 **99.3% 감소** | Search Advisor 수집·색인·노출, 브랜드 홈 색인 확인 |
| 콘텐츠 출혈 | **PASS - BOT·SHEET 신규 발행 16일간 0** | 자동화 재개 전까지 0 유지 |
| 공개 콘텐츠 | 839건 중 non-USER 768건(91.5%) | 사용자 반응·검색 신호를 포함한 처분 데이터룸 |
| 실회원 참여 | 188명, 최근 7일 신규 0명·글 9건·댓글 1건 | North Star와 댓글 추세 회복 |

현재 숫자가 없는 항목을 PASS로 추정하지 않는다.

## 5-A. North Star 측정 계약 — 승인된 결정

헌법 정의(`NORTH_STAR.md:312-314`)는 그대로 두고, 헌법이 비워 둔 조작적 정의만 아래로 확정한다.
설계 근거: `unao-reports/r8-p0-north-star-measurement-contract.md`.

| 항목 | 승인된 결정 |
|---|---|
| 창(window) | **최근 168시간** |
| 재방문 판정 | 창 안 **서로 다른 KST 활동일 2일 이상** |
| 활동일로 인정하는 신호 | `page_view` · `login` **이벤트** + **정상 USER 글 / ACTIVE 댓글 작성일** |
| 참여 조건 | **같은 창에서 글 또는 댓글 1회 이상** |
| 공감(Like) | **제외** — 헌법 원문이 "글 또는 댓글"이다 |
| WAU | **기존 산식 그대로** `weeklyActive`로 보존. 계산을 바꾸지 않고 이름만 옮긴다 |
| 기준선 | **구현 후 재측정**한 값을 확정 기준선으로 쓴다. **4주 시계열 전까지 목표 수치를 정하지 않는다** |

보충 기준

- 실회원 = `User.providerId`가 순수숫자(카카오) **AND** `role <> 'ADMIN'`.
- 참여 판정 필터 = 글 `source='USER' AND status='PUBLISHED'`, 댓글 `status='ACTIVE' AND authorId IS NOT NULL`.
  soft delete가 기본이므로 status를 걸지 않으면 썼다 지운 글이 참여로 남는다.
- 게스트 댓글(`authorId = null`)은 재방문 판정 자체가 불가하므로 North Star 밖 보조지표로 둔다.
- 작성일을 활동일로 인정하는 이유: 로그인 사용자 `page_view`의 userId 부착률이 낮아
  EventLog만으로는 "참여했는데 재방문으로 안 잡히는" 과소집계가 발생한다.
- WAU를 그대로 보존하므로 `DailyKpiSnapshot.wau`의 의미도 바꾸지 않는다. North Star는 별도 컬럼으로 적재한다
  (스키마 변경은 창업자 HANDOFF, `/prisma-guide` 절차).

**현재 1명은 기존 EventLog 전용 임시 측정값이다.** 작성일을 활동일로 인정하지 않은 산식이라
승인된 계약보다 과소집계이며, **확정 기준선으로 인용하지 않는다.**

## 6. 열린 P0와 실행 순서

| 순위 | 작업 | 상태/트리거 | 완료 조건 |
|---:|---|---|---|
| ~~0~~ | ~~GHA DB 인증 증명~~ | **종결 2026-09-08** | run `34187374847` success · AuthenticationFailed 0 |
| 1 | `DIRECT_URL` 정정 | 창업자 액션 | GitHub/local direct URL이 user `postgres`, port 5432 |
| 2 | 네이버 Search Advisor 기준선 | 창업자 콘솔 확인 | 수집·색인·노출과 브랜드 홈 상태 기록 |
| 3 | PR #427 Gate 2 | **최신 main 재검증 대기** | 재검증 통과 → Codex 승인 → merge → 실제 deploy audit |
| 4 | North Star 계약 정합화 | 설계·결정 완료(§5-A), **구현 대기** | 승인된 산식을 계산·표시·테스트에서 단일 사용 |
| 5 | R3 공개 non-USER 데이터룸 | Search Advisor와 병렬 가능 | 768건의 보존·noindex·격리·리라이트·삭제 후보표 |
| 6 | R4/R6 구조 정리 재개 | R2/R3 판정 후 | 승인된 작은 PR과 운영검증 |

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

- 순위 3은 DB 인증 종결로 차단이 풀렸다. 다만 **최신 main 재검증 전에는 merge하지 않는다.**
- 순위 2·4·5는 병렬 진행한다. 순위 4는 read-only 설계가 끝났고 구현은 Codex 승인 후 시작한다.
- 대기 시간을 추가 코드 삭제로 채우지 않는다. 네이버·콘텐츠·실회원 기준선을 확보하는 데 쓴다.
- R2/R3 판정이 끝나기 전에는 순위 6의 구조 정리 PR을 새로 만들지 않는다.

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
- PR #427의 최신 main 재검증 (merge는 Codex 승인 후)

### 재조사 금지 (종결 항목)

- **R1 로그인** — 창업자 운영 확인으로 PASS. 실사용 장애 재발 시에만 다시 연다
- **GHA DB 인증** — run `34187374847`로 종결(§6 증거표). 같은 항목을 다시 진단하지 않는다

### 현재 생존 판정 전 중지

- ORG_THEATER를 포함한 추가 에이전트 삭제 PR
- workflow/launchd 활성화·비활성화
- SEO 노출면 변경
- 콘텐츠 대량 숨김·삭제·리라이트
- 대규모 타입·디자인 리팩토링
- 소란소란 코드·문서와 우나어 Rescue 혼합

## 9. 생존 판정 이후 구조 정리 후보

우선순위는 생존 지표 판정 뒤 다시 확정한다.

1. `agents/core/db.ts` Prisma 타입 복원과 ops tsc 0
2. 대체 구현이 확인된 등록 에이전트 `DELETE_SUPERSEDED` 4개
3. 가상 조직 리포트 `DELETE_ORG_THEATER` 10개
4. 성장 자동화 `DELETE_GROWTH_LEGACY` 13개 - 창업자 영구 폐기 승인 필요
5. 도메인·env fallback·모델 ID·localStorage key 단일화
6. R6-F 디자인 시스템: token -> component -> usage rule -> CI guard -> 점진 이관

`cpo:ux-analyzer`와 Gate 2의 `checkCpoUx` 결합은 PR #427 이후 별도 판정한다.
현재 read-only dependency closure는 증거로 보존하되 삭제 승인은 아니다.

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
