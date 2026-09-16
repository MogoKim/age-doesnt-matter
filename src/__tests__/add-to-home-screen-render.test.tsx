/**
 * 설치 안내 **컴포넌트 연결** 계약 — Foundation 3.0 (C-2 보정).
 *
 * `pwa-install-policy.test.ts` 는 추출한 정책 함수만 본다.
 * 그것만으로는 **화면이 그 정책을 실제로 쓰는지** 알 수 없다 —
 * 타이머가 안 걸리거나 이벤트를 안 떼도 통과한다.
 * 그래서 여기서는 컴포넌트를 실제로 렌더한다.
 *
 * 🔴 **네트워크·계측·저장은 전부 차단한다.** fetch 는 mock 이고,
 *    GTM·trackEvent 도 mock 이라 어떤 요청도 나가지 않는다.
 *    운영 DB 에 닿을 수 있는 실제 호출은 이 파일에서 한 건도 일어나지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/* ── 격리 ─────────────────────────────────────────────────── */
let pathname = '/community/stories'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

let session: { user?: { id: string } } | null = null
vi.mock('@/components/common/AppSessionProvider', () => ({ useAppSession: () => ({ data: session }) }))

let isCapacitor = false
vi.mock('@/hooks/useAppEnvironment', () => ({ useAppEnvironment: () => ({ isCapacitor }) }))

const toast = vi.fn()
vi.mock('@/components/common/Toast', () => ({ useToast: () => ({ toast }) }))

const gtmPwaPopupShown = vi.fn()
const gtmPwaInstall = vi.fn()
const gtmPwaBannerAction = vi.fn()
vi.mock('@/lib/gtm', () => ({
  gtmPwaPopupShown: (...a: unknown[]) => gtmPwaPopupShown(...a),
  gtmPwaInstall: (...a: unknown[]) => gtmPwaInstall(...a),
  gtmPwaBannerAction: (...a: unknown[]) => gtmPwaBannerAction(...a),
  getBrowserEnv: () => 'android-chrome',
}))
const trackEvent = vi.fn()
vi.mock('@/lib/track', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }))

import AddToHomeScreen from '@/components/common/AddToHomeScreen'
import { TIMER_MS, KEY_INSTALLED, KEY_COUNT, SESSION_SHOWN } from '@/lib/pwa-install-policy'

const fetchMock = vi.fn()

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  pathname = '/community/stories'
  session = null
  isCapacitor = false
  process.env.NEXT_PUBLIC_PWA_INSTALL_ENABLED = 'true'
  setUA('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile')
  setWidth(390)
  // 🔴 어떤 요청도 실제로 나가지 않는다.
  fetchMock.mockResolvedValue({ ok: false, json: async () => null })
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  cleanup()
})

const POPUP = /무료로 다운받기|홈 화면에 추가/
async function advanceToTimer() {
  await act(async () => { await vi.advanceTimersByTimeAsync(TIMER_MS + 50) })
}

/**
 * 🔴 팝업 본문은 `visible && (iOS || 네이티브 설치 가능 || 수동 호출)` 일 때만 그린다.
 *    안드로이드에서 `beforeinstallprompt` 를 못 잡았으면 **일부러 그리지 않는다** —
 *    설치시킬 방법이 없는데 안내만 띄우지 않기 위해서다.
 *    그래서 노출 경로를 보려면 이벤트를 먼저 흘려야 한다.
 */
async function openPopup() {
  const prompt = fireBeforeInstall()
  await advanceToTimer()
  return prompt
}

/* ── 타이머 ───────────────────────────────────────────────── */
describe('🔴 13초 타이머가 화면에 실제로 걸린다', () => {
  it('13초 전에는 뜨지 않는다', async () => {
    render(<AddToHomeScreen />)
    await act(async () => { await vi.advanceTimersByTimeAsync(TIMER_MS - 500) })
    expect(screen.queryByText(POPUP)).toBeNull()
  })

  it('13초가 지나면 뜬다 (네이티브 설치가 가능할 때)', async () => {
    render(<AddToHomeScreen />)
    await openPopup()
    expect(screen.getByText(POPUP)).toBeTruthy()
  })

  it('🔴 안드로이드인데 설치 프롬프트를 못 잡았으면 본문을 그리지 않는다', async () => {
    render(<AddToHomeScreen />)
    await advanceToTimer()
    // 트리거는 돌았지만(계측·세션 기록은 남는다) 설치시킬 방법이 없어 안내를 띄우지 않는다.
    expect(gtmPwaPopupShown).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(POPUP)).toBeNull()
  })

  it('노출되면 세션 표시와 노출 이력이 남는다', async () => {
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(sessionStorage.getItem(SESSION_SHOWN)).toBe('1')
    expect(localStorage.getItem('pwa_shown_triggers')).toContain('first_15s')
  })

  it('노출 기록 POST 는 mock 으로만 나간다 (실제 write 없음)', async () => {
    render(<AddToHomeScreen />)
    await advanceToTimer()
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0][0]).toBe('/api/user/pwa-status')
    expect(JSON.parse(posts[0][1].body)).toEqual({ action: 'popup_shown' })
  })

  it('계측은 트리거와 환경을 실어 한 번 나간다', async () => {
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(gtmPwaPopupShown).toHaveBeenCalledTimes(1)
    expect(gtmPwaPopupShown.mock.calls[0][0]).toBe('first_15s')
  })
})

describe('🔴 제외 경로에서는 타이머가 걸리지 않는다', () => {
  it.each(['/login', '/signup', '/onboarding'])('%s', async (p) => {
    pathname = p
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
    expect(gtmPwaPopupShown).not.toHaveBeenCalled()
  })

  it('제외 경로 하위도 막는다', async () => {
    pathname = '/signup/step2'
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
  })
})

