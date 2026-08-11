import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { INAPP_REDIRECT_EVENTS } from '@/lib/inapp-redirect'

/**
 * 인앱 한정 배너 노출 타이밍 (F20 §8).
 *
 * ## 무엇을 고정하는가
 * 인앱은 **정독 85% 도달만** 트리거다. 60초 백스톱으로는 뜨지 않는다.
 * 비인앱은 기존 그대로 — 백스톱 또는 정독 중 하나만 충족하면 뜬다.
 *
 * ## 왜 이 테스트가 까다로운가
 * happy-dom 기본값은 `scrollHeight=0`, `innerHeight=768`이라
 * `docH = -768 < 100` → 컴포넌트가 **"스크롤할 게 없으니 정독 완료"** 로 간주한다.
 * 그 상태로는 인앱/비인앱 차이가 드러나지 않는다(기존 테스트가 그대로 통과하는 이유).
 * 그래서 여기서는 **문서 높이를 실제로 키워** "아직 안 읽은 상태"를 만든 뒤에 검증한다.
 */

const mock = vi.hoisted(() => ({
  pathname: '/community/stories/test-post',
  env: 'ios-safari',
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
  naverIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.9.2; 15PRO)',
  naverAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.9.2)',
  kakaoIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  kakaoAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.5',
  googleIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/15.12.30.28',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  whale:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Whale/3.24.223.18 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
}

/** 스크롤 가능한 긴 글 상태를 만든다. docH = 5000 - 800 = 4200 */
const DOC_H = 5000
const VIEW_H = 800
const SCROLLABLE = DOC_H - VIEW_H
/** 정독 85% 도달에 필요한 scrollY */
const READ_COMPLETE_Y = Math.ceil(SCROLLABLE * 0.85)

function setLongArticle() {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: DOC_H, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: VIEW_H, configurable: true, writable: true })
  setScrollY(0)
}
function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}
function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true })
}

/** 배너가 화면에 떠 있는가 */
const bannerShown = () =>
  screen.queryByTestId('signup-banner-cta') !== null ||
  screen.queryByTestId('android-conversion-app-cta') !== null

/** 아직 안 읽은 상태로 렌더 → 60초 경과시킨다 */
async function renderAndWaitBackstop(env: string, ua: string) {
  mock.env = env
  setUserAgent(ua)
  setLongArticle()
  localStorage.clear()
  sessionStorage.clear()
  render(<SignupPromptBanner />)
  await act(async () => { vi.advanceTimersByTime(60_000) })
}

/** 정독 85%까지 스크롤한다 */
async function scrollToReadComplete() {
  setScrollY(READ_COMPLETE_Y)
  await act(async () => { window.dispatchEvent(new Event('scroll')) })
}

const INAPP_CASES: Array<[string, string, string]> = [
  ['Naver 인앱 (iOS)', 'naver-inapp', UA.naverIos],
  ['Naver 인앱 (Android)', 'naver-inapp', UA.naverAndroid],
  ['Kakao 인앱 (iOS)', 'kakao-ios', UA.kakaoIos],
  ['Kakao 인앱 (Android)', 'kakao-android', UA.kakaoAndroid],
  ['Google 인앱 (iOS)', 'google-inapp', UA.googleIos],
]
const NON_INAPP_CASES: Array<[string, string, string]> = [
  ['iOS Safari', 'ios-safari', UA.iosSafari],
  ['iOS Chrome', 'crios', UA.iosChrome],
  ['Android Chrome', 'android-chrome', UA.androidChrome],
  ['Android Whale', 'android-chrome', UA.whale],
  ['Samsung Internet', 'android-chrome', UA.samsung],
]

