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

## 3. 노출 시점 CTA 판정의 함정 (ref 를 **판정 effect 안에서** 갱신하는 이유)

`tryFire` 는 `[pathname, isLoggedIn, status, isTWA, isCapacitor]` effect 안에서 만들어지고,
`currentEnv`·`isIOS`·`variant` 변경으로는 재생성되지 않는다(재생성하면 60초 백스톱이 리셋돼 노출 타이밍이 밀린다).
그래서 `tryFire` 는 state 가 아니라 ref 를 읽어야 한다.

**그런데 "state 를 별도 effect 에서 ref 로 복사"하면 그것만으로는 부족하다.**
React 는 한 flush 의 passive effect 를 **전부 실행한 뒤에** setState 재렌더를 처리한다.
따라서 마운트 flush 안의 복사 effect 는 **초기값**(`android-chrome` / `false` / `''`)을 복사한다.
그 사이에 `tryFire` 가 불리면 — 뒤로가기 스크롤 복원으로 브라우저가 같은 태스크에서 `scroll` 을 전달하거나,
페이지가 짧아 스크롤 임계치가 곧바로 충족되면 —
**iOS·인앱·app_card 노출이 전부 `kakao_oauth` 로 오기록된다.**

→ `detectEnv()`·`isIOSUserAgent()`·variant 를 **판정하는 그 effect 안에서 ref 를 먼저 동기 갱신**하고
state 는 그 뒤에 갱신한다(state 는 렌더용). 타이머·노출 조건·CTA UX 는 그대로다.
회귀 방지는 소스 문자열이 아니라 **행동 테스트**(`src/__tests__/signup-banner-mount-race.test.tsx`)로 잠근다 —
스크롤 리스너가 등록되는 순간 핸들러를 동기 호출해 경합 창을 그대로 재현한다.

## 4. `kakao_button_click` rate limit 면제 — 이유와 계측 단절 시점

**이유.** 이 이벤트는 로그인 화면·홈 가입 카드·게스트 댓글 카드 등 여러 표면에서 발생하는데
`/api/events` 면제 목록에 없었다. `page_view` 와 같은 버킷(`event:ip`, max 30)을 써서
같은 IP 에서 글을 여럿 보고 로그인을 누른 방문자의 클릭이 **429 로 조용히 사라졌다.**

**단절 기준 — 달력 시각이 아니라 이벤트 버전.** 면제 이전 구간의 값은 429 로 유실된 **하한값**이라
이후 구간과 **같은 숫자로 합산하면 안 된다.** 그런데 배포 시각으로 자르면 틀린다 —
배포 직후에도 **캐시된 구버전 클라이언트**가 한동안 미버전 이벤트를 계속 보내기 때문이다.

- 분리 기준: 이벤트에 `measurement_version=r8-v2` 가 실렸는지 **하나뿐**(보수적 분리)
- `kakao_button_click` 도 공용 빌더 `buildKakaoClickTelemetry` 를 통해 이 버전을 싣는다
- 어드민 `siteWideKakaoClick` 은 `v2Visitors` / `historicalVisitors` 로 **갈라서** 보여주고
  **합계 필드를 두지 않는다**(두면 누군가 반드시 더한다)
- v2 가 0 이면 `status = NOT_COLLECTED` — 0% 가 아니라 '모른다'
- "언제부터 v2 가 들어왔나"의 정본은 **실제 최초 관측 시각**(`firstSeenInWindowAt`)이다
- 🚫 **배포 시각을 코드 상수로 되기록하지 않는다** — 계측 배포 뒤 또 한 번의 PR·재배포를 요구하게 된다.
  운영 기록이 필요하면 이 문서에만 남긴다
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

**코드에 기록할 것은 없다.** 배포 후 별도 PR·재배포가 필요한 후속 작업은 이 PR 로 제거했다.

1. `/admin/member-recovery` → "CTA별 전환 — r8-v2" 카드
   - `status` 가 `NOT_COLLECTED` → 아직 v2 노출이 없다. **0% 가 아니라 '모른다'** 다
   - `v2 최초 관측(창 내)` 이 곧 계측 경계의 정본이다
   - `cta_type 없는 v2 노출` 이 0 이 아니면 → 빌더를 안 거친 경로가 남아 있다(계측 결함)
   - `v2 노출 없는 v2 클릭(경계)` 은 버전 경계를 걸친 방문자다. 분자로 쓰지 않는다
2. 사이트 전체 `kakao_button_click` 은 `r8-v2` 와 `미버전` 두 줄로 본다. **더하지 않는다.**
   미버전 줄은 캐시된 구버전 클라이언트가 남아 있는 동안 계속 늘어날 수 있다(정상).
3. v2 노출이 충분히 쌓인 뒤에야 CTA별 전환율을 해석한다. 그 전에는 판정하지 않는다

> 운영 기록용으로 실제 production 배포 시각이 필요하면 **이 문서에만** 적는다(코드 상수로 되돌리지 않는다).
> - production 배포 시각: _(merge 후 기입)_
