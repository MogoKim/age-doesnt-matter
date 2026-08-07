import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { trackEvent } from '@/lib/track'
import { ANON_CID_KEY, __resetAnonCidCacheForTest, isValidAnonCid } from '@/lib/anon-cid'
import { resolveEventSessionId } from '@/lib/anon-cid'

/**
 * trackEvent가 anon_cid를 **중앙에서** 동봉하는지, 그리고 `/api/events`가 그 값을
 * sessionId로 채택하는지 검증한다 (F19).
 *
 * 이 두 지점이 첫 방문 동시 이벤트 5종을 한 사람으로 묶는 전부다.
 * 호출부(PageViewTracker·PostViewBeacon·PostCTA·NextPostsInline)는 아무것도 안 해도 된다 —
 * 그게 이 설계의 요점이므로 회귀를 고정한다.
 */

/** sendBeacon으로 나간 payload를 파싱해 돌려준다. */
function sentPayloads(beacon: ReturnType<typeof vi.fn>): Array<Record<string, unknown>> {
  return beacon.mock.calls.map(([, blob]) => JSON.parse((blob as { __body: string }).__body))
}

let beacon: ReturnType<typeof vi.fn>
const realStorage = window.localStorage

beforeEach(() => {
  __resetAnonCidCacheForTest()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: realStorage })
  window.localStorage.clear()

  // happy-dom Blob은 동기 text() 접근이 없어 payload를 직접 들고 있게 감싼다
  vi.stubGlobal(
    'Blob',
    class {
      __body: string
      type: string
      constructor(parts: string[], opts?: { type?: string }) {
        this.__body = parts.join('')
        this.type = opts?.type ?? ''
      }
    },
  )
  beacon = vi.fn(() => true)
  Object.defineProperty(window.navigator, 'sendBeacon', { value: beacon, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  __resetAnonCidCacheForTest()
})

describe('trackEvent — anon_cid 자동 동봉', () => {
  it('호출부가 아무것도 안 넣어도 properties.anon_cid가 붙는다', () => {
    trackEvent('page_view')
    const [payload] = sentPayloads(beacon)
    const props = payload.properties as Record<string, unknown>
    expect(isValidAnonCid(props.anon_cid)).toBe(true)
  })

  it('기존 properties를 보존한다 — 덮어쓰기 사고 방지', () => {
    trackEvent('android_conversion_prompt_exposed', {
      experiment_id: 'android_conversion_a2_b2',
      variant: 'app_card',
      surface: 'signup_prompt_banner',
    })
    const [payload] = sentPayloads(beacon)
    const props = payload.properties as Record<string, unknown>
    expect(props.experiment_id).toBe('android_conversion_a2_b2')
    expect(props.variant).toBe('app_card')
    expect(props.surface).toBe('signup_prompt_banner')
    expect(isValidAnonCid(props.anon_cid)).toBe(true)
  })

  it('첫 방문 동시 이벤트 5종이 같은 anon_cid를 갖는다 — 이 PR의 핵심 목적', () => {
    trackEvent('page_view')
    trackEvent('post_read')
    trackEvent('post_view')
    trackEvent('post_cta_shown')
    trackEvent('related_recommend_view')

    const cids = sentPayloads(beacon).map(
      (p) => (p.properties as Record<string, unknown>).anon_cid,
    )
    expect(cids).toHaveLength(5)
    expect(new Set(cids).size).toBe(1)
    expect(isValidAnonCid(cids[0])).toBe(true)
  })

  it('호출부가 넘긴 anon_cid는 중앙값으로 덮어쓴다 — 식별자는 단일 출처', () => {
    trackEvent('page_view', { anon_cid: 'spoofed-value-1234' })
    const [payload] = sentPayloads(beacon)
    const props = payload.properties as Record<string, unknown>
    expect(props.anon_cid).not.toBe('spoofed-value-1234')
    expect(props.anon_cid).toBe(window.localStorage.getItem(ANON_CID_KEY))
  })

  it('localStorage가 막혀 있어도 이벤트는 그대로 나간다 — anon_cid만 빠진다', () => {
    // happy-dom localStorage는 Proxy라 spyOn이 새기 때문에 프로퍼티째 교체한다
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('SecurityError: storage blocked')
        },
        setItem: () => {
          throw new Error('SecurityError: storage blocked')
        },
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
    })
    expect(() => trackEvent('page_view', { path: '/community' })).not.toThrow()
    expect(beacon).toHaveBeenCalledTimes(1)
    const [payload] = sentPayloads(beacon)
    const props = payload.properties as Record<string, unknown>
    expect(props.path).toBe('/community')
    expect(props.anon_cid).toBeUndefined() // 서버가 `_anon_sid` 쿠키로 fallback
  })

  it('추가 네트워크 요청을 만들지 않는다 — sendBeacon 1건뿐(F19 성능 상한)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    trackEvent('page_view')
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sendBeacon 경로를 유지한다 (엔드포인트 무변경)', () => {
    trackEvent('page_view')
    expect(beacon.mock.calls[0]![0]).toBe('/api/events')
  })
})