beforeEach(() => {
  vi.useFakeTimers()
  mock.pathname = '/community/stories/test-post'
  mock.env = 'ios-safari'
  mock.searchParams = new URLSearchParams()
  mock.startKakaoLogin.mockClear()
  mock.trackEvent.mockClear()
  mock.getExperimentVariant.mockReturnValue('')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('테스트 환경 자체 검증 — "아직 안 읽은 상태"가 실제로 만들어지는가', () => {
  it('긴 글에서는 초기 정독률이 85% 미만이다', () => {
    setLongArticle()
    const docH = document.documentElement.scrollHeight - window.innerHeight
    expect(docH).toBe(SCROLLABLE)
    expect(docH).toBeGreaterThan(100) // 100 미만이면 컴포넌트가 "정독 완료"로 간주해 검증이 무의미해진다
    expect(window.scrollY / docH).toBeLessThan(0.85)
  })

  it('스크롤 후에는 85%를 넘는다', () => {
    setLongArticle()
    setScrollY(READ_COMPLETE_Y)
    const docH = document.documentElement.scrollHeight - window.innerHeight
    expect(window.scrollY / docH).toBeGreaterThanOrEqual(0.85)
  })
})

describe('인앱 — 60초 백스톱으로는 뜨지 않는다', () => {
  it.each(INAPP_CASES)('%s: 60초가 지나도 배너가 뜨지 않는다', async (_l, env, ua) => {
    await renderAndWaitBackstop(env, ua)
    expect(bannerShown()).toBe(false)
    expect(mock.trackEvent).not.toHaveBeenCalledWith('signup_banner_shown', expect.anything())
  })

  it.each(INAPP_CASES)('%s: 정독 85% 도달 시 배너가 뜬다', async (_l, env, ua) => {
    await renderAndWaitBackstop(env, ua)
    expect(bannerShown()).toBe(false) // 아직

    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)
    expect(mock.trackEvent).toHaveBeenCalledWith('signup_banner_shown', expect.anything())
  })

  it('60초를 기다리지 않아도 정독만으로 뜬다 — 백스톱에 의존하지 않는다', async () => {
    mock.env = 'naver-inapp'
    setUserAgent(UA.naverAndroid)
    setLongArticle()
    localStorage.clear()
    sessionStorage.clear()
    render(<SignupPromptBanner />)
    await act(async () => { vi.advanceTimersByTime(1_000) }) // 1초만
    expect(bannerShown()).toBe(false)

    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)
  })
})

describe('비인앱 — 기존 60초 백스톱이 그대로 동작한다 (회귀 0)', () => {
  it.each(NON_INAPP_CASES)('%s: 60초 백스톱만으로 배너가 뜬다', async (_l, env, ua) => {
    await renderAndWaitBackstop(env, ua)
    expect(bannerShown()).toBe(true)
    expect(mock.trackEvent).toHaveBeenCalledWith('signup_banner_shown', expect.anything())
  })

  it.each(NON_INAPP_CASES)('%s: 정독 85% 도달로도 배너가 뜬다', async (_l, env, ua) => {
    mock.env = env
    setUserAgent(ua)
    setLongArticle()
    localStorage.clear()
    sessionStorage.clear()
    render(<SignupPromptBanner />)
    await act(async () => { vi.advanceTimersByTime(1_000) }) // 백스톱 전
    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)
  })
})

describe('Android 외부 브라우저 A/B 실험 조건 불변', () => {
  it.each([
    ['Android Chrome', UA.androidChrome],
    ['Android Whale', UA.whale],
    ['Samsung Internet', UA.samsung],
  ])('%s: 백스톱 노출 시 실험 노출 이벤트가 그대로 발화한다', async (_l, ua) => {
    mock.getExperimentVariant.mockReturnValue('signup_warm')
    await renderAndWaitBackstop('android-chrome', ua)

    expect(bannerShown()).toBe(true)
    expect(mock.trackEvent).toHaveBeenCalledWith(
      'android_conversion_prompt_exposed',
      expect.objectContaining({ variant: 'signup_warm', trigger: 'backstop' }),
    )
  })

  it('인앱은 실험 세그먼트가 아니므로 실험 노출이 발화하지 않는다', async () => {
    mock.getExperimentVariant.mockReturnValue('signup_warm')
    await renderAndWaitBackstop('naver-inapp', UA.naverAndroid)
    await scrollToReadComplete()

    expect(bannerShown()).toBe(true)
    expect(mock.trackEvent).not.toHaveBeenCalledWith(
      'android_conversion_prompt_exposed',
      expect.anything(),
    )
  })
})

