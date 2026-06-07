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
- `f01_signup_content` — 가입배너 문구 A/B/C (혜택/재미/공감)
- `f01_signup_timing` — 가입배너 타이밍 early(현행) vs read_complete(정독 85% 후)

## 이력
| 날짜 | 변경 | 이유 |
|---|---|---|
| 2026-06-07 | 인프라 신규 — 레지스트리/배정/통계 + 어드민 현황·편집 + ExperimentState | A/B 다수 진행 위한 중앙 운영·기록·관리 |

## 비고 / 후속
- **F01 SignupPromptBanner는 EventLog 이벤트로 이미 어드민에 집계됨** → 어드민 현황은 마이그레이션과 무관하게 F01 실데이터 표시.
- **단계 5(F01 배정 로직을 getExperimentVariant로 통일)는 선택/후순위**: 동등성 8샘플 실측 PASS(동작 동일)이나 회원가입 퍼널 민감 → 실기기 검증 후 진행.
- **ExperimentState 마이그레이션 필요(프로덕션 DB)**: 적용 전에는 어드민 상태=코드 default(ACTIVE), 편집 저장은 마이그 후 작동.
