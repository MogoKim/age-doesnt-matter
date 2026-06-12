# F16 — 웹 A/B 테스트 인프라

> A/B 실험을 한 곳에서 정의·기록·운영. 단일 진실 = 코드 레지스트리(불변 구조) + DB(운영 상태) + 어드민 현황/편집.

## 개요
앞으로 여러 영역에서 A/B 테스트를 진행하기 위한 중앙 운영 인프라. 흩어진 실험 배정을 레지스트리+헬퍼로 통일하고, 어드민에서 variant별 전환율을 실시간으로 보며, 직원도 목적·배경·확인방법을 코드/어드민에서 이해할 수 있게 한다.

## 구성
| 영역 | 파일 |
|---|---|
| 실험 정의 (SSOT) | `src/lib/experiments/registry.ts` |
| variant 배정 | `src/lib/experiments/assign.ts` — `getExperimentVariant(id)` (_uid 해시 결정론적 + 가중치 + localStorage) |
| 신뢰도 통계 | `src/lib/experiments/stats.ts` — 2-proportion z-test |
| 집계 쿼리 | `src/lib/queries/admin/admin.experiments-web.ts` — EventLog 메모리 집계(Raw SQL 없음) |
| 어드민 현황·편집 | `src/app/admin/(panel)/ab-tests/` (`/admin/ab-tests`) |
| 운영 상태 | `ExperimentState` 모델 (status/owner/note/conclusion) — 어드민 편집, 배포 불필요 |

## 새 실험 추가 표준 절차 (6스텝)
> 상세는 `src/lib/experiments/registry.ts` 상단 주석.
1. **registry에 정의 추가**: id, variant(종류·비율), 측정 이벤트, 목적·배경·가설·확인방법·담당(자연어)
2. **컴포넌트에서 배정**: `getExperimentVariant('myId')` (직접 해시 만들지 말 것)
3. **이벤트 발화**: `trackEvent(노출이벤트, { [variantProperty]: variant })`
4. **배포**: tsc/build → /done
5. **어드민서 활성화**: `/admin/ab-tests`에서 상태 ACTIVE + 담당·시작일
6. **운영·결론**: 신뢰 배지가 "유의미(95%)" 뜨면 결론 메모 + 종료

## 데이터·판정
- 노출 = `signup_banner_shown`(properties.content_variant / trigger_variant), 전환 = `sign_up`(같은 sessionId join). 봇·창업자 제외(isBot).
- 신뢰배지: 🟢 유의미 95%(z≥1.96, 표본 충분) / 🟡 표본 더 필요 / ⚪ 표본 부족(variant당 노출 100·합계 전환 10 미만).
- 기간 토글 7/30/전체. 캐시 10분(unstable_cache).

## 현재 등록 실험
- `twa01_entry_gate` — TWA 첫 진입 가입 게이트 A(현행)/B(soft)/C(hard). 측정=가입 후 앱 재방문(D1/D7), funnel 아님.

> **종료(2026-06-09, UT 위너 확정)**: `f01_signup_content`(문구)→**C 공감형 고정** / `f01_signup_timing`(타이밍)→**read_complete 고정**. 레지스트리에서 삭제, SignupPromptBanner 고정값. 과거 기록은 git 히스토리.

## 이력
| 날짜 | 변경 | 이유 |
|---|---|---|
| 2026-06-07 | 인프라 신규 — 레지스트리/배정/통계 + 어드민 현황·편집 + ExperimentState | A/B 다수 진행 위한 중앙 운영·기록·관리 |
| 2026-06-08 | 어드민에 게이트 재방문(D1/D7) 카드 연결 + 게이트를 funnel 목록에서 분리 | 게이트 A(현행)는 노출 이벤트가 없어 funnel 분모 0 → A 0% 오표시. 게이트는 `getGateRetention` 재방문 지표로만 본다(`page.tsx` `GateExperimentCard`). |
| 2026-06-09 | f01_signup_content·f01_signup_timing 종료(레지스트리 삭제), gtm/OnboardingForm variant 첨부 제거, e2e/22 read_complete 기준 수정, 임시 감사 스크립트 삭제 | UT 위너 확정 → 코드 고정·레거시 제거. 인프라·게이트 유지 |
| 2026-06-12 | TWA baseline 판정 교차 보강(`getTwaSignupRetention`: browser_env OR twa_gate_variant OR TWA page_view) + 게이트 표에 노출 분모/전환율 컬럼 + 캡션 동적화 + 90일 고정 뱃지 | 카카오 OAuth 복귀 시 referrer 소실로 TWA 가입자 67%(33명 중 22명)가 android-chrome으로 오기록 → baseline 31명으로 과소집계(실제 57명)·D7 재방문율 왜곡. 측정 쿼리만 보강(가입 플로우 무수정). sticky 근본수정은 백로그. 캐시키 v1→v2 |
| 2026-06-12 | 게이트 ITT(배정 기준) 측정 추가 — `twa_gate_assigned` 이벤트(TwaEntryGate, A포함 전원·세션당 1회) + `getGateITT`(배정 sessionId 분모, D1/D3/D7 재방문+가입률) + 어드민 ITT 카드 | 노출이 그룹별 조건차로 불공정(A 0·B 23·C 120) → 노출 기준 비교 불가. "보여주려 한 대상(배정)"을 최앞단 분모로 A·B·C 공정 비교. sessionId(_anon_sid 30일)가 배정→가입→재방문 연결. **과거 소급 불가**(도입 시점부터 누적). 게이트 동작 무변경(이벤트 1줄만 추가) |

## 비고 / 후속
- **F01 SignupPromptBanner는 EventLog 이벤트로 이미 어드민에 집계됨** → 어드민 현황은 마이그레이션과 무관하게 F01 실데이터 표시.
- **단계 5(F01 배정 로직을 getExperimentVariant로 통일)는 선택/후순위**: 동등성 8샘플 실측 PASS(동작 동일)이나 회원가입 퍼널 민감 → 실기기 검증 후 진행.
- **ExperimentState 마이그레이션 필요(프로덕션 DB)**: 적용 전에는 어드민 상태=코드 default(ACTIVE), 편집 저장은 마이그 후 작동.
