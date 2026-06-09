import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
}))

import { getMemberList } from '@/lib/queries/admin/admin.members'
import { prisma } from '@/lib/prisma'

const mockFindMany = vi.mocked(prisma.user.findMany)

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue([] as never)
})

function lastFindManyArg() {
  return mockFindMany.mock.calls[0][0] as {
    orderBy: unknown
    skip: number
    take: number
  }
}

describe('getMemberList 정렬/페이지네이션', () => {
  it('기본값: createdAt desc + tie-breaker id desc, page1(skip 0)', async () => {
    const r = await getMemberList()
    const arg = lastFindManyArg()
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(arg.skip).toBe(0)
    expect(arg.take).toBe(21) // limit(20) + 1
    expect(r.sort).toBe('createdAt')
    expect(r.order).toBe('desc')
    expect(r.page).toBe(1)
  })

  it('허용 컬럼(postCount asc) 정렬 반영', async () => {
    await getMemberList({ sort: 'postCount', order: 'asc' })
    expect(lastFindManyArg().orderBy).toEqual([{ postCount: 'asc' }, { id: 'desc' }])
  })

  it('허용 컬럼 5개 모두 통과', async () => {
    for (const f of ['postCount', 'commentCount', 'receivedLikes', 'lastLoginAt', 'createdAt']) {
      vi.clearAllMocks()
      mockFindMany.mockResolvedValue([] as never)
      const r = await getMemberList({ sort: f })
      expect(r.sort).toBe(f)
    }
  })

  it('허용 외 sort는 createdAt으로 강제(화이트리스트)', async () => {
    const r = await getMemberList({ sort: 'email; DROP TABLE' })
    expect(r.sort).toBe('createdAt')
    expect(lastFindManyArg().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
  })

  it('잘못된 order는 desc로 강제', async () => {
    const r = await getMemberList({ sort: 'postCount', order: 'sideways' })
    expect(r.order).toBe('desc')
  })

  it('page=3 → skip = (3-1)*20 = 40', async () => {
    const r = await getMemberList({ page: 3 })
    expect(lastFindManyArg().skip).toBe(40)
    expect(r.page).toBe(3)
  })

  it('page=0/음수는 1로 보정', async () => {
    const r = await getMemberList({ page: 0 })
    expect(r.page).toBe(1)
    expect(lastFindManyArg().skip).toBe(0)
  })

  it('hasMore: limit+1개 오면 true이고 초과분은 제거', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `u${i}` }))
    mockFindMany.mockResolvedValue(rows as never)
    const r = await getMemberList()
    expect(r.hasMore).toBe(true)
    expect(r.users).toHaveLength(20)
  })

  it('hasMore: limit 이하면 false', async () => {
    mockFindMany.mockResolvedValue(Array.from({ length: 5 }, (_, i) => ({ id: `u${i}` })) as never)
    const r = await getMemberList()
    expect(r.hasMore).toBe(false)
    expect(r.users).toHaveLength(5)
  })
})
