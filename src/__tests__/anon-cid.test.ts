import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ANON_CID_KEY,
  __resetAnonCidCacheForTest,
  getOrCreateAnonCid,
  isValidAnonCid,
  peekAnonCid,
  readAnonCidFromProperties,
  resolveGuestKey,
  resolveIdentityKey,
} from '@/lib/anon-cid'

/**
 * 비회원 기기 식별자(anon_cid) 테스트 — F19 비회원 세션 계측 기준.
 *
 * 이 식별자는 비회원 UV·D1/D7·A/B 실험 분모의 **기준**이 된다.
 * 여기가 틀리면 "사용자가 몇 명인가"가 통째로 흔들리므로 회귀를 고정한다.
 */

const realStorage = window.localStorage

/**
 * happy-dom의 localStorage는 Proxy라 `vi.spyOn`이 깨끗하게 복원되지 않는다(모킹이 다음 테스트로 샌다).
 * 프로퍼티 자체를 갈아끼우고 되돌리는 방식으로 격리한다.
 */
function blockStorage(which: 'getItem' | 'setItem') {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => {
        if (which === 'getItem') throw new Error('SecurityError: storage blocked')
        return store.get(k) ?? null
      },
      setItem: (k: string, v: string) => {
        if (which === 'setItem') throw new Error('QuotaExceededError')
        store.set(k, v)
      },
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  })
}

const restoreLocalStorage = () => {
  __resetAnonCidCacheForTest()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: realStorage })
  try {
    window.localStorage.clear()
  } catch {
    /* noop */
  }
}

describe('isValidAnonCid — 서버가 그대로 DB 식별자로 쓰므로 형식을 좁게 고정', () => {
  it('UUID를 허용한다', () => {
    expect(isValidAnonCid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('hex/base36 문자열을 허용한다', () => {
    expect(isValidAnonCid('a1b2c3d4e5f60718')).toBe(true)
    expect(isValidAnonCid('lz9k2p-8fj3nd0q1a')).toBe(true)
  })

  it('문자열이 아니면 거부한다', () => {
    expect(isValidAnonCid(null)).toBe(false)
    expect(isValidAnonCid(undefined)).toBe(false)
    expect(isValidAnonCid(12345678)).toBe(false)
    expect(isValidAnonCid({ toString: () => 'abcdefgh' })).toBe(false)
  })

  it('너무 짧거나 너무 길면 거부한다', () => {
    expect(isValidAnonCid('abc')).toBe(false) // 8자 미만
    expect(isValidAnonCid('a'.repeat(65))).toBe(false) // 64자 초과
    expect(isValidAnonCid('a'.repeat(64))).toBe(true) // 경계값
    expect(isValidAnonCid('abcdefgh')).toBe(true) // 경계값
  })

  it('허용 문자 밖(공백·따옴표·경로·유니코드)은 거부한다 — 식별자 공간 오염 방지', () => {
    expect(isValidAnonCid('has space here')).toBe(false)
    expect(isValidAnonCid('drop"table')).toBe(false)
    expect(isValidAnonCid('../../etc/passwd')).toBe(false)
    expect(isValidAnonCid('식별자값입니다')).toBe(false)
    expect(isValidAnonCid('')).toBe(false)
  })
})

describe('getOrCreateAnonCid — 브라우저 동기 생성', () => {
  beforeEach(restoreLocalStorage)
  afterEach(() => {
    vi.restoreAllMocks()
    restoreLocalStorage()
  })

  it('최초 호출 시 생성해서 localStorage에 저장한다', () => {
    expect(window.localStorage.getItem(ANON_CID_KEY)).toBeNull()
    const cid = getOrCreateAnonCid()
    expect(cid).not.toBeNull()
    expect(isValidAnonCid(cid)).toBe(true)
    expect(window.localStorage.getItem(ANON_CID_KEY)).toBe(cid)
  })

  it('두 번째 호출은 같은 값을 재사용한다 — 첫 방문 동시 이벤트가 하나로 묶이는 근거', () => {
    const first = getOrCreateAnonCid()
    const second = getOrCreateAnonCid()
    const third = getOrCreateAnonCid()
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('새 페이지 로드(캐시 초기화)에서도 저장된 값을 다시 읽는다 — 재방문이 같은 사람으로 잡힌다', () => {
    const first = getOrCreateAnonCid()
    __resetAnonCidCacheForTest() // 새 페이지 로드 상황
    expect(getOrCreateAnonCid()).toBe(first)
  })

  it('저장된 값이 형식에 안 맞으면 새로 만든다', () => {
    window.localStorage.setItem(ANON_CID_KEY, 'bad value!!')
    const cid = getOrCreateAnonCid()
    expect(isValidAnonCid(cid)).toBe(true)
    expect(cid).not.toBe('bad value!!')
  })

  it('localStorage read가 throw해도 이벤트를 깨뜨리지 않고 null을 준다', () => {
    blockStorage('getItem')
    expect(() => getOrCreateAnonCid()).not.toThrow()
    expect(getOrCreateAnonCid()).toBeNull()
  })

  it('read가 막히면 새로 만들지도 않는다 — 만들면 페이지 로드마다 달라져 쿠키보다 나빠진다', () => {
    blockStorage('getItem')
    expect(getOrCreateAnonCid()).toBeNull()
    __resetAnonCidCacheForTest() // 다음 페이지 로드
    expect(getOrCreateAnonCid()).toBeNull()
  })

  it('localStorage write가 throw하면 null을 준다 — 생성값을 돌려주면 이벤트마다 달라져 파편화가 악화된다', () => {
    blockStorage('setItem')
    expect(getOrCreateAnonCid()).toBeNull()
    // 반복 호출해도 계속 null — 서버가 `_anon_sid` 쿠키 fallback을 쓰게 둔다
    expect(getOrCreateAnonCid()).toBeNull()
  })

  it('crypto.randomUUID가 없으면 getRandomValues fallback으로 유효한 값을 만든다', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('not available')
    })
    const cid = getOrCreateAnonCid()
    expect(isValidAnonCid(cid)).toBe(true)
  })

  it('생성값은 서로 충돌하지 않는다', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      restoreLocalStorage()
      const cid = getOrCreateAnonCid()
      expect(cid).not.toBeNull()
      seen.add(cid!)
    }
    expect(seen.size).toBe(200)
  })
})

