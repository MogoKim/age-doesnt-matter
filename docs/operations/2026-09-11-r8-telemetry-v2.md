# R8 후속 계측 v2 — 배너 CTA 판정을 가능하게 만든다

- 날짜: 2026-09-11
- 브랜치: `feat/r8-telemetry-v2` · 기준 commit: `ab2cd44a` (PR #463 merge 직후 origin/main)
- 어드민 화면: `/admin/member-recovery`
- 선행 문서: `docs/operations/2026-09-10-r8-member-recovery-measurement.md`

## 1. 무엇이 문제였나

30일 실측(2026-09-11 기준):

| 항목 | 값 |
|---|---|
| 배너 노출 방문자 | 135 |
| `signup_banner_clicked` (전 CTA) | 0 |
| 사이트 전체 `kakao_button_click` | 15 |
| 실제 신규 실회원 | 3 |
| `sign_up.userId` ↔ 신규 실회원 ID 일치 | 3/3 |

가입 완료 자체가 깨졌다는 근거는 없다. 배너 반응이 낮은 **후보**지만,
기존 데이터만으로는 CTA별 판단이 **불가능**했다 — `signup_banner_shown` 에
**어떤 CTA 를 보여줬는지 정보가 없었기** 때문이다.

그래서 "카카오 CTA 를 본 사람이 안 눌렀다"인지 "앱 설치 CTA 만 떴다"인지 구분할 수 없었다.

## 2. 이번에 바꾼 것

**CTA 문구·디자인·노출 조건·빈도는 바꾸지 않았다.** 계측만 붙였다.

1. **CTA 판정을 순수 함수 하나로 통합** — `src/lib/telemetry/signup-banner-cta.ts`
   `app_card → app_install` / `iOS → kakao_oauth` / `non-iOS 인앱 → external_browser` / 그 외 → `kakao_oauth`.
   실측한 기존 `SignupPromptBanner` 분기와 **전 조합 동치**임을 테스트가 검증한다.
2. **노출·클릭에 같은 필드** — `cta_type` · `measurement_version: 'r8-v2'` · `surface` · `browser_env` · `env` · `variant`.
   UA 전체 문자열·닉네임·이메일·원문은 넣지 않는다.
3. **과거 계측과 분리** — CTA별 분모·분자는 **양쪽 다 r8-v2** 인 이벤트로만 만든다.
   과거 데이터는 `bannerCtaHistorical` 합계로만 표시하고 비율을 만들지 않는다. **backfill 하지 않는다.**
4. **`kakao_button_click.from` 정규화** — `src/lib/telemetry/kakao-click-source.ts` typed allowlist.
   배너 클릭과 사이트 전체 카카오 클릭은 **끝까지 별도 지표**다.
5. **rate limit 면제** — 아래 §4.
6. **`signup_banner_eligible` 판정** — 아래 §5.

## 3. 노출 시점 CTA 판정의 함정 (ref 를 쓴 이유)

`tryFire` 는 `[pathname, isLoggedIn, status, isTWA, isCapacitor]` effect 안에서 만들어진다.
`currentEnv`·`isIOS` 는 마운트 후 별도 effect 에서 확정되는 **state** 이고, 그 변경으로는
타이머 effect 가 재실행되지 않는다(재실행하면 60초 백스톱이 리셋돼 노출 타이밍이 밀린다).

따라서 `tryFire` 가 state 를 그대로 읽으면 **마운트 첫 렌더의 초기값**(`android-chrome` / `false`)에 고정돼
iOS·인앱 사용자의 노출이 전부 `kakao_oauth` 로 잘못 기록된다.
기존 `inappRef` 와 같은 이유로 `envRef` · `isIOSRef` 를 두었다.

## 4. `kakao_button_click` rate limit 면제 — 이유와 계측 단절 시점

**이유.** 이 이벤트는 로그인 화면·홈 가입 카드·게스트 댓글 카드 등 여러 표면에서 발생하는데
`/api/events` 면제 목록에 없었다. `page_view` 와 같은 버킷(`event:ip`, max 30)을 써서
같은 IP 에서 글을 여럿 보고 로그인을 누른 방문자의 클릭이 **429 로 조용히 사라졌다.**

**단절 시점.** 면제가 반영된 배포 시각 **이전 구간의 값은 하한값**이다.
이후 구간과 **같은 계열로 합산하면 안 된다.**

- 코드 기록 위치: `KAKAO_CLICK_EXEMPTION.effectiveFrom` (`src/lib/telemetry/event-rate-limit.ts`)
- 현재 값: `null` = **아직 기록되지 않음**(배포 전이라는 뜻이 아니다)
- 🔔 merge·production 배포 후 실제 배포 시각을 채워 넣는다
- 어드민은 `dataQuality.kakao_click_rate_limit_exempt` 로 이 경고를 항상 표시한다

**일반 반복 이벤트(`page_view` 등)의 rate limit 은 그대로 유지한다.**
면제 목록은 `src/lib/telemetry/event-rate-limit.ts` **단일 출처**이며 라우트가 이 함수를 호출한다
(목록을 두 곳에 두면 "면제됐다고 표시되는데 실제로는 안 된" 상태가 생긴다).

## 5. `signup_banner_eligible` 유실 — 범위를 키우지 않고 의미부터 판정

`signup_banner_eligible` 과 `signup_banner_shown` 은 같은 `tryFire` 에서 **연속 전송**되는
fire-and-forget POST 다. `trackEvent` 는 `sendBeacon` 기반이므로 **DB `createdAt` 순서를
전환 순서로 해석하면 안 된다.**

**판정(권고안 채택):**
- v2 퍼널의 **노출 SSoT 는 `signup_banner_shown` 하나**다
- `eligible` 은 전송 유실을 보는 **과거 품질 신호**로만 남긴다 (`bannerConsistency`)
- **retry·중복 전송으로 숫자를 맞추지 않는다** — 같은 방문자를 두 번 세게 된다
- 진짜 이전 단계(배너 조건 충족 전 모수)를 재정의하려면 **별도 후속**으로 다룬다. 이번 범위가 아니다

어드민 항목: `dataQuality.eligible_is_quality_signal`

## 6. 배포 후 확인 순서

1. `KAKAO_CLICK_EXEMPTION.effectiveFrom` 과 `R8_V2_DEPLOYED_AT` 에 실제 배포 시각 기록
2. `/admin/member-recovery` → "CTA별 전환 — r8-v2" 카드
   - `status` 가 `NOT_COLLECTED` → 아직 v2 노출이 없다. **0% 가 아니라 '모른다'** 다
   - `cta_type 없는 v2 노출` 이 0 이 아니면 → 빌더를 안 거친 경로가 남아 있다(계측 결함)
   - `v2 노출 없는 v2 클릭(경계)` 은 배포 경계를 걸친 방문자다. 분자로 쓰지 않는다
3. v2 노출이 충분히 쌓인 뒤에야 CTA별 전환율을 해석한다. 그 전에는 판정하지 않는다
