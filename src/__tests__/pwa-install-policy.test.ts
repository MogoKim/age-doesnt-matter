/**
 * 설치 안내 정책 계약 — Foundation 3.0 (C-2).
 *
 * ── 왜 화면에서 떼어냈나 ────────────────────────────────────
 *  `AddToHomeScreen.tsx` 는 768줄이었고 브라우저 판별·노출 이력·화면이 한 파일에 있었다.
 *  "왜 또 떴지"를 확인하려면 컴포넌트를 렌더해야 했다.
 *  정책만 떼어 내니 저장소와 시계만으로 검증된다.
 *
 * 🔴 설치 상태 POST(`/api/user/pwa-status`)와 계측은 전부 mock 이다 —
 *    이 테스트는 네트워크를 건드리지 않는다.
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  detectEnv, getInstalled, getShown, getShownCount, getDeclineCount,
  markShown, incrementSessionCount, canShow, postPopupShown,
  BLOCKED_ENVS, ANDROID_ENVS, EXCLUDED_PATHS, MAX_DECLINES, TIMER_MS, WEEKLY_MS,
  KEY_INSTALLED, KEY_COUNT, KEY_LAST_PROMPTED, KEY_SHOWN_COUNT, SESSION_SHOWN,
} from '@/lib/pwa-install-policy'

const fetchMock = vi.fn()

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}
/** 🔴 판별은 UA 보다 **폭**을 먼저 본다 — 1024 이상이면 무조건 desktop 이다. */
function setWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  fetchMock.mockReset().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  setUA('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile')
  setWidth(390)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('타이머·상수', () => {
  it('첫 노출 대기는 13초다', () => {
    expect(TIMER_MS).toBe(13_000)
  })
  it('주간 반복은 7일, 거절 상한은 3회다', () => {
    expect(WEEKLY_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(MAX_DECLINES).toBe(3)
  })
  it('가입·로그인·온보딩 경로에서는 띄우지 않는다', () => {
    expect(EXCLUDED_PATHS).toEqual(['/login', '/signup', '/onboarding'])
  })
})

describe('환경 판별', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile', 'android-chrome'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari', 'ios-safari'],
    ['Mozilla/5.0 (iPhone) CriOS/120', 'crios'],
    ['Mozilla/5.0 (Linux; Android 13) KAKAOTALK/10.0', 'kakao-android'],
    ['Mozilla/5.0 (iPhone) KAKAOTALK/10.0', 'kakao-ios'],
    ['Mozilla/5.0 (Linux; Android 13) NAVER(inapp; search)', 'naver-inapp'],
    ['Mozilla/5.0 (iPhone) Instagram 300.0', 'instagram-inapp'],
    ['Mozilla/5.0 (Linux; Android 13) GSA/300.0', 'google-inapp'],
    ['Mozilla/5.0 (Linux; Android 13) SamsungBrowser/23', 'android-chrome'],
  ])('%s → %s', (ua, expected) => {
    setUA(ua)
    expect(detectEnv()).toBe(expected)
  })

  it('🔴 폭이 1024 이상이면 UA 와 무관하게 desktop 이다 (판별 1순위)', () => {
    setWidth(1024)
    setUA('Mozilla/5.0 (iPhone) KAKAOTALK/10.0')
    expect(detectEnv()).toBe('desktop')
    setWidth(1023)
    expect(detectEnv()).toBe('kakao-ios')
  })

  it('설치 불가 환경 목록에 인앱·데스크톱이 들어 있다', () => {
    for (const e of ['kakao-android', 'kakao-ios', 'naver-inapp', 'google-inapp', 'instagram-inapp', 'crios', 'desktop']) {
      expect(BLOCKED_ENVS).toContain(e)
    }
    expect(ANDROID_ENVS).toEqual(['android-chrome', 'other'])
  })
})

describe('저장소 — 노출·거절 이력', () => {
  it('처음에는 아무것도 기록돼 있지 않다', () => {
    expect(getInstalled()).toBe(false)
    expect(getShown()).toEqual([])
    expect(getShownCount()).toBe(0)
    expect(getDeclineCount()).toBe(0)
  })

  it('markShown 은 트리거를 누적하고 총 노출 수를 올린다', () => {
    markShown('first_15s')
    markShown('signup')
    expect(getShown()).toEqual(['first_15s', 'signup'])
    expect(getShownCount()).toBe(2)
  })

  it('저장된 이력이 깨져 있어도 빈 배열로 복구한다', () => {
    localStorage.setItem('pwa_shown_triggers', '{깨진 JSON')
    expect(getShown()).toEqual([])
  })

  it('설치 표시가 있으면 설치된 것으로 본다', () => {
    localStorage.setItem(KEY_INSTALLED, '1')
    expect(getInstalled()).toBe(true)
  })

  it('세션 카운트는 탭당 한 번만 올라간다', () => {
    expect(incrementSessionCount()).toBe(1)
    expect(incrementSessionCount()).toBe(1)   // 같은 세션 — 그대로
    sessionStorage.clear()                    // 새 탭
    expect(incrementSessionCount()).toBe(2)
  })
})