describe('resolveEventSessionId — /api/events 식별자 결정', () => {
  const fallback = () => 'generated-uuid-0001'

  it('유효한 anon_cid를 최우선으로 쓴다', () => {
    expect(
      resolveEventSessionId({
        isBot: false,
        properties: { anon_cid: 'cid-aaaa1111' },
        existingSid: 'cookie-sid-1111',
        createFallbackId: fallback,
      }),
    ).toBe('cid-aaaa1111')
  })

  it('형식 위반 anon_cid는 무시하고 쿠키로 떨어진다', () => {
    expect(
      resolveEventSessionId({
        isBot: false,
        properties: { anon_cid: 'bad!!' },
        existingSid: 'cookie-sid-1111',
        createFallbackId: fallback,
      }),
    ).toBe('cookie-sid-1111')
  })

  it('anon_cid가 없으면 기존 `_anon_sid` 쿠키를 쓴다 — 재방문 연속성 유지', () => {
    expect(
      resolveEventSessionId({
        isBot: false,
        properties: { browser_env: 'android-chrome' },
        existingSid: 'cookie-sid-1111',
        createFallbackId: fallback,
      }),
    ).toBe('cookie-sid-1111')
  })

  it('둘 다 없으면 새로 발급한다 (기존 동작)', () => {
    expect(
      resolveEventSessionId({ isBot: false, existingSid: null, createFallbackId: fallback }),
    ).toBe('generated-uuid-0001')
  })

  it('봇은 anon_cid를 보내와도 sessionId가 null이다 — 기존 정책 불변', () => {
    expect(
      resolveEventSessionId({
        isBot: true,
        properties: { anon_cid: 'cid-aaaa1111' },
        existingSid: 'cookie-sid-1111',
        createFallbackId: fallback,
      }),
    ).toBeNull()
  })

  it('첫 방문 5개 동시 요청이 쿠키 없이도 같은 sessionId로 수렴한다', () => {
    const cid = 'cid-burst-0001'
    const ids = Array.from({ length: 5 }, (_, i) =>
      resolveEventSessionId({
        isBot: false,
        properties: { anon_cid: cid },
        existingSid: null, // 쿠키 왕복 전 — 5개 모두 쿠키 없음
        createFallbackId: () => `uuid-${i}`,
      }),
    )
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(cid)

    // 대조군: anon_cid가 없던 기존 동작은 5개로 갈린다(=현재 프로덕션 증상)
    const legacy = Array.from({ length: 5 }, (_, i) =>
      resolveEventSessionId({ isBot: false, existingSid: null, createFallbackId: () => `uuid-${i}` }),
    )
    expect(new Set(legacy).size).toBe(5)
  })
})
