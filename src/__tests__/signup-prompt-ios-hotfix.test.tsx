import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { INAPP_REDIRECT_EVENTS } from '@/lib/inapp-redirect'

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

vi.mock('@/components/common/AddToHomeScreen', () => ({
  detectEnv: () => mock.env,
}))

vi.mock('@/lib/kakao-start', () => ({
  startKakaoLogin: mock.startKakaoLogin,
}))

vi.mock('@/lib/track', () => ({
  trackEvent: mock.trackEvent,
}))

vi.mock('@/lib/experiments/assign', () => ({
  getExperimentVariant: mock.getExperimentVariant,
}))

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
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  kakaoIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  googleIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/15.12.30.28',
  naverAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.9.2)',
}

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  })
}

async function renderShownBanner(env: string, userAgent: string) {
  mock.env = env
  setUserAgent(userAgent)
  localStorage.clear()
  sessionStorage.clear()
  render(<SignupPromptBanner />)
  await act(async () => {
    vi.advanceTimersByTime(60_000)
  })
  return screen.getByTestId('signup-banner-cta')
}

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

describe('iOS SignupPromptBanner hotfix — 모든 iOS는 카카오 OAuth 직행', () => {
  it.each([
    ['iOS Naver in-app', 'naver-inapp', UA.naverIos],
    ['iOS Safari', 'ios-safari', UA.iosSafari],
    ['iOS Chrome', 'crios', UA.iosChrome],
    ['iOS Kakao in-app', 'kakao-ios', UA.kakaoIos],
    ['iOS Google in-app', 'google-inapp', UA.googleIos],
  ])('%s: CTA 문구와 클릭 경로가 카카오 OAuth 직행이다', async (_label, env, ua) => {
    const cta = await renderShownBanner(env, ua)

    expect(cta.textContent).toContain('카카오로 1초 가입')
    expect(cta.textContent).not.toContain('브라우저')
    expect(screen.queryByText('주소가 복사됐어요')).toBeNull()
    expect(screen.queryByText('주소 다시 복사하기')).toBeNull()
    expect(screen.queryByText(/Safari 주소창/)).toBeNull()

    fireEvent.click(cta)

    expect(mock.startKakaoLogin).toHaveBeenCalledWith('/community/stories/test-post')
    expect(mock.trackEvent).toHaveBeenCalledWith(
      'signup_banner_clicked',
      { cta_type: 'kakao_oauth', env },
    )
    expect(mock.trackEvent).not.toHaveBeenCalledWith(
      INAPP_REDIRECT_EVENTS.attempted,
      expect.anything(),
    )
  })
})

describe('Android 정책 회귀 방지', () => {
  it('Android Naver 인앱은 가입 문구를 보이되 기존 외부 브라우저 유도 동작을 유지한다', async () => {
    const cta = await renderShownBanner('naver-inapp', UA.naverAndroid)

    expect(cta.textContent).toContain('카카오로 가입하기')
    expect(cta.textContent).not.toContain('브라우저')
    fireEvent.click(cta)

    expect(mock.startKakaoLogin).not.toHaveBeenCalled()
    expect(mock.trackEvent).toHaveBeenCalledWith(
      INAPP_REDIRECT_EVENTS.attempted,
      expect.objectContaining({
        surface: 'signup_prompt_banner',
        source: 'naver-inapp',
        redirect_method: 'intent',
        cta_type: 'external_browser',
      }),
    )
  })
})
