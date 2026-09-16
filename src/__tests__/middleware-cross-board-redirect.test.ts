/**
 * 크로스보드 상세 URL → **HTTP 308** (middleware 계약) + **글 이동 stale 캐시 방어**
 *
 * ── 왜 단위 테스트인가 ────────────────────────────────────────
 *  production 에서 `/community/{humor,life2,menopause}/<stories-slug>` 이 9/9 **HTTP 500**
 *  이었다(`x-matched-path: /500`). 상세 라우트가 `dynamic = 'force-static'` 이라
 *  `generateMetadata` 안의 `permanentRedirect()` 가 정적 생성 중 redirect 가 되어 터진다.
 *  308 을 middleware 로 옮겼다.
 *
 *  🔴 Preview 에서는 이 경로를 **실측할 수 없다**: Vercel Preview 환경에
 *     `NEXT_PUBLIC_SUPABASE_URL` 이 없어(2026-09-16 probe 헤더로 확인:
 *     has-supabase-url=0 · has-service-key=1) 보드 조회가 항상 실패한다.
 *     같은 이유로 기존 CUID→slug REST fallback 도 Preview 에서는 죽어 있고,
 *     Redis 캐시가 더워 있을 때만 301 이 나온다(그래서 되는 것처럼 보였다).
 *     → 조회가 성공했을 때의 응답 계약을 여기서 고정한다.
 *
 * ── 🔴 P1: 글 이동 후 stale 캐시 ──────────────────────────────
 *  `board:<slug>` 는 24시간 캐시다. 글이 STORY → MENOPAUSE 로 이동하면 캐시는
 *  한동안 STORY 를 들고 있다. 캐시로 redirect 를 만들면 **새 정본 URL 을 옛 주소로
 *  308** 하는 최악의 사고가 난다. 그래서 설계를 바꿨다:
 *    · 캐시는 "URL 보드와 같으니 교정 불필요" 판정에만 쓴다
 *    · 308 은 **언제나 갓 읽은 값**(`fetchBoardType`)으로만 만든다
 *  → stale 캐시가 만들 수 있는 최악은 "교정 누락"이고, 잘못된 308 은 구조적으로 불가능하다.
 *  여기에 `adminMovePost` 의 명시적 무효화가 더해진다(2중 방어).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 키별로 값을 기억하는 Redis 대역 — `slug:` 와 `board:` 를 함께 쓰므로 키를 구분해야 한다 */
const store = new Map<string, string>()
const redisGet = vi.fn(async (k: string) => store.get(k) ?? null)
const redisSet = vi.fn(async (k: string, v: string) => { store.set(k, v); return 'OK' })
const redisDel = vi.fn(async (k: string) => { store.delete(k); return 1 })
vi.mock('@upstash/redis', () => ({
  Redis: class { get = redisGet; set = redisSet; del = redisDel },
}))
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }))
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: vi.fn(async () => null) }))

const ORIGIN = 'https://age-doesnt-matter.com'
// 🔴 `moved-posts.ts` 정적 맵에 없는 slug 이어야 한다 — 거기 있으면 이 블록이 아니라
//    middleware 의 moved-posts 308 이 먼저 걸려 **테스트가 거짓 통과**한다(2026-09-16에 밟음).
const SLUG = '우리-또래-이야기-계약-테스트용-글'
const ENC = encodeURIComponent(SLUG)
const CACHE_KEY = `board:${SLUG}`

async function run(path: string) {
  const { NextRequest } = await import('next/server')
  const mw = (await import('@/middleware')).default
  return mw(new NextRequest(new URL(path, ORIGIN), { headers: { 'x-bot-type': 'test' } }))
}

/** DB(권위 있는 소스)가 돌려줄 값 */
function mockDb(boardType: string | null, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    json: async () => (boardType ? [{ boardType }] : []),
  })))
}

