# TWA 첫 진입 가입 게이트 실험 — 종료 아카이브 (A 위너)

> **배경**: 앱(TWA)으로 들어온 사람에게 **첫 화면부터 "카카오로 가입하세요" 게이트**를 띄우면 진짜 회원이 늘고 더 자주 돌아올까? 를 검증한 실험(`twa01_entry_gate`, 2026-06-12 측정 시작).
>
> **목적**: 데이터로 위너를 가려 게이트를 켤지 끌지 결정한다.
>
> **목표(결과)**: **A(게이트 없음)를 위너로 확정**하고 hard 게이트(C) 코드를 안전 제거 — 모든 앱 사용자가 바로 둘러보게 통일. A/B 실험 인프라는 보존.

- **실험 ID**: `twa01_entry_gate`
- **기간**: 2026-06-12 시작 → 2026-06-13 종료(조기 종료, 6-19 D7 성숙 대기 안 함)
- **상위 기능**: [F16 웹 A/B 테스트 인프라](F16-ab-test-infra.md)
- **그룹**: A(현행·게이트 없음) 50 / ~~B(soft, 2026-06-15 드랍)~~ / C(hard·첫 화면 가입) 50

---

## A 위너 결정 근거

| 지표 | A | C | 판정 |
|------|-----|-----|------|
| 가입률(배정→가입) | 12.9% | 46.4% | C 압도(z=5.28) — **단 "강제"라 함정** |
| 비회원 D1 재방문 | 18.3% | 6.7% | **A 승, 통계 유의(z=2.13)** |
| 가입자 D1 재방문 | 40% | 17% | A 우세(z=1.62, 표본 더 필요) |

- **증분 분석**: C가 게이트로 "추가로 끌어낸" 회원(약 37명)의 재방문율은 **약 8%** — 92%가 가입 직후 증발. 진성 효율 KPI에선 죽은 숫자.
- **숨은 비용**: 게이트는 "다시 올 구경꾼"을 18.3%→6.7%로 쫓아냄(유의) = 미래 가입 파이프라인 소각. 체류·입소문 기반 5060 커뮤니티엔 치명적.
- **결론**: 진성 회원 효율이 KPI인 한 hard 게이트는 가입 숫자만 부풀리고 진성도·잠재풀을 깎는 손해 → **A 채택, 게이트 폐기.**
- ⚠️ 가입자 재방문은 미유의(A 분모 작음)였으나, 비회원 유의 + 증분 8% 근거로 방향 역전 가능성 매우 낮아 조기 종료.

---

## 제거 범위 (코드)

| 파일/위치 | 처리 |
|----------|------|
| `src/components/common/TwaEntryGate.tsx` | 파일 삭제 |
| `src/app/(main)/layout.tsx` | `TwaEntryGate` dynamic import + 마운트 제거 |
| `src/components/features/onboarding/OnboardingForm.tsx` | `sign_up`의 `twa_gate_variant` 첨부 제거 |
| `src/lib/experiments/registry.ts` | `twa01_entry_gate` 정의 제거 → `EXPERIMENTS = []` (구조·타입·`getExperiment` 유지) |
| `src/lib/queries/admin/admin.experiments-web.ts` | 게이트 전용 제거: `getGateITT`/`getGateRetention`(dead)/`getTwaSignupRetention`(dead) + 인터페이스(`RetDay`/`GateITTRow`/`GateITTResult`/`GateRetentionRow`/`TwaRetention`) + 헬퍼 `isTwa`/`asProps` |
| `src/app/admin/(panel)/ab-tests/page.tsx` | 게이트 UI 제거(`GateITTCard`/`GateGroupRows`/`RetCell` + `getGateITT` 호출 + `gateExp` 분리). 펀넬 카드·기간필터·상태패널 유지 + 빈 상태 안내 추가 |

## 보존한 인프라·공유 자산 (삭제 시 버그)

| 항목 | 보존 이유 |
|------|----------|
| `GateOnboardingSlides.tsx` | `/login`(LoginForm)이 슬라이드 온보딩 UI로 재사용 |
| `PostViewBeacon.tsx` + `twa_session_post_views` | `PushPermissionToast`가 정독→푸시 구독 유도(`unao:engaged`)에 사용 |
| `SignupPromptBanner`의 `isTWA` 제외 | A 위너 = "TWA에서 게이트·타이밍 배너 없이 바로 둘러보기" → TWA 제외 동작 유지 |
| `assign.ts`/`stats.ts`/`getWebExperiments`/`ExperimentState`/`adminSaveExperimentState`/`ExperimentStatePanel` | A/B 운영 인프라 — 다음 실험 재사용 |
| 과거 `twa_gate_*` EventLog(assigned/view/click/escape) | 실험 근거·감사. 삭제 안 함(더 안 쌓일 뿐) |

---

## 고객 영향

- 신규 앱(C 배정자): 첫 화면 게이트 → **바로 둘러봄(개선, 허들 제거)**
- 기존 C 캐시 보유자: 게이트 안 뜸(무해)
- A·웹 사용자/로그인 화면/가입 플로우(auth): **변화 0**(auth 로직 무변경 — 게이트는 트리거였을 뿐)

## 롤백 방법

- **코드**: 본 변경은 단일 커밋 → `git revert` 1회로 원복(공유 자산 무수정이라 충돌 없음).
- **데이터**: 과거 EventLog 보존이라 복구 불필요.
- **재개 시**: registry에 `twa01_entry_gate` 정의 복원 + layout 마운트 복원 + 게이트 쿼리/UI 복원.

## 운영 액션 (배포 후)

1. Vercel `NEXT_PUBLIC_TWA_GATE_ENABLED` 환경변수 삭제(게이트 제거로 무의미한 키).
2. `/admin/ab-tests` 또는 1회 스크립트로 `ExperimentState` twa01 → `CONCLUDED` + 결론 입력(선택 — registry에서 빠져 대시보드 미표시이므로 본 문서가 결론 SSOT).