describe('peekAnonCid — 없으면 만들지 않는다', () => {
  beforeEach(restoreLocalStorage)

  it('저장 전에는 null', () => {
    expect(peekAnonCid()).toBeNull()
    expect(window.localStorage.getItem(ANON_CID_KEY)).toBeNull() // 부작용 없음
  })

  it('저장 후에는 그 값', () => {
    const cid = getOrCreateAnonCid()
    expect(peekAnonCid()).toBe(cid)
  })
})

describe('readAnonCidFromProperties — 서버가 클라 payload를 읽는 경로', () => {
  it('유효한 값을 꺼낸다', () => {
    expect(readAnonCidFromProperties({ anon_cid: 'a1b2c3d4e5f60718' })).toBe('a1b2c3d4e5f60718')
  })

  it('유효하지 않으면 null — 조용히 무시하고 fallback', () => {
    expect(readAnonCidFromProperties({ anon_cid: 'x' })).toBeNull()
    expect(readAnonCidFromProperties({ anon_cid: 42 })).toBeNull()
    expect(readAnonCidFromProperties({ anon_cid: null })).toBeNull()
    expect(readAnonCidFromProperties({})).toBeNull()
  })

  it('properties 자체가 없거나 JSON이 아니면 null — 과거 행 호환', () => {
    expect(readAnonCidFromProperties(null)).toBeNull()
    expect(readAnonCidFromProperties(undefined)).toBeNull()
    expect(readAnonCidFromProperties('not-an-object')).toBeNull()
    expect(readAnonCidFromProperties(123)).toBeNull()
  })
})

describe('resolveGuestKey — 비회원 식별자 우선순위 (anon_cid → sessionId)', () => {
  it('anon_cid가 있으면 그것을 쓴다', () => {
    expect(
      resolveGuestKey({ sessionId: 'sid-11111111', properties: { anon_cid: 'cid-22222222' } }),
    ).toBe('cid-22222222')
  })

  it('anon_cid가 없으면 sessionId로 떨어진다 — 과거 데이터 호환', () => {
    expect(resolveGuestKey({ sessionId: 'sid-11111111', properties: { browser_env: 'web' } })).toBe(
      'sid-11111111',
    )
    expect(resolveGuestKey({ sessionId: 'sid-11111111' })).toBe('sid-11111111')
  })

  it('anon_cid가 형식 위반이면 sessionId로 떨어진다', () => {
    expect(resolveGuestKey({ sessionId: 'sid-11111111', properties: { anon_cid: '!!' } })).toBe(
      'sid-11111111',
    )
  })

  it('둘 다 없으면 null (봇 등)', () => {
    expect(resolveGuestKey({ sessionId: null })).toBeNull()
    expect(resolveGuestKey({ sessionId: null, properties: {} })).toBeNull()
  })

  it('파편화된 여러 행이 같은 anon_cid면 한 명으로 합쳐진다 — 이 PR의 핵심 목적', () => {
    const cid = 'cid-aaaaaaaa'
    const burst = [
      { sessionId: 'sid-1111aaaa', properties: { anon_cid: cid } }, // page_view
      { sessionId: 'sid-2222bbbb', properties: { anon_cid: cid } }, // post_read
      { sessionId: 'sid-3333cccc', properties: { anon_cid: cid } }, // post_view
      { sessionId: 'sid-4444dddd', properties: { anon_cid: cid } }, // post_cta_shown
      { sessionId: 'sid-5555eeee', properties: { anon_cid: cid } }, // related_recommend_view
    ]
    expect(new Set(burst.map(resolveGuestKey)).size).toBe(1)
    // 대조군: anon_cid가 없던 과거 방식은 5명으로 갈린다
    expect(new Set(burst.map((r) => resolveGuestKey({ sessionId: r.sessionId }))).size).toBe(5)
  })
})

