/**
 * 인앱브라우저 → 외부 브라우저 유도 계측 (EventLog).
 *
 * ## 왜 필요한가
 * 이 퍼널은 지금까지 **GTM(GA4)에만** 기록됐다(`gtmInappRedirectAttempted` / `gtmInappRedirectSuccess`).
 * 어드민 집계와 운영 판단은 전부 **EventLog** 기반이라, 인앱 사용자가 외부 브라우저로
 * 실제 넘어가는지 어드민에서 볼 수 없었다(EventLog 이벤트 40종 전수 조회 결과 관련 이벤트 0종, 2026-08-08 실측).
 *
 * 네이버 앱 인앱은 전체 page_view의 절반 이상을 차지하는 최대 유입 채널이다.
 * 이 퍼널이 보이지 않으면 "인앱 OAuth 직행 vs 외부 브라우저 경유" 같은 판단을 데이터로 할 수 없다.
 *
 * ## 이 파일의 범위
 * **계측만 한다.** 유도 동작·문구·노출 조건은 바꾸지 않는다.
 * 특히 iOS 네이버 인앱에서 이동 수단이 없어 배너만 닫히는 현재 동작도 **고치지 않고 기록만** 한다
 * (수정은 별도 PR). 그래야 "막다른 길이 실제로 얼마나 발생하는지"를 먼저 알 수 있다.
 *
 * GTM 이벤트는 **그대로 유지**한다 — 두 파이프를 병행해 기존 GA4 시계열을 끊지 않는다.
 */
import { detectInAppBrowser } from './browser-env'

/** EventLog 이벤트명. `/api/events`의 CONVERSION_EVENTS(rate-limit 면제)에 등록돼 있어야 한다. */
export const INAPP_REDIRECT_EVENTS = {
  /** 외부 브라우저로 넘기려고 시도함 */
  attempted: 'inapp_redirect_attempted',
  /** 외부 브라우저에 실제로 도착함(`?signup=1` + 인앱 utm_source 감지) */
  opened: 'inapp_redirect_opened',
  /** 넘길 수단이 없어 아무 데도 못 감 (막다른 길) */
  failed: 'inapp_redirect_failed',
} as const

export type InappRedirectEvent = (typeof INAPP_REDIRECT_EVENTS)[keyof typeof INAPP_REDIRECT_EVENTS]

/** 어떤 수단으로 넘기려 했는가. `none` = 쓸 수 있는 수단이 없음(=failed) */
export type InappRedirectMethod = 'intent' | 'clipboard' | 'none'

/** 어느 노출면에서 발생했는가 */
export type InappRedirectSurface = 'signup_prompt_banner' | 'pwa_inapp_guide'

/**
 * 실패 사유 — 왜 못 넘어갔는지 구분해야 고칠 지점을 알 수 있다.
 *
 * `no_handler_for_os`: 그 OS에 쓸 수 있는 이동 수단이 없었다.
 *   → iOS 인앱은 2026-08-09부터 클립보드+안내로 대체돼 이 사유가 나지 않는다(과거 데이터에는 남아 있다).
 * `clipboard_unavailable`: 클립보드 API를 못 써서 주소를 넘겨줄 방법조차 없었다.
 *   iOS 인앱의 **유일한 실질 실패**다. 이 값이 늘면 안내만으로는 부족하다는 뜻이다.
 */
export type InappRedirectFailReason = 'no_handler_for_os' | 'unsupported_env' | 'clipboard_unavailable'

