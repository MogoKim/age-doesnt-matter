# 우나어 Rescue 현재 상태판

최종 갱신: 2026-09-08 KST
기준 main: `384a1e35` (PR #432)
상태: **R0 싱크 기준 확정 / Rescue 진행 중**

이 문서는 현재 판정과 다음 게이트만 관리한다. 서비스 본질은
`docs/constitution/NORTH_STAR.md`, Rescue 전략과 완료 기준은
`docs/operations/2026-09-05-unao-rescue-mode-master-plan.md`가 정본이다.

## 1. 한 줄 판정

> 우나어는 코드 청소 단계가 아니라 소생 작전 중이다. 출혈 차단과 기반 복구는 진행됐지만,
> 로그인은 운영 PASS다. 네이버·콘텐츠·커뮤니티 생존 지표를 최신 데이터로 판정할 수 있을 때까지
> Rescue는 끝나지 않는다.

## 2. 목적과 North Star

- 목적: 우나어를 네이버와 사용자에게 다시 신뢰받는 커뮤니티로 소생시킨다.
- 본질: 40대 중반~60대 중반 여성이 "나만 이런 게 아니구나"를 확인하고 다시 참여하는 공간.
- North Star: 최근 7일 안에 재방문했고 글 또는 댓글을 1회 이상 남긴 고유 사용자 수.
- 수단: SEO, 일자리, 매거진, 크롤러, 에이전트, 광고, 운영 대시보드.

PV, DAU, 색인 수, 자동 발행량, 에이전트 수는 단독 성공 지표가 아니다.

## 3. R0~R8 현재 판정

| 단계 | 현재 판정 | 완료된 것 | 남은 완료 조건 |
|---|---|---|---|
| R0 싱크 고정 | **PASS** | North Star > Rescue 전략 > 현재 상태 > backlog 위계와 시작 게이트 확정 | 이후 모든 세션이 이 문서 세트를 먼저 읽고 충돌 시 중단 |
| R1 로그인 소생 | **PASS** | health/auth no-store, 내부 DB 오류 노출 차단, 2026-09-08 창업자 production 실제 로그인 정상 확인 | 재발 시에만 진단 재개 |
| R2 네이버 신뢰 방어 | **PARTIAL** | 없는/숨김 상세 404, 고유 description, raw 외부글 landing 차단 | 최신 수집·색인·노출·클릭과 브랜드 홈 색인 판정 |
| R3 콘텐츠 오염 정리 | **PARTIAL** | 위험 자동 발행 차단, 기존 오염 콘텐츠 1차 정리 | source/reaction/search/duplication 데이터룸과 남은 처분표 확정 |
| R4 자동화 사망 정리 | **PARTIAL** | PAUSED, bot write 차단, cron/handler 가드, dead job 정리 | DB 인증 증명, PR #427, KEEP/OFF/REMOVE 최종 반영 |
| R5 문서 정본화 | **PARTIAL** | 정본 위계와 시작 게이트 확정, 충돌 문서와 소란소란 혼입 일부 정리 | stale backlog/registry 정합화 |
| R6 코드/인프라 | **PARTIAL** | RLS·캐시·계측·E2E·cron·레거시 일부 정리 | ops tsc 0, config 단일화, R6-F 디자인 시스템 |
| R7 콘텐츠 재건 | **HOLD** | 기존 gate와 복구 도구 일부 존재 | R1~R6 이후 우나어식 원본 공급·발행 gate 승인 |
| R8 커뮤니티 회복 | **미판정** | - | 최신 North Star와 실회원 글·댓글·재방문 추세 확보 |

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
| Moderation | lifecycle 수정 PASS, 최근 자연 실행은 DB 인증 실패 | 갱신된 secret으로 완료 로그 + success |
| Gate 2 | workflow는 active, `qa:deploy-audit`은 PAUSED에서 실질 스킵 | PR #427 merge 후 실제 audit 결과 |
| 운영 대시보드 | 스냅샷이 2026-08-23에서 멈춘 상태 | 현재 시점 read-only snapshot |
| 네이버 | 과거 수집·색인·유입 붕괴 이후 최신 회복 판정 없음 | 수집/색인/노출/클릭 분리 측정 |
| 실회원 참여 | 최신 공식 기준선 없음 | 7일 재방문 참여 유저·글·댓글 |

현재 숫자가 없는 항목을 PASS로 추정하지 않는다.

## 6. 열린 P0와 실행 순서

| 순위 | 작업 | 상태/트리거 | 완료 조건 |
|---:|---|---|---|
| 0 | GHA DB 인증 증명 | 자연 Moderation 실행 대기 | 완료 로그 + success, AuthenticationFailed 없음 |
| 1 | `DIRECT_URL` 정정 | 창업자 액션 | GitHub/local direct URL이 user `postgres`, port 5432 |
| 2 | PR #427 Gate 2 | DB 인증 PASS 후 | 최신 main 재검증·merge·실제 deploy audit |
| 3 | 현재 지표 복구 | #427과 독립 read-only 가능 | 대시보드·North Star·네이버 기준선 갱신 |
| 4 | R2/R3 생존 판정 | 최신 지표 후 | 검색·콘텐츠 gate별 PASS/PARTIAL/FAIL |
| 5 | R4/R6 구조 정리 재개 | 위 판정 후 | 승인된 작은 PR과 운영검증 |

### 병렬 진행 규칙

- 순위 0~2는 같은 critical path다. DB 인증 자연 실행 PASS 전에는 PR #427을 merge하지 않는다.
- 순위 3의 read-only 지표 복구는 자연 스케줄을 기다리는 동안 **즉시 병렬 진행**한다.
- 대기 시간을 추가 코드 삭제로 채우지 않는다. 네이버·콘텐츠·실회원 기준선을 확보하는 데 쓴다.
- 순위 4 판정이 끝나기 전에는 순위 5의 구조 정리 PR을 새로 만들지 않는다.

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
- 네이버·콘텐츠·자동화의 read-only 진단. 로그인은 재발 시에만 다시 연다
- 이미 merge된 변경의 production 검증

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
