# F16 — 웹 A/B 테스트 인프라

> 📌 **전환 채널 실험의 대상·분모 정의는 [F20 전환 채널 정책](F20-conversion-channel-policy.md) §7-B를 따른다.**
> 실험 중인 채널을 단독 변경하면 분모가 깨진다 — 무엇을 건드려도 되는지는 F20이 정한다.

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

> ⚠️ **실험 분모(노출 식별자)는 [F19 비회원 세션 계측 기준](F19-anonymous-session-measurement.md)을 따른다.**
> 특히 **첫 진입 10초 안에 발화하는 노출 이벤트는 세션 파편화로 분모가 부풀 수 있었다**(2026-08-07 확인). 늦게 발화하는 실험(`android_conversion_a2_b2` 등)은 영향 없음이 실측 확인됐다.
>
> ✅ **2026-08-07 구현 반영**: 분모 식별자는 이제 `anon_cid → sessionId` 순으로 해석한다(`admin.experiments-web.ts`·`admin.experiments-retention.ts`).
> 전환 분자는 **기존대로 `userId`** 다(회원 정본, 인앱→외부 sessionId 단절 우회 목적 그대로).
> 새 실험을 설계할 때 **분모를 무엇으로 세는지 반드시 명시한다**(F19 §5·§8).

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

| 실험 id | 이름 | 세그먼트 | variant | 상태 |
|---|---|---|---|---|
| `android_conversion_a2_b2` | Android 외부 브라우저 비회원 — 가입-first vs 앱-first | **비회원 + Android 외부 브라우저**(Chrome·**Whale**·Samsung Internet·Firefox 등). 회원·인앱브라우저(카카오·**네이버 앱**·Meta·Google앱)·WebView·iOS·desktop·TWA·Capacitor·standalone 제외 | `signup_warm` 50 / `app_card` 50 | 🟢 **등록됨** · `startsAt` 2026-08-06 21:00 KST |
| `exp1_related_flow` | 글 상세 관련글 카드 | — | A/B | ⛔ 종료(2026-06-23). 어드민 과거 조회용 보존 |

### `android_conversion_a2_b2` 운영 메모

- **노출면**: 새 팝업을 만들지 않고 기존 `SignupPromptBanner`에 얹었다. 트리거(정독 85% / 60초 백스톱), 세션당 1회, `MAX_SHOWS=4`, `signup_prompt_count`·`signup_prompt_done` 정책 **그대로**. `app_card`도 배너 노출 1회로 계산한다.
- **비대상은 회귀 0**: variant가 빈 문자열이면 기존 배너가 그대로 뜬다.
- **계측**: `android_conversion_prompt_exposed` / `_clicked` / `_dismissed` (EventLog). 기존 `signup_banner_*`도 **그대로 병행 발화**한다 — `app_card` 클릭을 가입 전용 이벤트로만 해석하면 안 되므로 별도 계열을 둔다. 세 이벤트 모두 `/api/events` rate-limit 면제 대상(빠지면 429로 조용히 유실돼 분모가 오염된다).
- **properties**: `experiment_id` · `variant` · `surface` · `trigger`(read_complete\|backstop) · `browser_env` · `path` · `cta_type`(signup\|app_install) · `content_id` · `show_count`.
- **Play referrer**(app_card 클릭): `utm_medium=android_conversion_app_card`, `utm_content=signup_prompt_banner`, 패키지 `com.agenotmatter.app`. PR #303의 medium 분리 정책을 따른다.

> ⚠️ **이 실험은 "가입 버튼 vs 앱 버튼"만 비교하는 실험이 아니다.** `signup_warm`과 `app_card`는 **문구와 레이아웃이 함께** 다르다. 승패는 *축(가입/앱)*의 승패로 읽되, "버튼 하나만 바꿨을 때의 효과"로 일반화하면 안 된다.
>
> ⚠️ **승패 기준은 설치 수가 아니다.** 설치 수로 보면 `app_card`가 항상 이긴다. **1순위 = D7 재방문 + 글/댓글/공감 1회 이상 고유 사용자**(North Star). 보조로 설치→가입 전환율, 시트 닫힘률을 본다.
>
> ⚠️ **2026-08-11(화) 아침 판단은 조기 판정이다.** 최종 D7 판정은 별도로 잡는다.
>
> 어드민 `/admin/ab-tests`의 `ExperimentState.startedAt`을 **2026-08-06 21:00 KST**로 맞춰야 집계 컷이 코드 게이트와 일치한다.