/** UA → OS. 채널 비교 시 Android/iOS를 반드시 갈라 봐야 한다(인앱 유도 수단이 OS별로 다르다). */
export function osFromUa(ua: string): 'android' | 'ios' | 'other' {
  if (!ua) return 'other'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

/**
 * 인앱 채널 — OS를 뗀 순수 채널명.
 * `detectEnv()`가 카카오만 OS를 쪼개고 네이버는 안 쪼개는 비대칭이 있어서,
 * 집계할 때 `channel`(kakao/naver/…)과 `os`(android/ios)를 **따로** 싣는다.
 */
export function inappChannelFromEnv(env: string, ua = ''): string {
  if (env.startsWith('kakao')) return 'kakao'
  if (env.startsWith('naver')) return 'naver'
  if (env.startsWith('google')) return 'google'
  if (env.startsWith('instagram') || env.startsWith('meta')) return 'meta'
  if (env.startsWith('daum')) return 'daum'
  return detectInAppBrowser(ua) ?? 'unknown'
}

/** UA 분류값 — 조사 스크립트/어드민에서 쓰는 것과 같은 기준으로 고정한다. */
export function uaClassFromUa(ua: string): string {
  if (!ua) return 'unknown'
  if (/KAKAOTALK/i.test(ua)) return /android/i.test(ua) ? 'kakao-android' : 'kakao-ios'
  if (/NAVER\(inapp|NaverSearchApp/i.test(ua)) return /android/i.test(ua) ? 'naver-inapp-android' : 'naver-inapp-ios'
  if (/Instagram|FBAN|FBAV|FB_IAB/i.test(ua)) return 'meta-inapp'
  if (/\bGSA\//i.test(ua)) return 'google-inapp'
  if (/DaumApps/i.test(ua)) return 'daum-inapp'
  if (/iPhone|iPad|iPod/i.test(ua)) return /CriOS/i.test(ua) ? 'ios-chrome' : 'ios-safari'
  if (/Android/i.test(ua)) {
    if (/;\s*wv[);]/i.test(ua)) return 'android-webview'
    if (/Whale/i.test(ua)) return 'android-whale'
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung'
    return 'android-chrome'
  }
  return 'desktop-or-other'
}

export interface InappRedirectPropsInput {
  surface: InappRedirectSurface
  /** 호출부의 환경 문자열(detectEnv 결과) — 원본 그대로 남긴다 */
  source: string
  /** 분석/이벤트용 채널값(gtm.getBrowserEnv) — 기존 이벤트들과 조인하기 위해 함께 싣는다 */
  browserEnv: string
  userAgent: string
  path: string
  /** 어디로 보내려 했는가 — 전체 URL이 아니라 pathname+search만(쿼리에 개인정보 없음) */
  target: string
  method: InappRedirectMethod
  ctaType: string
  utmSource?: string
  utmMedium?: string
  reason?: InappRedirectFailReason
}

/**
 * 세 이벤트가 **같은 축으로 조인**되도록 properties를 한 곳에서 만든다.
 * 시도/도착/실패를 서로 다른 키로 만들면 퍼널을 이을 수 없다.
 *
 * ⚠️ `anon_cid`는 넣지 않는다 — `trackEvent`가 중앙에서 자동으로 붙인다(F19).
 *    여기서 직접 만들면 식별자 출처가 둘로 갈라진다.
 */
export function buildInappRedirectProps(input: InappRedirectPropsInput): Record<string, unknown> {
  return {
    surface: input.surface,
    source: input.source,
    channel: inappChannelFromEnv(input.source, input.userAgent),
    os: osFromUa(input.userAgent),
    ua_class: uaClassFromUa(input.userAgent),
    browser_env: input.browserEnv,
    path: input.path,
    target: input.target,
    cta_type: input.ctaType,
    redirect_method: input.method,
    ...(input.utmSource ? { utm_source: input.utmSource } : {}),
    ...(input.utmMedium ? { utm_medium: input.utmMedium } : {}),
    ...(input.reason ? { fail_reason: input.reason } : {}),
  }
}

/** URL에서 기록용 target을 만든다(호스트·해시 제외 — 경로와 쿼리만). */
export function redirectTargetOf(url: URL): string {
  return `${url.pathname}${url.search}`
}

/**
 * **도착(opened) 시점의 유도 수단**을 떠나온 채널로 역추론한다.
 *
 * 도착한 페이지는 "어떤 수단으로 왔는지"를 직접 알 수 없다 — `?signup=1&utm_source=…` 쿼리만 들고 온다.
 * 그래서 `utm_source`(= 떠나온 인앱 환경)로 되짚는다. 각 채널이 쓰는 수단은
 * `SignupPromptBanner.handleCTAClick`의 분기와 **1:1로 맞춰야** attempted↔opened가 같은 축으로 조인된다.
 *
 * | 떠나온 채널 | attempted method | 도착 추론 |
 * |---|---|---|
 * | `kakao-ios` | clipboard (intent 불가) | **clipboard** |
 * | `kakao-android` | intent | intent |
 * | `naver-inapp` · `google-inapp` | Android는 intent / iOS는 none(막다른 길) | intent |
 *
 * 네이버·구글을 intent로 두는 이유: iOS는 애초에 도착하지 못하므로(`failed`),
 * **실제로 도착한 케이스는 Android intent 경유뿐**이다.
 *
 * 미상(`unknown` 등)은 기존 동작과 동일하게 `intent`로 둔다 — 값이 갑자기 바뀌면 과거 시계열과 끊긴다.
 */
export function arrivalRedirectMethod(source: string): InappRedirectMethod {
  if (source === 'kakao-ios') return 'clipboard'
  return 'intent'
}