describe('resolveIdentityKey — 전체 우선순위 (userId → anon_cid → sessionId)', () => {
  it('회원은 언제나 userId가 정본이다 — 기기·세션이 갈려도 한 사람', () => {
    expect(
      resolveIdentityKey({
        userId: 'user-1',
        sessionId: 'sid-11111111',
        properties: { anon_cid: 'cid-22222222' },
      }),
    ).toBe('user-1')
  })

  it('같은 회원의 서로 다른 세션은 1명으로 합쳐진다', () => {
    const rows = [
      { userId: 'user-1', sessionId: 'sid-1111aaaa', properties: { anon_cid: 'cid-aaaa1111' } },
      { userId: 'user-1', sessionId: 'sid-2222bbbb', properties: { anon_cid: 'cid-bbbb2222' } },
    ]
    expect(new Set(rows.map(resolveIdentityKey)).size).toBe(1)
  })

  it('비회원은 anon_cid → sessionId 순서를 따른다', () => {
    expect(
      resolveIdentityKey({ userId: null, sessionId: 'sid-1111', properties: { anon_cid: 'cid-2222aaaa' } }),
    ).toBe('cid-2222aaaa')
    expect(resolveIdentityKey({ userId: null, sessionId: 'sid-11111111' })).toBe('sid-11111111')
  })

  it('식별자가 하나도 없으면 null', () => {
    expect(resolveIdentityKey({ userId: null, sessionId: null })).toBeNull()
  })
})

describe('어드민 집계 의미 — 과거 행과 신규 행이 섞여도 깨지지 않는다', () => {
  /** admin.dashboard / admin.retention 의 코호트 집계와 같은 방식으로 고유 식별자를 센다. */
  const countUnique = (rows: Array<Parameters<typeof resolveIdentityKey>[0]>) =>
    new Set(rows.map(resolveIdentityKey).filter((k): k is string => !!k)).size

  it('배포 전 행(anon_cid 없음)은 기존 sessionId 기준 그대로 집계된다 — 과거 시계열 보존', () => {
    const legacyRows = [
      { userId: null, sessionId: 'old-sid-1111' },
      { userId: null, sessionId: 'old-sid-1111' },
      { userId: null, sessionId: 'old-sid-2222' },
    ]
    expect(countUnique(legacyRows)).toBe(2)
  })

  it('배포 후 행은 파편 sessionId여도 anon_cid로 1명으로 합쳐진다', () => {
    const newRows = [
      { userId: null, sessionId: 'sid-a1', properties: { anon_cid: 'cid-same0001' } },
      { userId: null, sessionId: 'sid-b2', properties: { anon_cid: 'cid-same0001' } },
      { userId: null, sessionId: 'sid-c3', properties: { anon_cid: 'cid-same0001' } },
    ]
    expect(countUnique(newRows)).toBe(1)
  })

  it('과거 행 + 신규 행이 섞여도 예외 없이 각자 기준으로 집계된다', () => {
    const mixed = [
      { userId: null, sessionId: 'old-sid-1111' }, // 배포 전
      { userId: null, sessionId: 'sid-a1', properties: { anon_cid: 'cid-same0001' } }, // 배포 후 같은 사람
      { userId: null, sessionId: 'sid-b2', properties: { anon_cid: 'cid-same0001' } },
      { userId: 'user-9', sessionId: 'sid-c3', properties: { anon_cid: 'cid-other002' } }, // 회원
    ]
    // 과거 1 + 신규 비회원 1 + 회원 1
    expect(countUnique(mixed)).toBe(3)
  })

  it('회원이 두 기기에서 들어와도 1명 — 실험 전환 분자(userId)와 기준이 일치한다', () => {
    const sameMember = [
      { userId: 'user-9', sessionId: 'sid-phone', properties: { anon_cid: 'cid-phone0001' } },
      { userId: 'user-9', sessionId: 'sid-pc', properties: { anon_cid: 'cid-pc000001' } },
    ]
    expect(countUnique(sameMember)).toBe(1)
  })

  it('실험 노출 분모(resolveGuestKey)는 회원 여부와 무관하게 노출 기기를 센다', () => {
    // 실험 노출은 "그 화면을 본 브라우저" 기준 — userId로 합치면 안 된다
    const exposures = [
      { sessionId: 'sid-1', properties: { anon_cid: 'cid-device001' } },
      { sessionId: 'sid-2', properties: { anon_cid: 'cid-device001' } },
      { sessionId: 'sid-3', properties: { anon_cid: 'cid-device002' } },
    ]
    expect(new Set(exposures.map(resolveGuestKey)).size).toBe(2)
  })
})