describe('🔴 노출 판정 — 언제 뜨고 언제 안 뜨는가', () => {
  it('설치했으면 어떤 트리거로도 뜨지 않는다', () => {
    localStorage.setItem(KEY_INSTALLED, '1')
    for (const t of ['first_15s', 'signup', 'engagement', 'weekly'] as const) {
      expect(canShow(t)).toBe(false)
    }
  })

  it('세션 안에서 이미 한 번 떴으면 더 뜨지 않는다', () => {
    sessionStorage.setItem(SESSION_SHOWN, '1')
    expect(canShow('first_15s')).toBe(false)
  })

  it('가입 유도 배너가 뜬 세션에서는 겹치지 않게 막는다', () => {
    sessionStorage.setItem('signup_prompt_shown_this_session', '1')
    expect(canShow('first_15s')).toBe(false)
  })

  it('first_15s 는 한 번도 안 뜬 경우에만', () => {
    expect(canShow('first_15s')).toBe(true)
    markShown('first_15s')
    expect(canShow('first_15s')).toBe(false)
  })

  it('signup 은 총 노출 2회 미만일 때만', () => {
    expect(canShow('signup')).toBe(true)
    markShown('first_15s')
    expect(canShow('signup')).toBe(true)      // 1회 — 아직 가능
    markShown('engagement')
    expect(canShow('signup')).toBe(false)     // 2회 — 막힌다
  })

  it('🔴 DB 노출 수가 더 크면 그쪽을 쓴다 — localStorage 를 지워도 우회되지 않는다', () => {
    expect(canShow('first_15s')).toBe(true)
    expect(canShow('first_15s', 1)).toBe(false)
    expect(canShow('engagement', 3)).toBe(false)
  })

  it('weekly 는 거절 3회를 넘기면 영영 뜨지 않는다', () => {
    localStorage.setItem(KEY_SHOWN_COUNT, '2')
    localStorage.setItem(KEY_COUNT, String(MAX_DECLINES))
    expect(canShow('weekly')).toBe(false)
  })

  it('weekly 는 앞선 안내가 2회 미만이면 뜨지 않는다', () => {
    localStorage.setItem(KEY_SHOWN_COUNT, '1')
    expect(canShow('weekly')).toBe(false)
  })

  it('weekly 는 마지막 안내 기록이 없으면 바로 가능하다', () => {
    localStorage.setItem(KEY_SHOWN_COUNT, '2')
    expect(canShow('weekly')).toBe(true)
  })

  it('🔴 weekly 의 7일 경계 — 하루 모자라면 안 뜨고, 정확히 7일이면 뜬다', () => {
    const now = new Date('2026-09-16T00:00:00Z').getTime()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    localStorage.setItem(KEY_SHOWN_COUNT, '2')

    localStorage.setItem(KEY_LAST_PROMPTED, new Date(now - 6 * 86400000).toISOString())
    expect(canShow('weekly')).toBe(false)

    localStorage.setItem(KEY_LAST_PROMPTED, new Date(now - WEEKLY_MS).toISOString())
    expect(canShow('weekly')).toBe(true)

    localStorage.setItem(KEY_LAST_PROMPTED, new Date(now - WEEKLY_MS + 1).toISOString())
    expect(canShow('weekly')).toBe(false)
  })

  it('모르는 트리거는 false 다', () => {
    expect(canShow('없는트리거' as never)).toBe(false)
  })
})

describe('설치 상태 POST — 격리 테스트에서 mock', () => {
  it('노출 기록은 fire-and-forget POST 한 번이다', () => {
    postPopupShown()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/user/pwa-status')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ action: 'popup_shown' })
  })

  it('POST 가 실패해도 던지지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(() => postPopupShown()).not.toThrow()
    await Promise.resolve()
  })
})

describe('기존 import 경로 호환', () => {
  it('detectEnv 를 AddToHomeScreen 에서 계속 가져올 수 있다', () => {
    // GoRedirect·PostCTA 가 그 경로로 쓰고 있다.
    const src = readFileSync('src/components/common/AddToHomeScreen.tsx', 'utf-8')
    expect(src).toContain('export { detectEnv }')
  })
})
