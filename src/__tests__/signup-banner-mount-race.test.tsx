import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * 최초 마운트 경합 — **환경·iOS·variant 판정이 확정되기 전에 노출이 발화하는** 창.
 *
 * ## 무엇이 문제였나
 * `detectEnv()`·`isIOSUserAgent()`·실험 variant 는 **state** 에 들어가고, ref 는 별도 effect 에서
 * 그 state 를 복사했다. React 는 한 flush 안의 passive effect 를 **전부 실행한 뒤에** setState 재렌더를
 * 처리하므로, 복사 effect 들은 **초기값**(`android-chrome` / `false` / `''`)을 그대로 복사한다.
 *
 * 그 사이에 `tryFire` 가 불리면 — 뒤로가기 스크롤 복원으로 브라우저가 같은 태스크에서 `scroll` 을
 * 전달하거나, 페이지가 짧아 스크롤 effect 가 곧바로 임계치를 넘긴 경우 —
 * **iOS·인앱·app_card 노출이 전부 `kakao_oauth` 로 오기록된다.**
 *
 * ## 이 테스트가 재현하는 방식
 * `window.addEventListener('scroll', ...)` 가 등록되는 **바로 그 순간** 핸들러를 동기 호출한다.
 * 스크롤 effect 는 마운트 flush 의 마지막이고 타이머 effect(=`tryFireRef` 할당)는 그 앞이라,
 * 이 지점이 정확히 실제 경합 창이다. 소스 문자열이 아니라 **발화한 payload** 로 판정한다.
 */

const mock = vi.hoisted(() => ({
  pathname: '/community/stories/test-post',
  env: 'android-chrome',
  searchParams: new URLSearchParams(),
  startKakaoLogin: vi.fn(),
  trackEvent: vi.fn(),
  getExperimentVariant: vi.fn(() => ''),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mock.pathname,
  useSearchParams: () => mock.searchParams,
}))
vi.mock('@/components/common/AppSessionProvider', () => ({
  useAppSession: () => ({ status: 'unauthenticated', data: null }),
}))
vi.mock('@/hooks/useAppEnvironment', () => ({
  useAppEnvironment: () => ({ isTWA: false, isCapacitor: false, isStandalone: false }),
}))
vi.mock('@/components/common/AddToHomeScreen', () => ({ detectEnv: () => mock.env }))
vi.mock('@/lib/kakao-start', () => ({ startKakaoLogin: mock.startKakaoLogin }))
vi.mock('@/lib/track', () => ({ trackEvent: mock.trackEvent }))
vi.mock('@/lib/experiments/assign', () => ({ getExperimentVariant: mock.getExperimentVariant }))
vi.mock('@/lib/gtm', () => ({
  gtmSignupBannerEligible: vi.fn(),
  gtmSignupBannerShown: vi.fn(),
  gtmSignupBannerClicked: vi.fn(),
  gtmSignupBannerDismissed: vi.fn(),
  gtmInappRedirectAttempted: vi.fn(),
  gtmInappRedirectSuccess: vi.fn(),
  gtmPlayStoreClick: vi.fn(),
  getBrowserEnv: () => mock.env,
}))

const { SignupPromptBanner } = await import('@/components/common/SignupPromptBanner')

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  kakaoAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.4.0',
  kakaoIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
}

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true })
}

/**
 * 마운트 flush 안에서 곧바로 `scroll` 을 전달한다 — 뒤로가기 스크롤 복원 재현.
 * 재렌더 **이전**이므로 state 는 아직 초기값이다. ref 가 판정 effect 안에서 동기 갱신되지 않으면
 * 여기서 읽히는 값이 틀린다.
 */
function deliverScrollDuringMountFlush() {
  const original = window.addEventListener.bind(window)
  return vi.spyOn(window, 'addEventListener').mockImplementation(
    ((type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
      original(type as never, listener as never, options as never)
      if (type === 'scroll' && typeof listener === 'function') {
        ;(listener as EventListener)(new Event('scroll'))
      }
    }) as typeof window.addEventListener,
  )
}