describe('CTA 문구·클릭 경로 회귀 0 (PR #320/#321 정책 유지)', () => {
  it('iOS Naver 인앱: 카카오로 1초 가입 + OAuth 직행', async () => {
    await renderAndWaitBackstop('naver-inapp', UA.naverIos)
    await scrollToReadComplete()

    const cta = screen.getByTestId('signup-banner-cta')
    expect(cta.textContent).toContain('카카오로 1초 가입')
    fireEvent.click(cta)
    expect(mock.startKakaoLogin).toHaveBeenCalledWith('/community/stories/test-post')
    expect(mock.trackEvent).toHaveBeenCalledWith(
      'signup_banner_clicked',
      { cta_type: 'kakao_oauth', env: 'naver-inapp' },
    )
  })

  it('Android Naver 인앱: 카카오로 가입하기 + intent 경로 유지', async () => {
    await renderAndWaitBackstop('naver-inapp', UA.naverAndroid)
    await scrollToReadComplete()

    const cta = screen.getByTestId('signup-banner-cta')
    expect(cta.textContent).toContain('카카오로 가입하기')
    fireEvent.click(cta)
    expect(mock.startKakaoLogin).not.toHaveBeenCalled()
    expect(mock.trackEvent).toHaveBeenCalledWith(
      INAPP_REDIRECT_EVENTS.attempted,
      expect.objectContaining({ source: 'naver-inapp', redirect_method: 'intent', cta_type: 'external_browser' }),
    )
  })

  it('금지 문구가 어느 인앱 채널에서도 나오지 않는다', async () => {
    for (const [, env, ua] of INAPP_CASES) {
      cleanup()
      await renderAndWaitBackstop(env, ua)
      await scrollToReadComplete()
      const text = document.body.textContent ?? ''
      for (const banned of [
        '브라우저에서 가입하기',
        '카카오 밖에서 가입하기',
        '주소가 복사됐어요',
        '주소 다시 복사하기',
        'Safari 주소창에 붙여넣',
      ]) {
        expect(text).not.toContain(banned)
      }
    }
  })
})

describe('PR #318 UX 회귀 0 — 인앱은 읽기를 막지 않는다', () => {
  it('인앱은 배너가 떠도 body 스크롤이 잠기지 않는다', async () => {
    await renderAndWaitBackstop('naver-inapp', UA.naverAndroid)
    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('비인앱은 기존대로 스크롤이 잠긴다', async () => {
    await renderAndWaitBackstop('ios-safari', UA.iosSafari)
    expect(bannerShown()).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('인앱에서 ✕ 버튼으로 닫을 수 있다', async () => {
    await renderAndWaitBackstop('naver-inapp', UA.naverAndroid)
    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)

    fireEvent.click(screen.getByLabelText('닫기'))
    expect(bannerShown()).toBe(false)
    expect(mock.trackEvent).toHaveBeenCalledWith('signup_banner_dismissed', expect.anything())
  })
})

describe('노출 횟수·storage 정책 불변', () => {
  it('인앱 노출도 기존 카운터를 그대로 쓴다', async () => {
    await renderAndWaitBackstop('naver-inapp', UA.naverAndroid)
    await scrollToReadComplete()
    expect(localStorage.getItem('signup_prompt_count')).toBe('1')
    expect(sessionStorage.getItem('signup_prompt_shown_this_session')).toBe('1')
  })

  it('세션당 1회 제한이 인앱에서도 유지된다', async () => {
    await renderAndWaitBackstop('naver-inapp', UA.naverAndroid)
    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)

    fireEvent.click(screen.getByLabelText('닫기'))
    cleanup()
    // 같은 세션에서 다시 렌더 — sessionStorage를 지우지 않는다
    mock.env = 'naver-inapp'
    setLongArticle()
    render(<SignupPromptBanner />)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await scrollToReadComplete()
    expect(bannerShown()).toBe(false)
  })
})
