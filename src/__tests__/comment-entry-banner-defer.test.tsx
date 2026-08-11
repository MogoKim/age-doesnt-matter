/**
 * PR-C1 — 댓글 입력 맥락에서 가입 배너 자동 노출 **지연**.
 *
 * 무엇을 고정하는가
 *   배너는 정독 85%에 뜨는데 그 지점이 사용자가 댓글 입력에 닿는 순간이라,
 *   함께 깔리는 `fixed inset-0` dim이 입력을 물리적으로 막아왔다.
 *   글 상세에서는 댓글 입력이 우선이므로 **입력이 화면에 있는 동안에는 미룬다.**
 *
 * 취소가 아니라 지연이다
 *   입력창이 화면을 벗어나면 배너는 **다시 뜬다.** 그걸 여기서 증명한다.
 *   (트리거가 소모되면 배너가 영영 안 뜨는 회귀가 된다)
 *
 * 바뀌지 않는 것
 *   문구·CTA·타깃·노출 횟수 정책·실험 정의. 그리고 댓글과 무관한 화면의 기존 동작.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { resetCommentEntryActive, setCommentEntryActive } from '@/lib/comment-entry-state'

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

const UA_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'

const DOC_H = 5000
const VIEW_H = 800
const READ_COMPLETE_Y = Math.ceil((DOC_H - VIEW_H) * 0.85)

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}
function setLongArticle() {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: DOC_H, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: VIEW_H, configurable: true, writable: true })
  setScrollY(0)
}
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}
const bannerShown = () =>
  screen.queryByTestId('signup-banner-cta') !== null ||
  screen.queryByTestId('android-conversion-app-cta') !== null

async function scrollToReadComplete() {
  setScrollY(READ_COMPLETE_Y)
  await act(async () => { window.dispatchEvent(new Event('scroll')) })
}
/** 댓글 입력이 화면에 들어오거나 벗어난 상황을 만든다 */
async function commentEntry(active: boolean) {
  await act(async () => { setCommentEntryActive(active) })
}

function renderBanner(env = 'ios-safari', ua = UA_SAFARI) {
  mock.env = env
  setUserAgent(ua)
  setLongArticle()
  localStorage.clear()
  sessionStorage.clear()
  return render(<SignupPromptBanner />)
}

beforeEach(() => {
  vi.useFakeTimers()
  mock.pathname = '/community/stories/test-post'
  mock.env = 'ios-safari'
  mock.searchParams = new URLSearchParams()
  mock.trackEvent.mockClear()
  mock.getExperimentVariant.mockReturnValue('')
  resetCommentEntryActive()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetCommentEntryActive()
  localStorage.clear()
  sessionStorage.clear()
  resetCommentEntryActive()
})

describe('댓글 입력 중 배너 지연', () => {
  it('댓글 입력이 화면에 있으면 정독 85%에 도달해도 배너가 뜨지 않는다', async () => {
    renderBanner()
    await commentEntry(true)
    await scrollToReadComplete()
    expect(bannerShown()).toBe(false)
  })

  it('입력창이 화면을 벗어나면 배너가 다시 뜬다 — 취소가 아니라 지연이다', async () => {
    renderBanner()
    await commentEntry(true)
    await scrollToReadComplete()
    expect(bannerShown()).toBe(false)

    await commentEntry(false)          // 댓글창을 벗어남 → 즉시 재시도
    expect(bannerShown()).toBe(true)
  })

  it('60초 백스톱이 지나 있어도 댓글 입력 중에는 미뤄지고, 벗어나면 뜬다', async () => {
    renderBanner()
    await commentEntry(true)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(bannerShown()).toBe(false)

    await commentEntry(false)
    expect(bannerShown()).toBe(true)
  })

  it('노출 횟수 정책을 소모하지 않는다 — 미뤄진 동안 count가 오르지 않는다', async () => {
    renderBanner()
    await commentEntry(true)
    await scrollToReadComplete()
    expect(localStorage.getItem('signup_prompt_count')).toBeNull()

    await commentEntry(false)
    expect(localStorage.getItem('signup_prompt_count')).toBe('1')
  })

  it('미뤄진 동안에는 노출 이벤트가 나가지 않는다', async () => {
    renderBanner()
    await commentEntry(true)
    await scrollToReadComplete()
    const shownWhileDeferred = mock.trackEvent.mock.calls.filter((c) => c[0] === 'signup_banner_shown')
    expect(shownWhileDeferred).toHaveLength(0)

    await commentEntry(false)
    expect(mock.trackEvent.mock.calls.filter((c) => c[0] === 'signup_banner_shown')).toHaveLength(1)
  })
})

describe('회귀 — 댓글 맥락이 아니면 기존 동작 그대로', () => {
  it('댓글 입력이 화면에 없으면 정독 85%에 그대로 뜬다', async () => {
    renderBanner()
    await scrollToReadComplete()
    expect(bannerShown()).toBe(true)
  })

  it('댓글 입력이 화면에 없으면 60초 백스톱도 그대로 동작한다 (비인앱)', async () => {
    renderBanner()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(bannerShown()).toBe(true)
  })

  it('인앱은 여전히 백스톱으로 뜨지 않는다 (F20 §8 유지)', async () => {
    renderBanner('naver-inapp', UA_SAFARI)
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(bannerShown()).toBe(false)
  })
})

describe('Android 외부 브라우저 A/B — 두 팔에 동일 적용 (비교 편향 없음)', () => {
  for (const variant of ['signup_warm', 'app_card'] as const) {
    it(`${variant}: 댓글 입력 중 미뤄지고, 벗어나면 노출 이벤트가 1회 나간다`, async () => {
      mock.getExperimentVariant.mockReturnValue(variant)
      renderBanner('android-chrome', UA_ANDROID_CHROME)
      await commentEntry(true)
      await scrollToReadComplete()
      const exposed = () =>
        mock.trackEvent.mock.calls.filter((c) => c[0] === 'android_conversion_prompt_exposed')
      expect(exposed()).toHaveLength(0)

      await commentEntry(false)
      expect(exposed()).toHaveLength(1)
      expect(exposed()[0][1]).toMatchObject({ variant })
    })
  }
})