> **종료(2026-06-09, UT 위너 확정)**: `f01_signup_content`(문구)→**C 공감형 고정** / `f01_signup_timing`(타이밍)→**read_complete 고정**. 레지스트리에서 삭제, SignupPromptBanner 고정값. 과거 기록은 git 히스토리.

> **종료(2026-06-13, A 위너 확정)**: `twa01_entry_gate`(TWA 첫 진입 게이트)→**A(게이트 없음) 채택**. C(hard)는 가입수만 늘리고 구경꾼 재방문을 소각(비회원 D1 18.3%→6.7%, 통계 유의) → 진성 효율 손해. 게이트 코드 제거, 인프라 유지. 상세: [F16-twa-gate-experiment-archive.md](F16-twa-gate-experiment-archive.md).

## 이력
| 날짜 | 변경 | 이유 |
|---|---|---|
| 2026-06-07 | 인프라 신규 — 레지스트리/배정/통계 + 어드민 현황·편집 + ExperimentState | A/B 다수 진행 위한 중앙 운영·기록·관리 |
| 2026-06-08 | 어드민에 게이트 재방문(D1/D7) 카드 연결 + 게이트를 funnel 목록에서 분리 | 게이트 A(현행)는 노출 이벤트가 없어 funnel 분모 0 → A 0% 오표시. 게이트는 `getGateRetention` 재방문 지표로만 본다(`page.tsx` `GateExperimentCard`). |
| 2026-06-09 | f01_signup_content·f01_signup_timing 종료(레지스트리 삭제), gtm/OnboardingForm variant 첨부 제거, e2e/22 read_complete 기준 수정, 임시 감사 스크립트 삭제 | UT 위너 확정 → 코드 고정·레거시 제거. 인프라·게이트 유지 |
| 2026-06-12 | TWA baseline 판정 교차 보강(`getTwaSignupRetention`: browser_env OR twa_gate_variant OR TWA page_view) + 게이트 표에 노출 분모/전환율 컬럼 + 캡션 동적화 + 90일 고정 뱃지 | 카카오 OAuth 복귀 시 referrer 소실로 TWA 가입자 67%(33명 중 22명)가 android-chrome으로 오기록 → baseline 31명으로 과소집계(실제 57명)·D7 재방문율 왜곡. 측정 쿼리만 보강(가입 플로우 무수정). sticky 근본수정은 백로그. 캐시키 v1→v2 |
| 2026-06-12 | 게이트 ITT(배정 기준) 측정 추가 — `twa_gate_assigned` 이벤트(TwaEntryGate, A포함 전원·세션당 1회) + `getGateITT`(배정 sessionId 분모, D1/D3/D7 재방문+가입률) + 어드민 ITT 카드 | 노출이 그룹별 조건차로 불공정(A 0·B 23·C 120) → 노출 기준 비교 불가. "보여주려 한 대상(배정)"을 최앞단 분모로 A·B·C 공정 비교. sessionId(_anon_sid 30일)가 배정→가입→재방문 연결. **과거 소급 불가**(도입 시점부터 누적). 게이트 동작 무변경(이벤트 1줄만 추가) |
| 2026-06-13 | `twa01_entry_gate` 종료 — A(게이트 없음) 위너 확정, 게이트 코드 제거(`TwaEntryGate` 삭제·layout 마운트·게이트 전용 쿼리 `getGateITT`/`getGateRetention`/`getTwaSignupRetention`·어드민 게이트 카드·`sign_up`의 `twa_gate_variant` 첨부), `EXPERIMENTS = []`. 인프라(registry 구조·`assign`·`stats`·`getWebExperiments`·`ExperimentState`)·공유 컴포넌트(`GateOnboardingSlides`=/login, `PostViewBeacon`=푸시토스트) 보존. 과거 `twa_gate_*` EventLog 보존 | 가입자·비회원 재방문 모두 A 우세(비회원 D1 통계 유의) + hard 게이트가 구경꾼 재방문 소각 → 진성 효율 KPI에서 게이트 폐기. 상세: [F16-twa-gate-experiment-archive.md](F16-twa-gate-experiment-archive.md) |

## 비고 / 후속
- **F01 SignupPromptBanner는 EventLog 이벤트로 이미 어드민에 집계됨** → 어드민 현황은 마이그레이션과 무관하게 F01 실데이터 표시.
- **단계 5(F01 배정 로직을 getExperimentVariant로 통일)는 선택/후순위**: 동등성 8샘플 실측 PASS(동작 동일)이나 회원가입 퍼널 민감 → 실기기 검증 후 진행.
- **ExperimentState 마이그레이션 필요(프로덕션 DB)**: 적용 전에는 어드민 상태=코드 default(ACTIVE), 편집 저장은 마이그 후 작동.