function mountWithRestoredScroll(env: string, userAgent: string, variant = '') {
  mock.env = env
  mock.getExperimentVariant.mockReturnValue(variant)
  setUserAgent(userAgent)
  localStorage.clear()
  sessionStorage.clear()
  const spy = deliverScrollDuringMountFlush()
  try {
    render(<SignupPromptBanner />)
  } finally {
    spy.mockRestore()
  }
}

const propsOf = (name: string) =>
  mock.trackEvent.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as Record<string, unknown>)

beforeEach(() => {
  vi.useFakeTimers()
  mock.pathname = '/community/stories/test-post'
  mock.searchParams = new URLSearchParams()
  mock.startKakaoLogin.mockClear()
  mock.trackEvent.mockClear()
  mock.getExperimentVariant.mockReturnValue('')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('최초 마운트 경합 — 재렌더 전에 노출이 발화해도 CTA 판정이 맞다', () => {
  it('노출이 마운트 flush 안에서 실제로 발화한다 (경합 창 재현 자체를 검증)', () => {
    mountWithRestoredScroll('kakao-android', UA.kakaoAndroid)
    expect(propsOf('signup_banner_shown')).toHaveLength(1)
  })

  it('kakao-android 인앱 → external_browser', () => {
    mountWithRestoredScroll('kakao-android', UA.kakaoAndroid)
    const shown = propsOf('signup_banner_shown')[0]
    expect(shown.cta_type).toBe('external_browser')
    expect(shown.measurement_version).toBe('r8-v2')
    expect(shown.env).toBe('kakao-android')
  })

  it('iOS → kakao_oauth (인앱이어도 외부 브라우저 유도로 새지 않는다)', () => {
    mountWithRestoredScroll('kakao-ios', UA.kakaoIos)
    expect(propsOf('signup_banner_shown')[0].cta_type).toBe('kakao_oauth')
    cleanup()
    mock.trackEvent.mockClear()
    mountWithRestoredScroll('ios-safari', UA.iosSafari)
    expect(propsOf('signup_banner_shown')[0].cta_type).toBe('kakao_oauth')
  })

  it('app_card variant → app_install', () => {
    mountWithRestoredScroll('android-chrome', UA.androidChrome, 'app_card')
    const shown = propsOf('signup_banner_shown')[0]
    expect(shown.cta_type).toBe('app_install')
    expect(shown.variant).toBe('app_card')
  })

  it('경합 중 노출된 뒤 누른 클릭의 cta_type 이 노출과 일치한다 — 인앱', () => {
    mountWithRestoredScroll('kakao-android', UA.kakaoAndroid)
    fireEvent.click(screen.getByTestId('signup-banner-cta'))
    const shown = propsOf('signup_banner_shown')[0]
    const clicked = propsOf('signup_banner_clicked')[0]
    expect(clicked.cta_type).toBe(shown.cta_type)
    expect(clicked.cta_type).toBe('external_browser')
  })

  it('경합 중 노출된 뒤 누른 클릭의 cta_type 이 노출과 일치한다 — app_card', () => {
    mountWithRestoredScroll('android-chrome', UA.androidChrome, 'app_card')
    fireEvent.click(screen.getByTestId('android-conversion-app-cta'))
    const shown = propsOf('signup_banner_shown')[0]
    const clicked = propsOf('signup_banner_clicked')[0]
    expect(clicked.cta_type).toBe(shown.cta_type)
    expect(clicked.cta_type).toBe('app_install')
  })

  it('경합 중 노출된 뒤 누른 클릭의 cta_type 이 노출과 일치한다 — iOS', () => {
    mountWithRestoredScroll('ios-safari', UA.iosSafari)
    fireEvent.click(screen.getByTestId('signup-banner-cta'))
    const shown = propsOf('signup_banner_shown')[0]
    const clicked = propsOf('signup_banner_clicked')[0]
    expect(clicked.cta_type).toBe(shown.cta_type)
    expect(clicked.cta_type).toBe('kakao_oauth')
    expect(mock.startKakaoLogin).toHaveBeenCalled()
  })
})
