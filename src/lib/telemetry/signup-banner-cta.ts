import type { AndroidConversionVariant } from '@/lib/experiments/android-conversion'
import { MEASUREMENT_VERSION } from '@/lib/telemetry/measurement-version'

/**
 * 가입 배너 CTA 판정 + r8-v2 계측 계약 (순수 모듈 — DOM·네트워크 의존 없음).
 *
 * ## 왜 만들었나
 * 2026-09-11 기준 30일 실측: **배너 노출 135명 · `signup_banner_clicked` 0건**.
 * 그런데 `signup_banner_shown` 에는 **어떤 CTA 를 보여줬는지 정보가 없었다.**
 * 그래서 "카카오 CTA 를 본 사람이 안 눌렀다"인지 "앱 설치 CTA 만 떴다"인지 판정할 수 없었다.
 *
 * 노출과 클릭이 **서로 다른 규칙**으로 CTA 를 정하면 분모와 분자가 어긋난다.
 * 그래서 판정을 이 함수 하나로 모으고, 노출·클릭이 **같은 입력으로 같은 값**을 싣게 한다.
 *
 * ## ⚠️ 이 PR 은 CTA 문구·디자인·노출 조건·빈도를 바꾸지 않는다
 * `resolveSignupBannerCta` 는 `SignupPromptBanner` 가 **이미 하고 있던 분기를 그대로 옮긴 것**이며,
 * 회귀 테스트(`r8-telemetry-v2.test.ts`)가 전 조합에서 기존 분기와의 동치를 검증한다.
 */

/**
 * 노출·클릭에 함께 싣는 계측 버전. 이 값이 붙은 이벤트끼리만 CTA별 전환율을 만든다.
 * 경계는 **이 버전**이지 배포 시각이 아니다 — `measurement-version.ts` 참고.
 */
export const SIGNUP_BANNER_MEASUREMENT_VERSION = MEASUREMENT_VERSION

/** 이 계측이 붙는 노출면 — `android_conversion_prompt_*` 와 같은 값을 쓴다(조인 가능). */
export const SIGNUP_BANNER_SURFACE = 'signup_prompt_banner'

export const SIGNUP_BANNER_CTA_TYPES = ['kakao_oauth', 'app_install', 'external_browser'] as const
export type SignupBannerCtaType = (typeof SIGNUP_BANNER_CTA_TYPES)[number]

/** 인앱 환경 (카카오/네이버/구글 앱) — CTA 가 외부 브라우저 유도로 바뀌는 환경이다. */
const INAPP_ENVS = ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp'] as const

export function isInappBannerEnv(env: string): boolean {
  return (INAPP_ENVS as readonly string[]).includes(env)
}

export interface SignupBannerCtaInput {
  /** Android 전환 실험 배정값. `''` = 실험 대상 아님 */
  variant: AndroidConversionVariant | ''
  /** UA 기반 iOS 판정 */
  isIOS: boolean
  /** `detectEnv()` 결과 — `getBrowserEnv()` 와 반환셋이 다르므로 섞지 않는다 */
  env: string
}

/**
 * 배너에 **실제로 표시된** CTA 종류.
 *
 * 순서가 곧 정책이다:
 * 1. `app_card` variant → 앱 카드가 렌더되므로 가입 CTA 자체가 없다 → `app_install`
 * 2. iOS → 인앱이든 아니든 **카카오 OAuth 직행**. 외부 브라우저 유도·주소 복사는 가입 관문을 끊어 금지다
 * 3. non-iOS 인앱 브라우저 → `external_browser` (intent 로 Chrome 을 연다)
 * 4. 그 외(외부 브라우저·데스크탑) → `kakao_oauth`
 */
export function resolveSignupBannerCta(input: SignupBannerCtaInput): SignupBannerCtaType {
  if (input.variant === 'app_card') return 'app_install'
  if (input.isIOS) return 'kakao_oauth'
  if (isInappBannerEnv(input.env)) return 'external_browser'
  return 'kakao_oauth'
}

/**
 * 노출·클릭 공통 payload.
 *
 * 🔴 여기에 들어가도 되는 것: **환경 분류값과 실험 배정값뿐**이다.
 *    UA 전체 문자열·닉네임·이메일·글 원문은 넣지 않는다 — EventLog 는 어드민이 열어보는 표다.
 */
export interface SignupBannerTelemetryProps {
  cta_type: SignupBannerCtaType
  measurement_version: typeof MEASUREMENT_VERSION
  surface: typeof SIGNUP_BANNER_SURFACE
  /** `getBrowserEnv()` — 채널 통계용 분류값 */
  browser_env: string
  /** `detectEnv()` — 설치 유도 분기용 분류값. 기존 `signup_banner_clicked` 가 쓰던 필드를 유지한다 */
  env: string
  /** 실험 배정값. 비대상이면 `null` */
  variant: AndroidConversionVariant | null
}

export function buildSignupBannerTelemetry(input: {
  ctaType: SignupBannerCtaType
  env: string
  browserEnv: string
  variant: AndroidConversionVariant | ''
}): SignupBannerTelemetryProps {
  return {
    cta_type: input.ctaType,
    measurement_version: SIGNUP_BANNER_MEASUREMENT_VERSION,
    surface: SIGNUP_BANNER_SURFACE,
    browser_env: input.browserEnv,
    env: input.env,
    variant: input.variant || null,
  }
}
