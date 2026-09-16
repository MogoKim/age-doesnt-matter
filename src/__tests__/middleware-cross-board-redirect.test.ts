/**
 * 크로스보드 상세 URL → **HTTP 308** (middleware 계약)
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
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const redisGet = vi.fn()
const redisSet = vi.fn(() => Promise.resolve('OK'))
vi.mock('@upstash/redis', () => ({
  Redis: class { get = redisGet; set = redisSet },
}))
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }))
vi.mock('@/lib/admin-auth', () => ({ verifyAdminToken: vi.fn(async () => null) }))

const ORIGIN = 'https://age-doesnt-matter.com'
const SLUG = '아이폰듀오-삼백만원-주고-사면-주책'

async function run(path: string) {
  const { NextRequest } = await import('next/server')
  const mw = (await import('@/middleware')).default
  return mw(new NextRequest(new URL(path, ORIGIN), { headers: { 'x-bot-type': 'test' } }))
}

/** Supabase REST 응답을 흉내낸다 — 이 글은 STORY 보드에 있다. */
function mockBoardLookup(boardType: string | null, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    json: async () => (boardType ? [{ boardType }] : []),
  })))
}

describe('middleware — 크로스보드 308', () => {
  beforeEach(() => {
    vi.resetModules()
    redisGet.mockReset(); redisSet.mockClear()
    redisGet.mockResolvedValue(null) // 캐시 miss → REST 경로
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  it('🔴 STORY 글을 humor URL 로 열면 308 + 정본 Location', async () => {
    mockBoardLookup('STORY')
    const res = await run(`/community/humor/${encodeURIComponent(SLUG)}`)
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/community/stories/${encodeURIComponent(SLUG)}`)
  })

  it('🔴 life2·menopause URL 도 같은 정본으로 308', async () => {
    for (const wrong of ['life2', 'menopause']) {
      vi.resetModules(); mockBoardLookup('STORY')
      const res = await run(`/community/${wrong}/${encodeURIComponent(SLUG)}`)
      expect(res.status, wrong).toBe(308)
      expect(res.headers.get('location'), wrong).toBe(`${ORIGIN}/community/stories/${encodeURIComponent(SLUG)}`)
    }
  })

  it('🔴 Location 은 ASCII 다 — raw 한글도 %25 이중 인코딩도 없다', async () => {
    mockBoardLookup('STORY')
    const loc = (await run(`/community/humor/${encodeURIComponent(SLUG)}`)).headers.get('location')!
    expect(/[^\x20-\x7E]/.test(loc)).toBe(false)
    expect(loc.includes('%25')).toBe(false)
    expect(decodeURI(loc)).toBe(`${ORIGIN}/community/stories/${SLUG}`)
  })

  it('정본 보드로 열면 redirect 하지 않는다 — 정상 트래픽에 영향 없음', async () => {
    mockBoardLookup('STORY')
    const res = await run(`/community/stories/${encodeURIComponent(SLUG)}`)
    expect(res.status).not.toBe(308)
    expect(res.headers.get('location')).toBeNull()
  })

  it('조회 실패(REST !ok)는 통과시킨다 — 500 대신 200 (fail-open)', async () => {
    mockBoardLookup(null, false)
    const res = await run(`/community/humor/${encodeURIComponent(SLUG)}`)
    expect(res.status).not.toBe(308)
    expect(res.status).toBeLessThan(400)
  })

  it('조회 실패는 캐시하지 않는다 — 일시 장애가 24h 굳지 않는다', async () => {
    mockBoardLookup(null, false)
    await run(`/community/humor/${encodeURIComponent(SLUG)}`)
    expect(redisSet).not.toHaveBeenCalled()
  })

  it('없는 글(200 + 빈 배열)은 짧은 TTL 로만 캐시한다', async () => {
    mockBoardLookup(null, true)
    await run(`/community/humor/${encodeURIComponent(SLUG)}`)
    expect(redisSet).toHaveBeenCalledWith(expect.stringContaining('board:'), '', { ex: 300 })
  })

  it('찾은 보드는 24h 캐시한다', async () => {
    mockBoardLookup('STORY')
    await run(`/community/humor/${encodeURIComponent(SLUG)}`)
    expect(redisSet).toHaveBeenCalledWith(expect.stringContaining('board:'), 'STORY', { ex: 86400 })
  })

  it('캐시 적중 시 REST 를 호출하지 않는다 — 비용 계약', async () => {
    redisGet.mockResolvedValue('STORY')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await run(`/community/humor/${encodeURIComponent(SLUG)}`)
    expect(res.status).toBe(308)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('CUID 세그먼트는 이 블록이 건드리지 않는다 (기존 CUID→slug 경로 보존)', async () => {
    redisGet.mockResolvedValue('이마트-계란값-비교')
    const res = await run('/community/humor/cmomh67bu0006sf3fwrmhq0it')
    expect(res.status).toBe(301) // 기존 CUID→slug 계약
  })
})