describe('세션 내 중복 억제', () => {
  it('이미 이 세션에서 떴으면 다시 뜨지 않는다', async () => {
    sessionStorage.setItem(SESSION_SHOWN, '1')
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
  })

  it('설치된 상태면 뜨지 않는다', async () => {
    localStorage.setItem(KEY_INSTALLED, '1')
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
  })

  it('경로가 바뀌어도 세션당 한 번뿐이다', async () => {
    const { rerender } = render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(gtmPwaPopupShown).toHaveBeenCalledTimes(1)
    pathname = '/magazine'
    rerender(<AddToHomeScreen />)
    await advanceToTimer()
    expect(gtmPwaPopupShown).toHaveBeenCalledTimes(1)
  })
})

describe('플래그·환경 가드', () => {
  it('플래그가 꺼져 있으면 아무 일도 하지 않는다', async () => {
    process.env.NEXT_PUBLIC_PWA_INSTALL_ENABLED = 'false'
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Capacitor 앱 안에서는 띄우지 않는다', async () => {
    isCapacitor = true
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/* ── 설치 이벤트 ──────────────────────────────────────────── */
function fireBeforeInstall() {
  const prompt = vi.fn(async () => {})
  const ev = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  ev.prompt = prompt
  ev.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  act(() => { window.dispatchEvent(ev) })
  return prompt
}

describe('🔴 beforeinstallprompt / appinstalled', () => {
  it('beforeinstallprompt 를 가로채 기본 동작을 막는다', () => {
    render(<AddToHomeScreen />)
    const ev = new Event('beforeinstallprompt', { cancelable: true })
    act(() => { window.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
  })

  it('설치를 누르면 저장해 둔 prompt 를 쓰고 결과를 계측한다', async () => {
    render(<AddToHomeScreen />)
    const prompt = await openPopup()
    fireEvent.click(screen.getByText('무료로 다운받기'))
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(gtmPwaInstall).toHaveBeenCalled())
    expect(gtmPwaInstall.mock.calls[0][2]).toBe('accepted')
  })

  it('설치 후 팝업이 닫힌다', async () => {
    render(<AddToHomeScreen />)
    await openPopup()
    fireEvent.click(screen.getByText('무료로 다운받기'))
    await waitFor(() => expect(screen.queryByText('무료로 다운받기')).toBeNull())
  })
})

describe('🔴 닫기', () => {
  it('"나중에 할게요" 로 닫으면 거절 수가 올라간다', async () => {
    render(<AddToHomeScreen />)
    await openPopup()
    expect(localStorage.getItem(KEY_COUNT)).toBeNull()
    fireEvent.click(screen.getByText('나중에 할게요'))
    await waitFor(() => expect(screen.queryByText(POPUP)).toBeNull())
    expect(localStorage.getItem(KEY_COUNT)).toBe('1')
  })

  it('닫기는 dismissed 로 계측된다', async () => {
    render(<AddToHomeScreen />)
    await openPopup()
    fireEvent.click(screen.getByText('나중에 할게요'))
    await waitFor(() => expect(gtmPwaInstall).toHaveBeenCalled())
    expect(gtmPwaInstall.mock.calls[0][2]).toBe('dismissed')
  })

  it('X 버튼으로도 닫힌다', async () => {
    render(<AddToHomeScreen />)
    await openPopup()
    fireEvent.click(screen.getAllByLabelText('닫기')[0])
    await waitFor(() => expect(screen.queryByText(POPUP)).toBeNull())
  })
})

/* ── 이벤트 정리 ──────────────────────────────────────────── */
describe('🔴 언마운트하면 이벤트와 타이머를 정리한다', () => {
  it('등록한 리스너를 모두 뗀다', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<AddToHomeScreen />)
    const added = add.mock.calls.filter(([t]) => t === 'beforeinstallprompt' || t === 'pwa-prompt')
    expect(added.length).toBeGreaterThanOrEqual(2)
    unmount()
    const removed = remove.mock.calls.filter(([t]) => t === 'beforeinstallprompt' || t === 'pwa-prompt')
    expect(removed.map(([t]) => t).sort()).toEqual(['beforeinstallprompt', 'pwa-prompt'])
    add.mockRestore(); remove.mockRestore()
  })

  it('언마운트 뒤에는 타이머가 터지지 않는다', async () => {
    const { unmount } = render(<AddToHomeScreen />)
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(TIMER_MS + 1000) })
    expect(gtmPwaPopupShown).not.toHaveBeenCalled()
  })

  it('언마운트 뒤 beforeinstallprompt 는 무시된다', () => {
    const { unmount } = render(<AddToHomeScreen />)
    unmount()
    const ev = new Event('beforeinstallprompt', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })
})

/* ── 정책 함수와 화면의 연결 ──────────────────────────────── */
describe('추출한 정책을 화면이 실제로 쓴다', () => {
  it('정책이 막으면 화면도 뜨지 않는다 (DB 노출 수 우회 방지 경로)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ installed: false, popupShownCount: 3, bannerDismissCount: 0, bannerLastDismissAt: null, bannerHiddenUntil: null }) })
    render(<AddToHomeScreen />)
    await advanceToTimer()
    expect(screen.queryByText(POPUP)).toBeNull()
  })

  it('DB 노출 수가 localStorage 보다 크면 동기화한다', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ installed: false, popupShownCount: 2, bannerDismissCount: 0, bannerLastDismissAt: null, bannerHiddenUntil: null }) })
    render(<AddToHomeScreen />)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    await waitFor(() => expect(localStorage.getItem('pwa_shown_count')).toBe('2'))
  })
})
