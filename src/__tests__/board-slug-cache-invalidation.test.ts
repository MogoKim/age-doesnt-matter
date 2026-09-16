/**
 * slug → 보드 캐시 무효화 계약 (P1)
 *
 * 글이 다른 보드로 이동하면(`adminMovePost`) `board:<slug>` 캐시가 옛 보드를 들고 있게 된다.
 * middleware 설계상 그것만으로 잘못된 308 이 나가지는 않지만(308 은 갓 읽은 값으로만 만든다),
 * **교정이 최대 TTL 만큼 늦어진다.** 그래서 이동 시점에 캐시를 즉시 버린다 — 2중 방어의 앞단이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const store = new Map<string, string>()
const redisDel = vi.fn(async (k: string) => { store.delete(k); return 1 })
vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = vi.fn(async (k: string) => store.get(k) ?? null)
    set = vi.fn(async (k: string, v: string) => { store.set(k, v); return 'OK' })
    del = redisDel
  },
}))

const SLUG = '우리-또래-이야기-계약-테스트용-글'

describe('invalidateCachedBoardType', () => {
  beforeEach(() => { store.clear(); redisDel.mockReset().mockImplementation(async (k: string) => { store.delete(k); return 1 }) })

  it('🔴 캐시 키를 정확히 지운다', async () => {
    const { invalidateCachedBoardType, BOARD_CACHE_PREFIX } = await import('@/lib/seo/board-slug-cache')
    store.set(`${BOARD_CACHE_PREFIX}${SLUG}`, 'STORY')
    await invalidateCachedBoardType(SLUG)
    expect(redisDel).toHaveBeenCalledWith(`${BOARD_CACHE_PREFIX}${SLUG}`)
    expect(store.has(`${BOARD_CACHE_PREFIX}${SLUG}`)).toBe(false)
  })

  it('slug 이 없으면(=매거진·일자리처럼 slug 없는 글) 아무것도 하지 않는다', async () => {
    const { invalidateCachedBoardType } = await import('@/lib/seo/board-slug-cache')
    await invalidateCachedBoardType(null)
    await invalidateCachedBoardType(undefined)
    await invalidateCachedBoardType('')
    expect(redisDel).not.toHaveBeenCalled()
  })

  it('🔴 Redis 장애를 삼킨다 — 이동 자체를 실패시키면 안 된다', async () => {
    redisDel.mockRejectedValue(new Error('redis down'))
    const { invalidateCachedBoardType } = await import('@/lib/seo/board-slug-cache')
    await expect(invalidateCachedBoardType(SLUG)).resolves.toBeUndefined()
  })
})

describe('adminMovePost 가 무효화를 부른다 (소스 계약)', () => {
  // 소스 문자열 검사인 이유: adminMovePost 는 requireAdmin·prisma·revalidate 에 묶여 있어
  // 단위 호출이 무겁다. "이동 경로에 무효화가 연결돼 있다"만 가볍게 고정한다.
  const SRC = readFileSync(resolve(__dirname, '../lib/actions/admin/admin.content.ts'), 'utf8')
  const MOVE = SRC.slice(SRC.indexOf('export async function adminMovePost'))

  it('🔴 이동 후 invalidateCachedBoardType 을 await 한다', () => {
    expect(MOVE).toMatch(/await\s+invalidateCachedBoardType\(/)
  })

  it('🔴 옛 slug 로 무효화한다 — 새 보드가 아니라 URL 정체성인 slug 이 키다', () => {
    expect(MOVE).toContain('invalidateCachedBoardType(existing.slug)')
  })

  it('무효화가 boardType UPDATE 뒤에 온다 — 먼저 지우면 그 사이 요청이 옛 값을 다시 캐시한다', () => {
    const update = MOVE.indexOf('data: { boardType, category: normalizedCategory }')
    const invalidate = MOVE.indexOf('invalidateCachedBoardType(existing.slug)')
    expect(update).toBeGreaterThan(-1)
    expect(invalidate).toBeGreaterThan(update)
  })
})