beforeEach(() => {
  vi.resetModules()
  store.clear()
  // 🔴 `mockClear()` 는 호출 기록만 지우고 **구현은 남긴다.**
  //    앞 테스트의 `mockRejectedValue`(Redis 장애 시뮬레이션)가 뒤 테스트로 새어
  //    "비용 계약" 테스트가 엉뚱하게 실패했다(2026-09-16). 구현까지 다시 심는다.
  redisGet.mockReset().mockImplementation(async (k: string) => store.get(k) ?? null)
  redisSet.mockReset().mockImplementation(async (k: string, v: string) => { store.set(k, v); return 'OK' })
  redisDel.mockReset().mockImplementation(async (k: string) => { store.delete(k); return 1 })
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('크로스보드 308 — 기본 계약', () => {
  it('🔴 STORY 글을 humor URL 로 열면 308 + 정본 Location', async () => {
    mockDb('STORY')
    const res = await run(`/community/humor/${ENC}`)
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/community/stories/${ENC}`)
  })

  it('🔴 life2·menopause URL 도 같은 정본으로 308', async () => {
    for (const wrong of ['life2', 'menopause']) {
      vi.resetModules(); store.clear(); mockDb('STORY')
      const res = await run(`/community/${wrong}/${ENC}`)
      expect(res.status, wrong).toBe(308)
      expect(res.headers.get('location'), wrong).toBe(`${ORIGIN}/community/stories/${ENC}`)
    }
  })

  it('🔴 308 Location 은 ASCII 이고 %25 이중 인코딩이 없다', async () => {
    mockDb('STORY')
    const loc = (await run(`/community/humor/${ENC}`)).headers.get('location')!
    expect(/[^\x20-\x7E]/.test(loc), loc).toBe(false)
    expect(loc.includes('%25'), loc).toBe(false)
    expect(decodeURI(loc)).toBe(`${ORIGIN}/community/stories/${SLUG}`)
  })

  it('정본 보드로 열면 redirect 하지 않는다 — 정상 트래픽 무영향', async () => {
    mockDb('STORY')
    const res = await run(`/community/stories/${ENC}`)
    expect(res.status).not.toBe(308)
    expect(res.headers.get('location')).toBeNull()
  })

  it('CUID 세그먼트는 기존 CUID→slug 경로가 처리한다', async () => {
    store.set('slug:cmr32xatf0001003gurqjtfxr', SLUG)
    mockDb('STORY')
    const res = await run('/community/humor/cmr32xatf0001003gurqjtfxr')
    expect(res.status).toBe(301)
  })
})

describe('🔴 P1 — 글 이동 후 stale 캐시(STORY로 캐시된 글을 MENOPAUSE로 이동)', () => {
  /** `adminMovePost` 가 이동 직후 하는 일 — 캐시 무효화 */
  async function runMove() {
    const { invalidateCachedBoardType } = await import('@/lib/seo/board-slug-cache')
    await invalidateCachedBoardType(SLUG)
  }

  beforeEach(() => {
    store.set(CACHE_KEY, 'STORY') // 이동 전에 더워진 캐시
    mockDb('MENOPAUSE')           // DB 는 이미 MENOPAUSE 로 이동 완료
  })

  it('🔴 새 정본 URL 이 옛 stories 주소로 redirect 되면 안 된다 (무효화 전이어도)', async () => {
    const res = await run(`/community/menopause/${ENC}`)
    expect(res.status, '정본 URL 을 옛 주소로 밀어냈다').not.toBe(308)
    expect(res.headers.get('location')).toBeNull()
  })

  it('🔴 이동(무효화) 후 옛 /community/stories/<slug> 가 새 menopause 주소로 수렴한다', async () => {
    await runMove()
    expect(store.has(CACHE_KEY), '무효화가 캐시를 지우지 않았다').toBe(false)
    const res = await run(`/community/stories/${ENC}`)
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/community/menopause/${ENC}`)
  })

  it('수렴 Location 은 ASCII 이고 %25 이중 인코딩이 없다', async () => {
    await runMove()
    const loc = (await run(`/community/stories/${ENC}`)).headers.get('location')!
    expect(/[^\x20-\x7E]/.test(loc), loc).toBe(false)
    expect(loc.includes('%25'), loc).toBe(false)
    expect(decodeURI(loc)).toBe(`${ORIGIN}/community/menopause/${SLUG}`)
  })

  it('무효화가 실패해도(Redis del 예외) 이동 자체를 막지 않는다', async () => {
    redisDel.mockRejectedValue(new Error('redis down'))
    await expect(runMove()).resolves.toBeUndefined()
  })

  it('🔴 무효화가 실패해도 잘못된 308 을 내지 않는다 — 최악은 "교정 누락"이다', async () => {
    redisDel.mockRejectedValue(new Error('redis down'))
    await runMove()
    const res = await run(`/community/menopause/${ENC}`)
    expect(res.status).not.toBe(308)
    expect(res.headers.get('location')).toBeNull()
  })

  it('무효화가 실패해도 정본 URL 방문 한 번이면 캐시가 스스로 고쳐지고, 그 뒤 옛 URL 이 수렴한다', async () => {
    redisDel.mockRejectedValue(new Error('redis down'))
    await runMove()
    await run(`/community/menopause/${ENC}`)      // 정본 방문 → 갓 읽은 값으로 캐시 교체
    expect(store.get(CACHE_KEY)).toBe('MENOPAUSE')
    vi.resetModules()
    const res = await run(`/community/stories/${ENC}`)
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/community/menopause/${ENC}`)
  })

  it('🔴 Redis 가 통째로 죽어도(read·write 전부 예외) 잘못된 308 이 없고 옛 URL 은 수렴한다', async () => {
    redisGet.mockRejectedValue(new Error('redis down'))
    redisSet.mockRejectedValue(new Error('redis down'))
    const canonical = await run(`/community/menopause/${ENC}`)
    expect(canonical.status).not.toBe(308)
    vi.resetModules()
    const old = await run(`/community/stories/${ENC}`)
    expect(old.status).toBe(308)
    expect(old.headers.get('location')).toBe(`${ORIGIN}/community/menopause/${ENC}`)
  })
})

describe('캐시 사용 계약 — 308 은 절대 캐시로 만들지 않는다', () => {
  it('URL 보드와 캐시가 일치하면 REST 를 치지 않는다 (비용 계약)', async () => {
    store.set(CACHE_KEY, 'STORY')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await run(`/community/stories/${ENC}`)
    expect(res.status).not.toBe(308)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('🔴 캐시가 어긋나면 반드시 권위 있는 값을 새로 읽는다', async () => {
    store.set(CACHE_KEY, 'STORY')
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => [{ boardType: 'MENOPAUSE' }] }))
    vi.stubGlobal('fetch', fetchSpy)
    await run(`/community/humor/${ENC}`)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('조회 실패(REST !ok)는 fail-open — 500 대신 통과', async () => {
    mockDb(null, false)
    const res = await run(`/community/humor/${ENC}`)
    expect(res.status).not.toBe(308)
    expect(res.status).toBeLessThan(400)
  })

  it('조회 실패는 캐시하지 않는다 — 일시 장애가 굳지 않는다', async () => {
    mockDb(null, false)
    await run(`/community/humor/${ENC}`)
    expect(redisSet).not.toHaveBeenCalledWith(CACHE_KEY, expect.anything(), expect.anything())
  })

  it('없는 글(200 + 빈 배열)은 짧은 TTL 로만 캐시한다', async () => {
    mockDb(null, true)
    await run(`/community/humor/${ENC}`)
    expect(redisSet).toHaveBeenCalledWith(CACHE_KEY, '', { ex: 300 })
  })

  it('찾은 보드 캐시 TTL 은 1시간 — 무효화 실패 시 수렴 상한이다', async () => {
    mockDb('STORY')
    await run(`/community/humor/${ENC}`)
    expect(redisSet).toHaveBeenCalledWith(CACHE_KEY, 'STORY', { ex: 3600 })
  })
})
